import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  INLINE_SNAPSHOT_MAX_BYTES,
  MatrixCRDTEventTranslator,
} from "../MatrixCRDTEventTranslator";
import { MatrixProvider } from "../MatrixProvider";
import { SnapshotDegradation, SnapshotUnavailableError } from "../reader/MatrixReader";
import {
  FakeHomeserver,
  FakeMatrixClient,
  MAX_EVENT_SIZE,
} from "../test-utils/fakeHomeserver";
import {
  legacyCatchUp,
  legacyProcessIncomingEvents,
} from "../test-utils/legacyClient";
import { SNAPSHOT_V2_EVENT_TYPE } from "./snapshotV2";

const LEGACY_SNAPSHOT_EVENT_TYPE = "matrix-crdt.doc_snapshot";
const UPDATE_EVENT_TYPE = "matrix-crdt.doc_update";

const providers: MatrixProvider[] = [];

afterEach(() => {
  while (providers.length) {
    providers.pop()!.dispose();
  }
});

/**
 * Writes a room's history the way a real client would: one `doc_update` event
 * per local change, plus snapshots on demand.
 */
class RoomWriter {
  public readonly doc = new Y.Doc();
  private pending: Uint8Array[] = [];
  public lastEventId = "";

  public constructor(
    private readonly hs: FakeHomeserver,
    private readonly client: FakeMatrixClient,
    private readonly roomId: string,
    private readonly translator: MatrixCRDTEventTranslator
  ) {
    this.doc.on("update", (update: Uint8Array) => {
      this.pending.push(update);
    });
  }

  public async change(fn: (doc: Y.Doc) => void) {
    fn(this.doc);
    const pending = this.pending;
    this.pending = [];
    for (const update of pending) {
      await this.translator.sendUpdate(this.client as any, this.roomId, update);
      this.lastEventId = this.hs.getRoom(this.roomId).events.slice(-1)[0]
        .event_id;
    }
  }

  public get stateUpdate() {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** publish snapshots per the translator's configured policy */
  public async snapshot(opts: { roomIsEncrypted?: boolean } = {}) {
    return this.translator.sendSnapshots(
      this.client as any,
      this.roomId,
      this.stateUpdate,
      this.lastEventId,
      opts
    );
  }
}

function newTranslator(opts: Partial<{ enableMediaSnapshots: boolean; keepLegacyInlineSnapshots: boolean }> = {}) {
  return new MatrixCRDTEventTranslator(opts);
}

/** Catch up as a current-build client, through the real MatrixProvider. */
async function currentClientCatchUp(
  hs: FakeHomeserver,
  roomId: string,
  translatorOpts: any = {}
) {
  const client = hs.createClient("@newbuild:fake");
  const doc = new Y.Doc();
  const provider = new MatrixProvider(
    doc,
    client as any,
    { type: "id", id: roomId },
    { translator: translatorOpts }
  );
  providers.push(provider);
  const degradations: SnapshotDegradation[] = [];
  provider.onSnapshotDegraded((d) => degradations.push(d));
  await provider.initialize();
  return { doc, provider, degradations, client };
}

function bodyOf(doc: Y.Doc) {
  return doc.getText("body").toString();
}

/** Build a document larger than a single Matrix event can ever hold. */
async function writeOversizedRoom(hs: FakeHomeserver, roomId: string, translator: MatrixCRDTEventTranslator) {
  const client = hs.createClient("@alice:fake");
  const writer = new RoomWriter(hs, client, roomId, translator);
  // 40 x 5 KB chunks: every individual update event fits comfortably, the
  // accumulated document does not.
  for (let i = 0; i < 40; i++) {
    await writer.change((doc) => {
      doc.getText("body").insert(doc.getText("body").length, "x".repeat(5000));
    });
  }
  return { writer, client };
}

describe("media-backed snapshots (v2)", () => {
  it("refuses a configuration where v2 shares the legacy snapshot event type", () => {
    expect(
      () =>
        new MatrixCRDTEventTranslator({
          snapshotV2EventType: LEGACY_SNAPSHOT_EVENT_TYPE,
        })
    ).toThrow(/must differ/);
  });

  it("does not write v2 snapshots by default (readers before writers)", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!default:fake");
    const client = hs.createClient("@alice:fake");
    // the *shipped* default, not an option we pass in
    const translator = new MatrixCRDTEventTranslator();
    expect(translator.mediaSnapshotsEnabled).toBe(false);

    const writer = new RoomWriter(hs, client, roomId, translator);
    await writer.change((doc) => doc.getText("body").insert(0, "hello"));
    const result = await writer.snapshot();

    expect(result.v2.sent).toBe(false);
    expect(result.legacy.sent).toBe(true);
    expect(hs.eventsOfType(roomId, SNAPSHOT_V2_EVENT_TYPE)).toHaveLength(0);
    expect(hs.eventsOfType(roomId, LEGACY_SNAPSHOT_EVENT_TYPE)).toHaveLength(1);
    expect(hs.uploadCount).toBe(0);
  });

  it("a >64 KiB document cannot be snapshotted inline but round-trips through media", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!big:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const { writer, client } = await writeOversizedRoom(hs, roomId, translator);

    const stateSize = writer.stateUpdate.length;
    expect(stateSize).toBeGreaterThan(MAX_EVENT_SIZE);

    // Prove the ceiling is real: the legacy inline snapshot is rejected outright.
    await expect(
      translator.sendSnapshot(
        client as any,
        roomId,
        writer.stateUpdate,
        writer.lastEventId
      )
    ).rejects.toThrow(/too large/);

    const result = await writer.snapshot();
    expect(result.v2.sent).toBe(true);
    expect(result.legacy.sent).toBe(false);
    expect(result.legacy.skippedTooLarge).toBe(true);

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(0);
    expect(bodyOf(doc)).toEqual(bodyOf(writer.doc));
    expect(bodyOf(doc).length).toBe(200000);
    expect(hs.downloadCount).toBeGreaterThan(0);
  }, 30000);

