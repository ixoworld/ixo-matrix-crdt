import {
  Direction,
  MatrixClient,
  MatrixEvent,
  Method,
  RoomEvent,
} from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { attachResolvedUpdate } from "../snapshots/snapshotV2";

const PEEK_POLL_TIMEOUT = 30 * 1000;
const PEEK_POLL_ERROR_TIMEOUT = 30 * 1000;

const DEFAULT_OPTIONS = {
  snapshotInterval: 30, // send a snapshot after 30 events
};

export type MatrixReaderOptions = Partial<typeof DEFAULT_OPTIONS>;

export type SnapshotDegradationReason =
  | "invalid_pointer"
  | "fetch_failed";

/**
 * Emitted when a snapshot event was found but could not be used. The catch-up
 * continues paginating backwards (to an older readable snapshot, or to room
 * genesis) instead of treating the unreadable snapshot as complete state.
 */
export interface SnapshotDegradation {
  eventId: string | undefined;
  eventType: string | undefined;
  reason: SnapshotDegradationReason;
  mxcUrl?: string;
  error?: any;
}

/**
 * Thrown when snapshots degraded *and* no readable update events were found, so
 * the only thing we could hand back would be an empty document. An empty
 * document must never be presented as the room's state.
 */
export class SnapshotUnavailableError extends Error {
  public constructor(public readonly degradations: SnapshotDegradation[]) {
    super(
      `matrix-crdt: catch-up found ${degradations.length} unreadable snapshot(s) ` +
        `and no readable document updates; refusing to report an empty document ` +
        `as the room state`
    );
    this.name = "SnapshotUnavailableError";
  }
}

/**
 * A helper class to read messages from Matrix using a MatrixClient,
 * without relying on the sync protocol.
 */
export class MatrixReader extends lifecycle.Disposable {
  public latestToken: string | undefined;
  private disposed = false;
  private polling = false;
  private pendingPollRequest: any;
  private pollRetryTimeout: ReturnType<typeof setTimeout> | undefined;
  private messagesSinceSnapshot = 0;

  private readonly _onEvents = this._register(
    new event.Emitter<{ events: any[]; shouldSendSnapshot: boolean }>()
  );
  public readonly onEvents: event.Event<{
    events: any[];
    shouldSendSnapshot: boolean;
  }> = this._onEvents.event;

  private readonly _onSnapshotDegraded = this._register(
    new event.Emitter<SnapshotDegradation>()
  );
  /** Fires for every snapshot that was found but could not be used. */
  public readonly onSnapshotDegraded: event.Event<SnapshotDegradation> =
    this._onSnapshotDegraded.event;

  private _snapshotDegradations: SnapshotDegradation[] = [];

  /** Snapshots that could not be read during the last catch-up. */
  public get snapshotDegradations(): readonly SnapshotDegradation[] {
    return this._snapshotDegradations;
  }

  private readonly opts: typeof DEFAULT_OPTIONS;

