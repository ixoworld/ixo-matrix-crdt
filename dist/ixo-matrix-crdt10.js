import { MatrixEvent as l, Method as h, Direction as p } from "matrix-js-sdk";
import { lifecycle as d, event as c } from "vscode-lib";
const u = 30 * 1e3, m = 30 * 1e3, f = {
  snapshotInterval: 30
  // send a snapshot after 30 events
};
class w extends d.Disposable {
  constructor(s, e, t, n = {}) {
    super(), this.matrixClient = s, this.roomId = e, this.translator = t, this.opts = { ...f, ...n };
  }
  latestToken;
  disposed = !1;
  polling = !1;
  pendingPollRequest;
  pollRetryTimeout;
  messagesSinceSnapshot = 0;
  _onEvents = this._register(
    new c.Emitter()
  );
  onEvents = this._onEvents.event;
  opts;
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
  matrixRoomListener = (s, e, t) => {
    throw console.error("not expected; Room.timeline on MatrixClient"), new Error(
      "unexpected, we don't use /sync calls for MatrixReader, startClient should not be used on the Matrix client"
    );
  };
  /**
   * Handle incoming events to determine whether a snapshot message needs to be sent
   *
   * MatrixReader keeps an internal counter of messages received.
   * every opts.snapshotInterval messages, we send a snapshot of the entire document state.
   */
  processIncomingEventsForSnapshot(s) {
    let e = !1;
    for (let t of s)
      if (this.translator.isUpdateEvent(t)) {
        if (t.room_id !== this.roomId)
          throw new Error("event received with invalid roomid");
        this.messagesSinceSnapshot++, this.messagesSinceSnapshot % this.opts.snapshotInterval === 0 && t.user_id === this.matrixClient.credentials.userId && (e = !0);
      } else this.translator.isSnapshotEvent(t) && (this.messagesSinceSnapshot = 0, e = !1);
    return e;
  }
  async decryptRawEventsIfNecessary(s) {
    return await Promise.all(
      s.map(async (t) => {
        if (t.type === "m.room.encrypted") {
          const n = new l(t);
          return await this.matrixClient.decryptEventIfNeeded(n), n.getEffectiveEvent();
        } else
          return t;
      })
    );
  }
  /**
   * Peek for new room events using the Matrix /events API (long-polling)
   * This function automatically keeps polling until MatrixReader.dispose() is called
   */
  async peekPoll() {
    if (!this.latestToken)
      throw new Error("polling but no pagination token");
    if (!this.disposed)
      try {
        this.pendingPollRequest = this.matrixClient.http.authedRequest(
          h.Get,
          "/events",
          {
            room_id: this.roomId,
            timeout: u.toString(),
            from: this.latestToken
          }
        );
        const s = await this.pendingPollRequest;
        if (this.pendingPollRequest = void 0, this.disposed)
          return;
        const e = await this.decryptRawEventsIfNecessary(s.chunk), t = this.processIncomingEventsForSnapshot(e);
        e.length && this._onEvents.fire({ events: e, shouldSendSnapshot: t }), this.latestToken = s.end, this.peekPoll();
      } catch (s) {
        console.error("peek error", s), this.disposed || (this.pollRetryTimeout = setTimeout(
          () => this.peekPoll(),
          m
        ));
      }
  }
  /**
   * Before starting polling, call getInitialDocumentUpdateEvents to get the history of events
   * when coming online.
   *
   * This methods paginates back until
   * - (a) all events in the room have been received. In that case we return all events.
   * - (b) it encounters a snapshot. In this case we return the snapshot event and all update events
   *        that occur after that latest snapshot
   *
   * (if typeFilter is set we retrieve all events of that type. TODO: can we deprecate this param?)
   */
  async getInitialDocumentUpdateEvents(s) {
    let e = [], t = "", n = !0, r;
    for (; n; ) {
      const o = await this.matrixClient.createMessagesRequest(
        this.roomId,
        t,
        30,
        p.Backward
        // TODO: filter?
      ), a = await this.decryptRawEventsIfNecessary(o.chunk);
      for (let i of a)
        if (s)
          i.type === s && e.push(i);
        else if (this.translator.isSnapshotEvent(i))
          e.push(i), r = i.content.last_event_id;
        else if (this.translator.isUpdateEvent(i)) {
          if (r && r === i.event_id)
            return this.latestToken || (this.latestToken = o.start), e.reverse();
          this.messagesSinceSnapshot++, e.push(i);
        }
      t = o.end || "", this.latestToken || (this.latestToken = o.start), n = !!(o.start !== o.end && o.end);
    }
    return e.reverse();
  }
  /**
   * Start polling the room for messages
   */
  startPolling() {
    if (this.polling)
      throw new Error("already polling");
    this.polling = !0, this.peekPoll();
  }
  get isStarted() {
    return this.polling;
  }
  dispose() {
    this.disposed = !0, super.dispose(), this.pollRetryTimeout && clearTimeout(this.pollRetryTimeout), this.pendingPollRequest;
  }
}
export {
  w as MatrixReader
};