  it("a legacy-only room still loads on a current-build client", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!legacyonly:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator();
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    await writer.snapshot();
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(0);
    expect(bodyOf(doc)).toEqual("one-two");
  });

  it("a mixed room resolves to the newest readable snapshot for each client generation", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!mixed:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "a"));
    // legacy-only snapshot (old generation)
    await newTranslator().sendSnapshots(
      client as any,
      roomId,
      writer.stateUpdate,
      writer.lastEventId
    );
    await writer.change((doc) => doc.getText("body").insert(1, "b"));
    // dual snapshot: v2 + legacy inline
    const dual = await writer.snapshot();
    expect(dual.v2.sent).toBe(true);
    expect(dual.legacy.sent).toBe(true);
    await writer.change((doc) => doc.getText("body").insert(2, "c"));

    expect(hs.eventsOfType(roomId, LEGACY_SNAPSHOT_EVENT_TYPE)).toHaveLength(2);
    expect(hs.eventsOfType(roomId, SNAPSHOT_V2_EVENT_TYPE)).toHaveLength(1);

    const current = await currentClientCatchUp(hs, roomId);
    expect(bodyOf(current.doc)).toEqual("abc");
    // The dual snapshot's legacy half is the newest event of the two and is
    // readable without a network round trip, so no media was fetched.
    expect(hs.downloadCount).toBe(0);

    const legacy = await legacyCatchUp(client, roomId);
    expect(legacy.error).toBeUndefined();
    expect(bodyOf(legacy.doc)).toEqual("abc");
  });

  it("live v2 pointers do not trigger a media fetch", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!live:fake");
    const writerClient = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, writerClient, roomId, translator);
    await writer.change((doc) => doc.getText("body").insert(0, "start"));

    const { doc } = await currentClientCatchUp(hs, roomId);
    const downloadsAfterCatchUp = hs.downloadCount;

    await writer.change((doc2) => doc2.getText("body").insert(5, "-more"));
    await writer.snapshot();

    // let the poll loop deliver both the update and the v2 pointer
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(bodyOf(doc)).toEqual("start-more");
    expect(hs.downloadCount).toBe(downloadsAfterCatchUp);
  }, 20000);
});

