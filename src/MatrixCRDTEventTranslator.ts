import { MatrixClient, IContent } from "matrix-js-sdk";
import { MESSAGE_EVENT_TYPE } from "./util/matrixUtil";
import { decodeBase64, encodeBase64 } from "./util/olmlib";
import {
  defaultMediaTransport,
  MediaTransport,
} from "./snapshots/mediaTransport";
import {
  buildSnapshotV2Content,
  fetchSnapshotV2Update,
  getResolvedUpdate,
  parseSnapshotV2Content,
  SNAPSHOT_V2_EVENT_TYPE,
  SnapshotV2Content,
  SnapshotV2Pointer,
} from "./snapshots/snapshotV2";
import * as Y from "yjs";

interface MatrixCRDTUpdateContent extends IContent {
  update: string;
}

interface MatrixCRDTSnapshotContent extends IContent {
  update: string;
  last_event_id: string;
}

interface MatrixMessageContent extends IContent {
  body: string;
  msgtype: string;
  [key: string]: any;
}

/**
 * Matrix caps a single event at 65,536 bytes (the whole PDU, not just content),
 * and an inline snapshot is base64 (4/3 expansion) of the entire document. That
 * puts the safe inline document ceiling at roughly 45 KB.
 *
 * In an *encrypted* room the megolm ciphertext is itself base64, so the
 * expansion is applied twice (16/9) and the ceiling drops to roughly 32 KB.
 */
export const INLINE_SNAPSHOT_MAX_BYTES = 45 * 1024;
export const INLINE_SNAPSHOT_MAX_BYTES_ENCRYPTED = 32 * 1024;

const DEFAULT_OPTIONS = {
  // set to true to send everything encapsulated in a m.room.message,
  // so you can debug rooms easily in element or other matrix clients
  updatesAsRegularMessages: false,
  updateEventType: "matrix-crdt.doc_update",
  snapshotEventType: "matrix-crdt.doc_snapshot",
  /**
   * Event type for media-backed snapshots. Must stay distinct from
   * `snapshotEventType`; see SNAPSHOT_V2_EVENT_TYPE for why.
   */
  snapshotV2EventType: SNAPSHOT_V2_EVENT_TYPE,
  /**
   * WRITE path for media-backed snapshots. Default OFF: v2 read support ships
   * (and must be deployed everywhere) before anything starts writing v2.
   * "Readers before writers."
   */
  enableMediaSnapshots: false,
  /**
   * While media snapshots are enabled, also publish a legacy inline snapshot
   * whenever the document still fits under the inline ceiling, so already
   * deployed clients keep their catch-up shortcut instead of replaying from
   * room genesis.
   *
   * Removal condition (not a date): drop this once no pre-v2 client can still
   * join the room — i.e. after the Phase B population turnover.
   */
  keepLegacyInlineSnapshots: true,
  /** override the computed inline ceiling (bytes of the Yjs update) */
  inlineSnapshotMaxBytes: 0,
};

export type MatrixCRDTEventTranslatorOptions = Partial<typeof DEFAULT_OPTIONS>;

export type SnapshotSendResult = {
  v2: { sent: boolean; error?: any; mxcUrl?: string };
  legacy: { sent: boolean; error?: any; skippedTooLarge?: boolean };
};

/**
 * The MatrixCRDTEventTranslator is responsible for writing and reading
 * Yjs updates from / to Matrix events. The options determine how to serialize
 * Matrix-CRDT updates.
 */
export class MatrixCRDTEventTranslator {
  private readonly opts: typeof DEFAULT_OPTIONS;
  private readonly mediaTransport: MediaTransport;

  public constructor(
    opts: MatrixCRDTEventTranslatorOptions = {},
    mediaTransport: MediaTransport = defaultMediaTransport
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.mediaTransport = mediaTransport;
    if (this.opts.snapshotV2EventType === this.opts.snapshotEventType) {
      throw new Error(
        "snapshotV2EventType must differ from snapshotEventType: publishing a " +
          "media pointer under the legacy snapshot type makes already-deployed " +
          "clients render an empty document"
      );
    }
  }

