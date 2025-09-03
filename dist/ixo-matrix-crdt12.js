import * as r from "lodash";
import { lifecycle as o, event as i } from "vscode-lib";
import * as a from "yjs";
const d = {
  // throttle flushing write events to matrix by 500ms
  flushInterval: process.env.NODE_ENV === "test" ? 100 : 500,
  // if writing to the room fails, wait 30 seconds before retrying
  retryIfForbiddenInterval: 1e3 * 30
};
class p extends o.Disposable {
  constructor(t, s, e = {}) {
    super(), this.matrixClient = t, this.translator = s, this.opts = { ...d, ...e }, this.throttledFlushUpdatesToMatrix = r.throttle(
      this.flushUpdatesToMatrix,
      this.canWrite ? this.opts.flushInterval : this.opts.retryIfForbiddenInterval
    );
  }
  pendingUpdates = [];
  isSendingUpdates = !1;
  _canWrite = !0;
  retryTimeoutHandler;
  roomId;
  _onCanWriteChanged = this._register(
    new i.Emitter()
  );
  onCanWriteChanged = this._onCanWriteChanged.event;
  _onSentAllEvents = this._register(
    new i.Emitter()
  );
  onSentAllEvents = this._onSentAllEvents.event;
  throttledFlushUpdatesToMatrix;
  opts;
  setCanWrite(t) {
    this._canWrite !== t && (this._canWrite = t, this._onCanWriteChanged.fire());
  }
  flushUpdatesToMatrix = async () => {
    if (this.isSendingUpdates || !this.pendingUpdates.length || !this.roomId)
      return;
    this.isSendingUpdates = !0;
    const t = a.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];
    let s = !1;
    try {
      console.log("Sending updates"), await this.translator.sendUpdate(this.matrixClient, this.roomId, t), this.setCanWrite(!0), console.log("sent updates");
    } catch (e) {
      if (e.errcode === "M_FORBIDDEN") {
        console.warn("not allowed to edit document", e), this.setCanWrite(!1);
        try {
          await this.matrixClient.joinRoom(this.roomId), console.log("joined room", this.roomId), s = !0;
        } catch (n) {
          console.warn("failed to join room", n);
        }
      } else
        console.error("error sending updates", e);
      this.pendingUpdates.unshift(t);
    } finally {
      this.isSendingUpdates = !1;
    }
    this.pendingUpdates.length ? this.retryTimeoutHandler = setTimeout(
      () => {
        this.throttledFlushUpdatesToMatrix();
      },
      s ? 0 : this.canWrite ? this.opts.flushInterval : this.opts.retryIfForbiddenInterval
    ) : (console.log("_onSentAllEvents"), this._onSentAllEvents.fire());
  };
  async initialize(t) {
    this.roomId = t, this.throttledFlushUpdatesToMatrix();
  }
  get canWrite() {
    return this._canWrite;
  }
  writeUpdate(t) {
    this.pendingUpdates.push(t), this.throttledFlushUpdatesToMatrix();
  }
  // Helper method that's mainly used in unit tests
  async waitForFlush() {
    !this.pendingUpdates.length && !this.isSendingUpdates || await i.Event.toPromise(this.onSentAllEvents);
  }
  dispose() {
    super.dispose(), clearTimeout(this.retryTimeoutHandler), this.throttledFlushUpdatesToMatrix.cancel();
  }
}
export {
  p as ThrottledMatrixWriter
};