describe("old-build clients in a room containing v2 snapshots", () => {
  it("loads the correct document when v2 and legacy inline snapshots coexist", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!dual:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "hello"));
    const result = await writer.snapshot();
    expect(result.v2.sent).toBe(true);
    expect(result.legacy.sent).toBe(true);
    await writer.change((doc) => doc.getText("body").insert(5, " world"));

    const legacy = await legacyCatchUp(client, roomId);
    expect(legacy.error).toBeUndefined();
    expect(bodyOf(legacy.doc)).toEqual("hello world");
  });

  it("keeps its catch-up shortcut thanks to the parallel legacy snapshot", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!shortcut:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, client, roomId, translator);

    // more than one page (30) of update events, so stopping early is observable
    for (let i = 0; i < 40; i++) {
      await writer.change((doc) =>
        doc.getText("body").insert(doc.getText("body").length, `${i},`)
      );
    }
    const result = await writer.snapshot();
    expect(result.v2.sent).toBe(true);
    expect(result.legacy.sent).toBe(true);
    await writer.change((doc) => doc.getText("body").insert(0, "TAIL:"));

    hs.messagesRequestCount = 0;
    const legacy = await legacyCatchUp(client, roomId);
    expect(legacy.error).toBeUndefined();
    expect(bodyOf(legacy.doc)).toEqual(bodyOf(writer.doc));
    // one page: it found the legacy snapshot and stopped, rather than walking
    // back to room genesis
    expect(hs.messagesRequestCount).toBe(1);
    expect(legacy.eventsUsed).toBeLessThan(10);
  }, 20000);

  it("loads the correct document from a room with ONLY v2 snapshots", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!v2only:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const { writer, client } = await writeOversizedRoom(hs, roomId, translator);

    const result = await writer.snapshot();
    expect(result.v2.sent).toBe(true);
    // document exceeds the inline ceiling, so there is no legacy snapshot at all
    expect(result.legacy.sent).toBe(false);
    expect(hs.eventsOfType(roomId, LEGACY_SNAPSHOT_EVENT_TYPE)).toHaveLength(0);
    expect(hs.eventsOfType(roomId, SNAPSHOT_V2_EVENT_TYPE)).toHaveLength(1);

    await writer.change((doc) => doc.getText("body").insert(0, "PREFIX:"));

    // The old build sees an event type it has never heard of, skips it, and
    // paginates all the way back to room genesis. Slow, but complete — this is
    // the failure mode the new event type exists to prevent.
    const legacy = await legacyCatchUp(client, roomId);
    expect(legacy.error).toBeUndefined();
    expect(bodyOf(legacy.doc)).toEqual(bodyOf(writer.doc));
    expect(bodyOf(legacy.doc).startsWith("PREFIX:")).toBe(true);
    expect(bodyOf(legacy.doc).length).toBe(200007);
  }, 30000);

  it("ignores live v2 events arriving through its poll loop", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!legacylive:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, client, roomId, translator);
    await writer.change((doc) => doc.getText("body").insert(0, "hello"));
    await writer.snapshot();

    // The old build's live event filter is the second place a v2 event could
    // hurt it: an unrecognized type must be dropped, not base64-decoded.
    const doc = new Y.Doc();
    expect(() =>
      legacyProcessIncomingEvents(doc, hs.getRoom(roomId).events)
    ).not.toThrow();
    expect(bodyOf(doc)).toEqual("hello");
  });

  it("would be broken if the media pointer used the legacy snapshot event type", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!wrongtype:fake");
    const client = hs.createClient("@alice:fake");
    // Deliberately misconfigured: publish media pointers under the legacy type.
    const translator = new MatrixCRDTEventTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
      snapshotEventType: "matrix-crdt.doc_snapshot_unused",
      snapshotV2EventType: LEGACY_SNAPSHOT_EVENT_TYPE,
    });
    const writer = new RoomWriter(hs, client, roomId, translator);
    await writer.change((doc) => doc.getText("body").insert(0, "hello"));
    await writer.snapshot();
    await writer.change((doc) => doc.getText("body").insert(5, " world"));

    const legacy = await legacyCatchUp(client, roomId);
    // Either it throws decoding a payload that isn't there, or it silently
    // truncates. Either way it does NOT load the room's state.
    const loadedCorrectly = !legacy.error && bodyOf(legacy.doc) === "hello world";
    expect(loadedCorrectly).toBe(false);
  });
});