  public async sendUpdate(
    client: MatrixClient,
    roomId: string,
    update: Uint8Array
  ) {
    const encoded = encodeBase64(update);
    const content: MatrixCRDTUpdateContent = {
      update: encoded,
    };
    if (this.opts.updatesAsRegularMessages) {
      const wrappedContent: MatrixMessageContent = {
        body: this.opts.updateEventType + ": " + encoded,
        msgtype: this.opts.updateEventType,
        ...content,
      };
      // Disable scheduler for immediate sending
      if ('scheduler' in client) {
        (client as any).scheduler = undefined;
      }
      await (client.sendEvent as any)(roomId, MESSAGE_EVENT_TYPE, wrappedContent, "");
    } else {
      await (client.sendEvent as any)(roomId, this.opts.updateEventType, content, "");
    }
  }

  public async sendSnapshot(
    client: MatrixClient,
    roomId: string,
    snapshot: Uint8Array,
    lastEventId: string
  ) {
    const encoded = encodeBase64(snapshot);
    const content: MatrixCRDTSnapshotContent = {
      update: encoded,
      last_event_id: lastEventId,
    };
    if (this.opts.updatesAsRegularMessages) {
      const wrappedContent: MatrixMessageContent = {
        body: this.opts.snapshotEventType + ": " + encoded,
        msgtype: this.opts.snapshotEventType,
        ...content,
      };
      // Disable scheduler for immediate sending
      if ('scheduler' in client) {
        (client as any).scheduler = undefined;
      }
      await (client.sendEvent as any)(roomId, MESSAGE_EVENT_TYPE, wrappedContent, "");
    } else {
      await (client.sendEvent as any)(roomId, this.opts.snapshotEventType, content, "");
    }
  }

  /**
   * Upload the document to the Matrix media repository and publish a
   * constant-size pointer event. Lifts the document ceiling from ~45 KB (the
   * inline base64-in-an-event limit) to the homeserver's media limit.
   */
  public async sendSnapshotV2(
    client: MatrixClient,
    roomId: string,
    snapshot: Uint8Array,
    lastEventId: string
  ): Promise<SnapshotV2Content> {
    const upload = await this.mediaTransport.upload(client, roomId, snapshot);
    const content = buildSnapshotV2Content(
      upload,
      lastEventId,
      Y.encodeStateVectorFromUpdate(snapshot)
    );

    if (this.opts.updatesAsRegularMessages) {
      const wrappedContent: MatrixMessageContent = {
        body: this.opts.snapshotV2EventType + ": " + upload.mxcUrl,
        msgtype: this.opts.snapshotV2EventType,
        ...content,
      };
      if ("scheduler" in client) {
        (client as any).scheduler = undefined;
      }
      await (client.sendEvent as any)(
        roomId,
        MESSAGE_EVENT_TYPE,
        wrappedContent,
        ""
      );
    } else {
      await (client.sendEvent as any)(
        roomId,
        this.opts.snapshotV2EventType,
        content,
        ""
      );
    }
    return content;
  }

  /**
   * Publish snapshots according to the configured policy.
   *
   * - media snapshots disabled (default): legacy inline only, exactly as before.
   * - media snapshots enabled: publish v2 first, then *also* publish a legacy
   *   inline snapshot while the document still fits, so old clients keep a
   *   readable snapshot. Old clients ignore the v2 event entirely because they
   *   match snapshots on event type.
   *
   * Never throws: a failed snapshot is a missed optimisation, not a sync error.
   */
  public async sendSnapshots(
    client: MatrixClient,
    roomId: string,
    snapshot: Uint8Array,
    lastEventId: string,
    opts: { roomIsEncrypted?: boolean } = {}
  ): Promise<SnapshotSendResult> {
    const result: SnapshotSendResult = {
      v2: { sent: false },
      legacy: { sent: false },
    };

    if (this.opts.enableMediaSnapshots) {
      try {
        const content = await this.sendSnapshotV2(
          client,
          roomId,
          snapshot,
          lastEventId
        );
        result.v2 = { sent: true, mxcUrl: content.mxc_url };
      } catch (e) {
        result.v2 = { sent: false, error: e };
        console.error("failed to send media-backed (v2) snapshot", e);
      }

      if (!this.opts.keepLegacyInlineSnapshots) {
        return result;
      }
      if (snapshot.length > this.getInlineSnapshotMaxBytes(opts.roomIsEncrypted)) {
        // Too big to publish inline. Old clients lose the shortcut and replay
        // from room genesis, which is slow but always correct.
        result.legacy = { sent: false, skippedTooLarge: true };
        return result;
      }
    } else if (
      snapshot.length > this.getInlineSnapshotMaxBytes(opts.roomIsEncrypted)
    ) {
      // Legacy-only mode and the document no longer fits in one event. Sending
      // it anyway would be rejected by the homeserver (M_TOO_LARGE); say so
      // loudly rather than failing silently forever.
      console.error(
        `matrix-crdt: document (${snapshot.length} bytes) exceeds the inline ` +
          `snapshot ceiling and media-backed snapshots are disabled. Catch-up ` +
          `will replay the full room history. Enable ` +
          `translator.enableMediaSnapshots to fix this.`
      );
      result.legacy = { sent: false, skippedTooLarge: true };
      return result;
    }

    try {
      await this.sendSnapshot(client, roomId, snapshot, lastEventId);
      result.legacy = { sent: true };
    } catch (e) {
      result.legacy = { sent: false, error: e };
      console.error("failed to send snapshot", e);
    }
    return result;
  }

