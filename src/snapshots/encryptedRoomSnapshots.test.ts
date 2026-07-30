import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { MatrixProvider } from "../MatrixProvider";
import { FakeHomeserver } from "../test-utils/fakeHomeserver";
import {
  decryptAttachment,
  encryptAttachment,
} from "./attachmentCrypto";
import {
  defaultMediaTransport,
  detectRoomEncryption,
} from "./mediaTransport";
import { SNAPSHOT_V2_EVENT_TYPE } from "./snapshotV2";

const providers: MatrixProvider[] = [];

afterEach(() => {
  while (providers.length) {
    providers.pop()!.dispose();
  }
});

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

describe("attachment crypto (Matrix m.encrypted_file v2)", () => {
  it("round-trips", async () => {
    const plaintext = new Uint8Array(5000).map((_, i) => i % 251);
    const { ciphertext, info } = await encryptAttachment(plaintext);

    expect(bytesEqual(ciphertext, plaintext)).toBe(false);
    expect(info.v).toBe("v2");
    expect(info.key.alg).toBe("A256CTR");
    expect(info.hashes.sha256).toBeTruthy();

    const decrypted = await decryptAttachment(ciphertext, info);
    expect(bytesEqual(decrypted, plaintext)).toBe(true);
  });

  it("rejects a tampered ciphertext instead of returning garbage", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
    const { ciphertext, info } = await encryptAttachment(plaintext);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] = tampered[0] ^ 0xff;

    await expect(decryptAttachment(tampered, info)).rejects.toThrow(
      /integrity/
    );
  });
});

describe("room encryption detection", () => {
  it("reports encrypted rooms from server state", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!enc:fake", { encrypted: true });
    const client = hs.createClient();
    expect(await detectRoomEncryption(client as any, roomId)).toBe("encrypted");
  });

  it("reports unencrypted only on a definitive M_NOT_FOUND", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!plain:fake");
    const client = hs.createClient();
    expect(await detectRoomEncryption(client as any, roomId)).toBe(
      "unencrypted"
    );
  });

  it("reports unknown when state cannot be read, so callers fail closed", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!forbidden:fake");
    const client: any = hs.createClient();
    client.getStateEvent = async () => {
      const err: any = new Error("forbidden");
      err.errcode = "M_FORBIDDEN";
      throw err;
    };
    expect(await detectRoomEncryption(client, roomId)).toBe("unknown");
  });
});

describe("media transport", () => {
  it("uploads plaintext in an unencrypted room, with an integrity hash", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!plain:fake");
    const client = hs.createClient();
    const bytes = new Uint8Array([9, 8, 7, 6, 5]);

    const upload = await defaultMediaTransport.upload(
      client as any,
      roomId,
      bytes
    );
    expect(upload.file).toBeUndefined();
    expect(upload.sha256).toBeTruthy();
    expect(bytesEqual(hs.media.get(upload.mxcUrl)!, bytes)).toBe(true);

    const downloaded = await defaultMediaTransport.download(client as any, upload);
    expect(bytesEqual(downloaded, bytes)).toBe(true);

    hs.tamperedMedia.set(upload.mxcUrl, new Uint8Array([1, 2, 3]));
    await expect(
      defaultMediaTransport.download(client as any, upload)
    ).rejects.toThrow(/integrity/);
  });

  it("never uploads a plaintext document to an encrypted room's media repo", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!enc:fake", { encrypted: true });
    const client = hs.createClient();

    const doc = new Y.Doc();
    doc.getText("body").insert(0, "secret contents of the flow document");
    const bytes = Y.encodeStateAsUpdate(doc);

    const upload = await defaultMediaTransport.upload(
      client as any,
      roomId,
      bytes
    );

    expect(upload.file).toBeDefined();
    expect(upload.file!.url).toBe(upload.mxcUrl);
    const stored = hs.media.get(upload.mxcUrl)!;
    expect(bytesEqual(stored, bytes)).toBe(false);
    // the plaintext must not be recoverable from the media repo alone
    expect(Buffer.from(stored).includes(Buffer.from("secret contents"))).toBe(
      false
    );

    const downloaded = await defaultMediaTransport.download(
      client as any,
      upload
    );
    expect(bytesEqual(downloaded, bytes)).toBe(true);
  });

  it("fails closed and encrypts when room encryption cannot be determined", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!unknown:fake");
    const client: any = hs.createClient();
    client.getStateEvent = async () => {
      const err: any = new Error("network");
      throw err;
    };

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const upload = await defaultMediaTransport.upload(client, roomId, bytes);
    expect(upload.file).toBeDefined();
    expect(bytesEqual(hs.media.get(upload.mxcUrl)!, bytes)).toBe(false);
  });

  it("falls back to the legacy media endpoint on servers without authenticated media", async () => {
    const hs = new FakeHomeserver();
    hs.authenticatedMediaSupported = false;
    const roomId = hs.createRoom("!oldserver:fake");
    const client = hs.createClient();
    const bytes = new Uint8Array([4, 5, 6]);

    const upload = await defaultMediaTransport.upload(
      client as any,
      roomId,
      bytes
    );
    const downloaded = await defaultMediaTransport.download(
      client as any,
      upload
    );
    expect(bytesEqual(downloaded, bytes)).toBe(true);
  });
});

describe("end to end in an encrypted room", () => {
  it("round-trips an encrypted media snapshot", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!e2e:fake", { encrypted: true });
    const client = hs.createClient("@alice:fake");
    const translator = new MatrixCRDTEventTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
    });

    const source = new Y.Doc();
    const updates: Uint8Array[] = [];
    source.on("update", (u: Uint8Array) => updates.push(u));
    source.getText("body").insert(0, "encrypted room contents");

    for (const update of updates) {
      await translator.sendUpdate(client as any, roomId, update);
    }
    const lastEventId = hs.getRoom(roomId).events.slice(-1)[0].event_id;
    await translator.sendSnapshots(
      client as any,
      roomId,
      Y.encodeStateAsUpdate(source),
      lastEventId,
      { roomIsEncrypted: true }
    );

    const snapshotEvents = hs.eventsOfType(roomId, SNAPSHOT_V2_EVENT_TYPE);
    expect(snapshotEvents).toHaveLength(1);
    expect(snapshotEvents[0].content.file).toBeDefined();
    // the pointer stays constant-size: no document bytes in the event
    expect(JSON.stringify(snapshotEvents[0].content).length).toBeLessThan(1000);

    const doc = new Y.Doc();
    const provider = new MatrixProvider(doc, hs.createClient("@bob:fake") as any, {
      type: "id",
      id: roomId,
    });
    providers.push(provider);
    await provider.initialize();

    expect(doc.getText("body").toString()).toBe("encrypted room contents");
    expect(provider.snapshotDegradations).toHaveLength(0);
  });
});