  public constructor(
    private matrixClient: MatrixClient,
    public readonly roomId: string,
    private readonly translator: MatrixCRDTEventTranslator,
    opts: MatrixReaderOptions = {}
  ) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    // TODO: catch events for when room has been deleted or user has been kicked
    // Note: Disabled timeline listener as it conflicts when the same client is used for writing
    // this.matrixClient.on(RoomEvent.Timeline, this.matrixRoomListener);
  }

  /**
   * Only receives messages from rooms the user has joined, and after startClient() has been called
   * (i.e.: they're received via the sync API).
   *
   * At this moment, we only poll for events using the /events endpoint.
   * I.e. the Sync API should not be used (and startClient() should not be called).
   *
   * We do this because we don't want the MatrixClient to keep all events in memory.
   * For yjs, this is not necessary, as events are document updates which are accumulated in the yjs
   * document, so already stored there.
   *
   * In a later version, it might be more efficient to call the /sync API manually
   * (without relying on the Timeline / sync system in the matrix-js-sdk),
   * because it allows us to retrieve events for multiple rooms simultaneously, instead of
   * a seperate /events poll per room
   */
  private matrixRoomListener = (
    _event: any,
    _room: any,
    _toStartOfTimeline: boolean | undefined
  ) => {
    console.error("not expected; Room.timeline on MatrixClient");
    // (disable error when testing / developing e2ee support,
    // in that case startClient is necessary)
    throw new Error(
      "unexpected, we don't use /sync calls for MatrixReader, startClient should not be used on the Matrix client"
    );
  };

  /**
   * Handle incoming events to determine whether a snapshot message needs to be sent
   *
   * MatrixReader keeps an internal counter of messages received.
   * every opts.snapshotInterval messages, we send a snapshot of the entire document state.
   */
  private processIncomingEventsForSnapshot(events: any[]) {
    let shouldSendSnapshot = false;
    for (let event of events) {
      if (this.translator.isUpdateEvent(event)) {
        if (event.room_id !== this.roomId) {
          throw new Error("event received with invalid roomid");
        }
        this.messagesSinceSnapshot++;
        if (
          this.messagesSinceSnapshot % this.opts.snapshotInterval === 0 &&
          event.user_id === this.matrixClient.credentials.userId
        ) {
          // We don't want multiple users send a snapshot at the same time,
          // to prevent this, we have a simple (probably not fool-proof) "snapshot user election"
          // system which says that the user who sent a message SNAPSHOT_INTERVAL events since
          // the last snapshot is responsible for posting a new snapshot.

          // In case a user fails to do so,
          // we use % to make sure we retry this on the next SNAPSHOT_INTERVAL
          shouldSendSnapshot = true;
        }
      } else if (this.translator.isAnySnapshotEvent(event)) {
        // v2 snapshots reset the counter too: someone just published a
        // snapshot, so this client should not publish a redundant one. Note we
        // deliberately do NOT fetch the media blob for a live snapshot — we are
        // already up to date via update events.
        this.messagesSinceSnapshot = 0;
        shouldSendSnapshot = false;
      }
    }
    return shouldSendSnapshot;
  }

  private async decryptRawEventsIfNecessary(rawEvents: any[]) {
    const events = await Promise.all(
      rawEvents.map(async (event: any) => {
        if (event.type === "m.room.encrypted") {
          // Use the modern decryption API
          const matrixEvent = new MatrixEvent(event);
          await this.matrixClient.decryptEventIfNeeded(matrixEvent);
          // After decryption, the event content is available in the clearEvent or original event
          return matrixEvent.getEffectiveEvent();
        } else {
          return event;
        }
      })
    );
    return events;
  }

  /**
   * Peek for new room events using the Matrix /events API (long-polling)
   * This function automatically keeps polling until MatrixReader.dispose() is called
   */
  private async peekPoll() {
    if (!this.latestToken) {
      throw new Error("polling but no pagination token");
    }
    if (this.disposed) {
      return;
    }
    try {
      // Note: In matrix-js-sdk v37+, the authedRequest signature changed
      // We use the proper method signature without the callback parameter
      this.pendingPollRequest = this.matrixClient.http.authedRequest(
        Method.Get,
        "/events",
        {
          room_id: this.roomId,
          timeout: PEEK_POLL_TIMEOUT.toString(),
          from: this.latestToken,
        }
      );
      const results = await this.pendingPollRequest;
      this.pendingPollRequest = undefined;
      if (this.disposed) {
        return;
      }

      const events = await this.decryptRawEventsIfNecessary(results.chunk);

      const shouldSendSnapshot = this.processIncomingEventsForSnapshot(events);

      if (events.length) {
        this._onEvents.fire({ events: events, shouldSendSnapshot });
      }

      this.latestToken = results.end;
      this.peekPoll();
    } catch (e) {
      console.error("peek error", e);
      if (!this.disposed) {
        this.pollRetryTimeout = setTimeout(
          () => this.peekPoll(),
          PEEK_POLL_ERROR_TIMEOUT
        );
      }
    }
  }

  /**
   * Before starting polling, call getInitialDocumentUpdateEvents to get the history of events
   * when coming online.
   *
   * This methods paginates back until
   * - (a) all events in the room have been received. In that case we return all events.
   * - (b) it encounters a *readable* snapshot. In this case we return the snapshot event and all
   *        update events that occur after that latest snapshot
   *
   * Media-backed (v2) snapshots are resolved here — the blob is fetched and
   * attached to the returned event — because the decision "is this snapshot
   * usable, or must I keep walking backwards?" is a pagination decision.
   * An unreadable snapshot (bad pointer, failed fetch, corrupt blob) is skipped
   * entirely: it does not stop the walk and it does not set last_event_id, so
   * catch-up falls back to an older readable snapshot or to replaying updates.
   *
   * (if typeFilter is set we retrieve all events of that type. TODO: can we deprecate this param?)
   */
  public async getInitialDocumentUpdateEvents(typeFilter?: string) {
    let ret: any[] = [];
    let token = "";
    let hasNextPage = true;
    let lastEventInSnapshot: string | undefined;
    this._snapshotDegradations = [];
    while (hasNextPage) {
      const res = await this.matrixClient.createMessagesRequest(
        this.roomId,
        token,
        30,
        Direction.Backward
        // TODO: filter? (see IXO-4117 — derive from translator.readEventTypes)
      );

      const events = await this.decryptRawEventsIfNecessary(res.chunk);

      for (let event of events) {
        if (typeFilter) {
          if (event.type === typeFilter) {
            ret.push(event);
          }
        } else if (this.translator.isSnapshotV2Event(event)) {
          const resolved = await this.resolveSnapshotV2Event(event);
          if (!resolved) {
            // unreadable: keep paginating backwards
            continue;
          }
          ret.push(resolved);
          lastEventInSnapshot = event.content.last_event_id;
        } else if (this.translator.isSnapshotEvent(event)) {
          ret.push(event);
          lastEventInSnapshot = event.content.last_event_id;
        } else if (this.translator.isUpdateEvent(event)) {
          if (lastEventInSnapshot && lastEventInSnapshot === event.event_id) {
            if (!this.latestToken) {
              this.latestToken = res.start;
            }
            return this.finishCatchUp(ret);
          }
          this.messagesSinceSnapshot++;
          ret.push(event);
        }
      }

      token = res.end || "";
      if (!this.latestToken) {
        this.latestToken = res.start;
      }
      hasNextPage = !!(res.start !== res.end && res.end);
    }
    return this.finishCatchUp(ret);
  }

  /**
   * Fetch the document blob for a v2 snapshot pointer.
   * Returns the event with the update bytes attached, or undefined when the
   * snapshot is unreadable (a degradation is reported in that case).
   */
  private async resolveSnapshotV2Event(event: any): Promise<any | undefined> {
    const pointer = this.translator.parseSnapshotV2Pointer(event);
    if (!pointer) {
      this.reportSnapshotDegradation({
        eventId: event?.event_id,
        eventType: event?.type,
        reason: "invalid_pointer",
      });
      return undefined;
    }
    try {
      const update = await this.translator.fetchSnapshotV2Update(
        this.matrixClient,
        pointer
      );
      return attachResolvedUpdate(event, update);
    } catch (e) {
      this.reportSnapshotDegradation({
        eventId: event?.event_id,
        eventType: event?.type,
        reason: "fetch_failed",
        mxcUrl: pointer.mxcUrl,
        error: e,
      });
      return undefined;
    }
  }

  private reportSnapshotDegradation(degradation: SnapshotDegradation) {
    this._snapshotDegradations.push(degradation);
    console.warn(
      `matrix-crdt: ignoring unreadable snapshot (${degradation.reason})`,
      degradation.eventType,
      degradation.eventId,
      degradation.mxcUrl,
      degradation.error
    );
    this._onSnapshotDegraded.fire(degradation);
  }

  /**
   * Guard the one outcome that must never happen: reporting an empty document
   * as the room's state because the only snapshot we found was unreadable.
   */
  private finishCatchUp(ret: any[]) {
    if (this._snapshotDegradations.length) {
      const hasReadableUpdate = ret.some(
        (e) => this.translator.getUpdateBytes(e) !== undefined
      );
      if (!hasReadableUpdate) {
        throw new SnapshotUnavailableError([...this._snapshotDegradations]);
      }
    }
    return ret.reverse();
  }

  /**
   * Start polling the room for messages
   */
  public startPolling() {
    if (this.polling) {
      throw new Error("already polling");
    }
    this.polling = true;
    this.peekPoll();
  }

  public get isStarted() {
    return this.polling;
  }

  public dispose() {
    this.disposed = true;
    super.dispose();
    if (this.pollRetryTimeout) {
      clearTimeout(this.pollRetryTimeout);
    }
    if (this.pendingPollRequest) {
      // this.pendingPollRequest.abort();
    }
    // Note: Listener registration disabled to avoid conflicts
    // this.matrixClient.off(RoomEvent.Timeline, this.matrixRoomListener);
  }
}