  public getInlineSnapshotMaxBytes(roomIsEncrypted?: boolean) {
    if (this.opts.inlineSnapshotMaxBytes > 0) {
      return this.opts.inlineSnapshotMaxBytes;
    }
    return roomIsEncrypted
      ? INLINE_SNAPSHOT_MAX_BYTES_ENCRYPTED
      : INLINE_SNAPSHOT_MAX_BYTES;
  }

  public isUpdateEvent(event: any) {
    if (this.opts.updatesAsRegularMessages) {
      return (
        event.type === MESSAGE_EVENT_TYPE &&
        event.content.msgtype === this.opts.updateEventType
      );
    }
    return event.type === this.opts.updateEventType;
  }

  /**
   * Legacy, inline snapshots only. Deliberately unchanged: it defines what a
   * *legacy* snapshot is, and both generations of client must agree on that.
   */
  public isSnapshotEvent(event: any) {
    if (this.opts.updatesAsRegularMessages) {
      return (
        event.type === MESSAGE_EVENT_TYPE &&
        event.content.msgtype === this.opts.snapshotEventType
      );
    }
    return event.type === this.opts.snapshotEventType;
  }

  /** Media-backed snapshots. Matches on type only; the content may be junk. */
  public isSnapshotV2Event(event: any) {
    if (this.opts.updatesAsRegularMessages) {
      return (
        event.type === MESSAGE_EVENT_TYPE &&
        event.content?.msgtype === this.opts.snapshotV2EventType
      );
    }
    return event.type === this.opts.snapshotV2EventType;
  }

  public isAnySnapshotEvent(event: any) {
    return this.isSnapshotEvent(event) || this.isSnapshotV2Event(event);
  }

  /** Parse a v2 pointer, or undefined if this event carries no usable pointer. */
  public parseSnapshotV2Pointer(event: any): SnapshotV2Pointer | undefined {
    if (!this.isSnapshotV2Event(event)) {
      return undefined;
    }
    return parseSnapshotV2Content(event.content);
  }

  /**
   * Fetch and validate the document referenced by a v2 pointer. Throws when the
   * snapshot is unreadable for any reason.
   */
  public async fetchSnapshotV2Update(
    client: MatrixClient,
    pointer: SnapshotV2Pointer
  ): Promise<Uint8Array> {
    return fetchSnapshotV2Update(client, pointer, this.mediaTransport);
  }

  /**
   * The Yjs update bytes carried by an event, or undefined when the event
   * carries none (e.g. a v2 pointer whose blob has not been fetched).
   */
  public getUpdateBytes(event: any): Uint8Array | undefined {
    const resolved = getResolvedUpdate(event);
    if (resolved) {
      return resolved;
    }
    if (this.isUpdateEvent(event) || this.isSnapshotEvent(event)) {
      const encoded = event?.content?.update;
      if (typeof encoded !== "string" || !encoded) {
        return undefined;
      }
      try {
        return new Uint8Array(decodeBase64(encoded));
      } catch (e) {
        console.warn("matrix-crdt: could not decode event update payload", e);
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Every event type this translator reads. Exposed so callers never have to
   * hardcode (and therefore never forget) the v2 type.
   */
  public get readEventTypes(): string[] {
    if (this.opts.updatesAsRegularMessages) {
      return [MESSAGE_EVENT_TYPE];
    }
    return [
      this.opts.updateEventType,
      this.opts.snapshotEventType,
      this.opts.snapshotV2EventType,
    ];
  }

  public get mediaSnapshotsEnabled() {
    return this.opts.enableMediaSnapshots;
  }

  public get WrappedEventType() {
    if (this.opts.updatesAsRegularMessages) {
      return MESSAGE_EVENT_TYPE;
    } else {
      return this.opts.updateEventType;
    }
  }
}
