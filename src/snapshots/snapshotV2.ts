import { IContent, MatrixClient } from "matrix-js-sdk";
import * as Y from "yjs";
import { decodeBase64, encodeBase64 } from "../util/olmlib";
import { EncryptedFileInfo } from "./attachmentCrypto";
import {
  MediaSnapshotRef,
  MediaSnapshotUpload,
  MediaTransport,
} from "./mediaTransport";

/**
 * The event type for media-backed ("v2") snapshots.
 *
 * ⚠️ This MUST NOT be the legacy `matrix-crdt.doc_snapshot` type. Legacy
 * clients' `isSnapshotEvent` matches on event type alone and never inspects the
 * content, and their catch-up (`MatrixReader.getInitialDocumentUpdateEvents`)
 * treats a snapshot as the signal to stop paginating backwards. A media pointer
 * published under the legacy type would therefore halt an old client's
 * backwards walk and then fail to decode an inline payload that isn't there —
 * presenting a partial or empty document as the room's state.
 *
 * Under a *new* type, `isSnapshotEvent` returns false on old clients, so they
 * skip the event entirely and keep paginating to a snapshot they can read.
 */
export const SNAPSHOT_V2_EVENT_TYPE = "matrix-crdt.doc_snapshot_v2";

/** Schema version of the pointer content. */
export const SNAPSHOT_V2_VERSION = 2;

/**
 * Content of a `matrix-crdt.doc_snapshot_v2` event. Constant size regardless of
 * document size — the document itself lives in the media repository.
 */
export interface SnapshotV2Content extends IContent {
  v: number;
  mxc_url: string;
  last_event_id: string;
  /** base64 of `Y.encodeStateVectorFromUpdate(update)` */
  state_vector: string;
  /** byte length of the plaintext Yjs update */
  size: number;
  /** integrity hash for the unencrypted path */
  sha256?: string;
  /** key material for the encrypted path (the event itself is E2E encrypted) */
  file?: EncryptedFileInfo;
}

export interface SnapshotV2Pointer extends MediaSnapshotRef {
  lastEventId: string;
  stateVector?: Uint8Array;
  size?: number;
}

export function buildSnapshotV2Content(
  upload: MediaSnapshotUpload,
  lastEventId: string,
  stateVector: Uint8Array
): SnapshotV2Content {
  const content: SnapshotV2Content = {
    v: SNAPSHOT_V2_VERSION,
    mxc_url: upload.mxcUrl,
    last_event_id: lastEventId,
    state_vector: encodeBase64(stateVector),
    size: upload.size,
  };
  if (upload.file) {
    content.file = upload.file;
  }
  if (upload.sha256) {
    content.sha256 = upload.sha256;
  }
  return content;
}

/**
 * Parse and validate the pointer. Returns undefined when the content is not a
 * usable pointer — an unusable pointer must be treated as an *unreadable*
 * snapshot (skip it and keep looking for an older readable one), never as a
 * successful catch-up.
 */
export function parseSnapshotV2Content(
  content: any
): SnapshotV2Pointer | undefined {
  if (!content || typeof content !== "object") {
    return undefined;
  }
  if (typeof content.mxc_url !== "string" || !/^mxc:\/\/.+\/.+/.test(content.mxc_url)) {
    return undefined;
  }
  if (typeof content.last_event_id !== "string" || !content.last_event_id) {
    return undefined;
  }
  if (content.v !== undefined && Number(content.v) > SNAPSHOT_V2_VERSION) {
    // written by a newer client with a shape we don't understand
    return undefined;
  }

  let stateVector: Uint8Array | undefined;
  if (typeof content.state_vector === "string" && content.state_vector) {
    try {
      stateVector = decodeBase64(content.state_vector);
    } catch (e) {
      return undefined;
    }
  }

  return {
    mxcUrl: content.mxc_url,
    lastEventId: content.last_event_id,
    stateVector,
    size: typeof content.size === "number" ? content.size : undefined,
    file: content.file,
    sha256: typeof content.sha256 === "string" ? content.sha256 : undefined,
  };
}

function stateVectorsEqual(a: Uint8Array, b: Uint8Array): boolean {
  const mapA = Y.decodeStateVector(a);
  const mapB = Y.decodeStateVector(b);
  if (mapA.size !== mapB.size) {
    return false;
  }
  for (const [client, clock] of mapA) {
    if (mapB.get(client) !== clock) {
      return false;
    }
  }
  return true;
}

/**
 * Download the blob a pointer references and validate it is a well-formed Yjs
 * update matching the advertised state vector.
 *
 * Throws on every failure mode (network, decryption, integrity, malformed
 * update). Callers must treat a throw as "this snapshot is unreadable" and fall
 * back to an older snapshot or to replaying updates.
 */
export async function fetchSnapshotV2Update(
  client: MatrixClient,
  pointer: SnapshotV2Pointer,
  transport: MediaTransport
): Promise<Uint8Array> {
  const bytes = await transport.download(client, pointer);
  if (!bytes || !bytes.length) {
    throw new Error("media snapshot blob was empty");
  }

  let actualStateVector: Uint8Array;
  try {
    actualStateVector = Y.encodeStateVectorFromUpdate(bytes);
  } catch (e: any) {
    throw new Error(
      `media snapshot blob is not a valid Yjs update: ${e?.message ?? e}`
    );
  }

  if (pointer.stateVector && !stateVectorsEqual(pointer.stateVector, actualStateVector)) {
    throw new Error(
      "media snapshot blob does not match the state vector advertised in the event"
    );
  }

  return bytes;
}

const RESOLVED_UPDATE_FIELD = "__matrixCrdtResolvedUpdate";

/**
 * Attach already-fetched update bytes to an in-memory event object.
 *
 * Deliberately *not* written into `content` as base64: a snapshot blob can be
 * megabytes, and base64-round-tripping it just to hand it to the provider would
 * undo the point of moving it out of the event.
 */
export function attachResolvedUpdate(event: any, bytes: Uint8Array) {
  Object.defineProperty(event, RESOLVED_UPDATE_FIELD, {
    value: bytes,
    enumerable: false,
    configurable: true,
  });
  return event;
}

export function getResolvedUpdate(event: any): Uint8Array | undefined {
  const value = event?.[RESOLVED_UPDATE_FIELD];
  return value instanceof Uint8Array ? value : undefined;
}