describe("degradation instead of an empty document", () => {
  it("falls back to replaying updates when the media blob cannot be fetched", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!brokenmedia:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
    });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    const result = await writer.snapshot();
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));

    hs.brokenMedia.add(result.v2.mxcUrl!);

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(1);
    expect(degradations[0].reason).toBe("fetch_failed");
    expect(degradations[0].mxcUrl).toBe(result.v2.mxcUrl);
    // full document from update replay, NOT an empty doc
    expect(bodyOf(doc)).toEqual("one-two");
  });

  it("falls back to an older readable legacy snapshot when the newest v2 is broken", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!fallback:fake");
    const client = hs.createClient("@alice:fake");
    // v2 only, so the broken snapshot really is the newest one in the room
    const translator = newTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
    });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    // an older, legacy-only snapshot
    await newTranslator().sendSnapshots(
      client as any,
      roomId,
      writer.stateUpdate,
      writer.lastEventId
    );
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));
    const v2Only = await writer.snapshot();
    expect(v2Only.legacy.sent).toBe(false);
    hs.brokenMedia.add(v2Only.v2.mxcUrl!);
    await writer.change((doc) => doc.getText("body").insert(7, "-three"));

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(1);
    expect(degradations[0].reason).toBe("fetch_failed");
    expect(bodyOf(doc)).toEqual("one-two-three");
  });

  it("does not fetch an older v2 blob once a newer readable snapshot was found", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!nowastedfetch:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({ enableMediaSnapshots: true });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    await writer.snapshot(); // v2 + legacy
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));
    await writer.snapshot(); // v2 + legacy again

    const { doc } = await currentClientCatchUp(hs, roomId);
    expect(bodyOf(doc)).toEqual("one-two");
    expect(hs.downloadCount).toBe(0);
  });

  it("degrades when the blob does not match the advertised state vector", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!tampered:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
    });
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    const result = await writer.snapshot();
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));

    // a *valid* Yjs update, but of a different document
    const otherDoc = new Y.Doc();
    otherDoc.getText("body").insert(0, "totally different");
    hs.tamperedMedia.set(result.v2.mxcUrl!, Y.encodeStateAsUpdate(otherDoc));

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(1);
    expect(degradations[0].reason).toBe("fetch_failed");
    expect(bodyOf(doc)).toEqual("one-two");
  });

  it("degrades on a malformed pointer", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!badpointer:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator();
    const writer = new RoomWriter(hs, client, roomId, translator);

    await writer.change((doc) => doc.getText("body").insert(0, "one"));
    await client.sendEvent(roomId, SNAPSHOT_V2_EVENT_TYPE, {
      v: 2,
      last_event_id: writer.lastEventId,
      // no mxc_url at all
    });
    await writer.change((doc) => doc.getText("body").insert(3, "-two"));

    const { doc, degradations } = await currentClientCatchUp(hs, roomId);
    expect(degradations).toHaveLength(1);
    expect(degradations[0].reason).toBe("invalid_pointer");
    expect(bodyOf(doc)).toEqual("one-two");
  });

  it("refuses to report an empty document when the only snapshot is unreadable", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!nothingreadable:fake");
    const client = hs.createClient("@alice:fake");
    const translator = newTranslator({
      enableMediaSnapshots: true,
      keepLegacyInlineSnapshots: false,
    });
    const writer = new RoomWriter(hs, client, roomId, translator);
    await writer.change((doc) => doc.getText("body").insert(0, "important"));
    const result = await writer.snapshot();

    // Simulate a room whose update events are no longer retrievable (purged /
    // redacted history) while the snapshot pointer survives but is unfetchable.
    const room = hs.getRoom(roomId);
    room.events = room.events.filter((e) => e.type !== UPDATE_EVENT_TYPE);
    hs.brokenMedia.add(result.v2.mxcUrl!);

    await expect(currentClientCatchUp(hs, roomId)).rejects.toBeInstanceOf(
      SnapshotUnavailableError
    );
  });
});

describe("inline snapshot ceiling", () => {
  it("uses a lower ceiling for encrypted rooms", () => {
    const translator = newTranslator();
    expect(translator.getInlineSnapshotMaxBytes(false)).toBe(
      INLINE_SNAPSHOT_MAX_BYTES
    );
    expect(translator.getInlineSnapshotMaxBytes(true)).toBeLessThan(
      INLINE_SNAPSHOT_MAX_BYTES
    );
  });

  it("does not attempt an oversized inline snapshot when media snapshots are off", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!oversizelegacy:fake");
    const translator = newTranslator();
    const { writer } = await writeOversizedRoom(hs, roomId, translator);

    const result = await writer.snapshot();
    expect(result.legacy.sent).toBe(false);
    expect(result.legacy.skippedTooLarge).toBe(true);
    expect(result.legacy.error).toBeUndefined();
    expect(hs.eventsOfType(roomId, LEGACY_SNAPSHOT_EVENT_TYPE)).toHaveLength(0);
  }, 30000);
});
