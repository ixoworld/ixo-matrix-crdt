import { MatrixClient, Method } from "matrix-js-sdk";
import {
  decryptAttachment,
  encryptAttachment,
  EncryptedFileInfo,
  sha256UnpaddedBase64,
} from "./attachmentCrypto";

/** Result of uploading a snapshot blob to the Matrix media repository. */
export interface MediaSnapshotUpload {
  mxcUrl: string;
  /** byte length of the *plaintext* Yjs update */
  size: number;
  /** present iff the blob was encrypted (encrypted rooms) */
  file?: EncryptedFileInfo;
  /** sha256 (unpadded base64) of the uploaded bytes, for the unencrypted path */
  sha256?: string;
}

export interface MediaSnapshotRef {
  mxcUrl: string;
  file?: EncryptedFileInfo;
  sha256?: string;
}

/**
 * Pluggable media transport. The default implementation talks to the Matrix
 * media repository via the supplied MatrixClient; tests inject a fake.
 *
 * It is deliberately an interface: matrix-js-sdk has moved its media endpoints
 * twice in recent memory (authenticated media, MSC3916) and this package pins
 * only a peer-dependency range, so consumers must be able to override.
 */
export interface MediaTransport {
  upload(
    client: MatrixClient,
    roomId: string,
    bytes: Uint8Array
  ): Promise<MediaSnapshotUpload>;
  download(client: MatrixClient, ref: MediaSnapshotRef): Promise<Uint8Array>;
}

const SNAPSHOT_CONTENT_TYPE = "application/octet-stream";

export function parseMxcUrl(mxcUrl: string): {
  serverName: string;
  mediaId: string;
} {
  const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxcUrl || "");
  if (!match) {
    throw new Error(`not a valid mxc:// url: ${String(mxcUrl)}`);
  }
  return { serverName: match[1], mediaId: match[2] };
}

/**
 * Whether the room is end-to-end encrypted.
 *
 * Note: MatrixReader deliberately never calls `startClient()` (see its class
 * docs), so the client-side room store is usually empty and both
 * `client.isRoomEncrypted()` and `room.hasEncryptionStateEvent()` report
 * `false` for a room that really is encrypted. The authoritative check is
 * therefore a state lookup against the server, with the in-memory checks kept
 * only as fast paths.
 *
 * Returns "unknown" when the question could not be answered (e.g. no
 * permission to read state). Callers must fail *closed* on "unknown" and
 * encrypt: encrypting in a plaintext room costs nothing but CPU, while
 * uploading a plaintext document because a check failed is a data leak.
 */
export async function detectRoomEncryption(
  client: MatrixClient,
  roomId: string
): Promise<"encrypted" | "unencrypted" | "unknown"> {
  try {
    const crypto = (client as any).getCrypto?.();
    if (crypto?.isEncryptionEnabledInRoom) {
      if (await crypto.isEncryptionEnabledInRoom(roomId)) {
        return "encrypted";
      }
    }
  } catch (e) {
    // fall through to the server-side check
  }

  try {
    if ((client as any).getRoom?.(roomId)?.hasEncryptionStateEvent?.()) {
      return "encrypted";
    }
  } catch (e) {
    // fall through
  }

  try {
    const state = await (client as any).getStateEvent(
      roomId,
      "m.room.encryption",
      ""
    );
    return state && state.algorithm ? "encrypted" : "unencrypted";
  } catch (e: any) {
    if (e?.errcode === "M_NOT_FOUND") {
      // definitively no m.room.encryption state event
      return "unencrypted";
    }
    return "unknown";
  }
}

async function coerceToUint8Array(value: any): Promise<Uint8Array> {
  if (!value) {
    throw new Error("empty media response");
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value.arrayBuffer === "function") {
    // Blob (matrix-js-sdk `rawResponseBody`) or fetch Response
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    throw new Error(
      "media response was decoded as text; expected binary body (rawResponseBody)"
    );
  }
  throw new Error("unrecognized media response type");
}

async function downloadRawBytes(
  client: MatrixClient,
  mxcUrl: string
): Promise<Uint8Array> {
  const { serverName, mediaId } = parseMxcUrl(mxcUrl);
  const attempts: { prefix: string; path: string }[] = [
    // Authenticated media (Matrix 1.11+). Preferred: unauthenticated download
    // is removed / freezable on modern homeservers.
    {
      prefix: "/_matrix/client/v1",
      path: `/media/download/${encodeURIComponent(
        serverName
      )}/${encodeURIComponent(mediaId)}`,
    },
    {
      prefix: "/_matrix/media/v3",
      path: `/download/${encodeURIComponent(serverName)}/${encodeURIComponent(
        mediaId
      )}`,
    },
  ];

  let lastError: any;
  for (const attempt of attempts) {
    try {
      const res = await (client as any).http.authedRequest(
        Method.Get,
        attempt.path,
        undefined,
        undefined,
        { prefix: attempt.prefix, rawResponseBody: true }
      );
      return await coerceToUint8Array(res);
    } catch (e: any) {
      lastError = e;
      const unsupported =
        e?.httpStatus === 404 ||
        e?.errcode === "M_UNRECOGNIZED" ||
        e?.errcode === "M_UNKNOWN_ENDPOINT";
      if (!unsupported) {
        throw e;
      }
    }
  }
  throw lastError ?? new Error("could not download media");
}

export const defaultMediaTransport: MediaTransport = {
  async upload(client, roomId, bytes) {
    const encryption = await detectRoomEncryption(client, roomId);
    const shouldEncrypt = encryption !== "unencrypted";

    if (shouldEncrypt) {
      const { ciphertext, info } = await encryptAttachment(bytes);
      const res = await client.uploadContent(ciphertext as any, {
        type: SNAPSHOT_CONTENT_TYPE,
        includeFilename: false,
      });
      const mxcUrl = (res as any).content_uri;
      if (!mxcUrl) {
        throw new Error("media upload returned no content_uri");
      }
      return {
        mxcUrl,
        size: bytes.length,
        file: { ...info, url: mxcUrl },
      };
    }

    const res = await client.uploadContent(bytes as any, {
      type: SNAPSHOT_CONTENT_TYPE,
      includeFilename: false,
    });
    const mxcUrl = (res as any).content_uri;
    if (!mxcUrl) {
      throw new Error("media upload returned no content_uri");
    }
    return {
      mxcUrl,
      size: bytes.length,
      sha256: await sha256UnpaddedBase64(bytes),
    };
  },

  async download(client, ref) {
    const raw = await downloadRawBytes(client, ref.mxcUrl);
    if (!raw.length) {
      throw new Error("media snapshot blob was empty");
    }
    if (ref.file) {
      return decryptAttachment(raw, ref.file);
    }
    if (ref.sha256) {
      const actual = await sha256UnpaddedBase64(raw);
      if (actual !== ref.sha256.replace(/=+$/g, "")) {
        throw new Error("media snapshot failed sha256 integrity check");
      }
    }
    return raw;
  },
};
