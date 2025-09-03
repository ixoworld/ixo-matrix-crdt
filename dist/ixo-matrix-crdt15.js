import { MESSAGE_EVENT_TYPE as p } from "./ixo-matrix-crdt23.js";
import { encodeBase64 as d } from "./ixo-matrix-crdt13.js";
const i = {
  // set to true to send everything encapsulated in a m.room.message,
  // so you can debug rooms easily in element or other matrix clients
  updatesAsRegularMessages: !1,
  updateEventType: "matrix-crdt.doc_update",
  snapshotEventType: "matrix-crdt.doc_snapshot"
};
class y {
  opts;
  constructor(t = {}) {
    this.opts = { ...i, ...t };
  }
  async sendUpdate(t, s, o) {
    const a = d(o), e = {
      update: a
    };
    if (this.opts.updatesAsRegularMessages) {
      const n = {
        body: this.opts.updateEventType + ": " + a,
        msgtype: this.opts.updateEventType,
        ...e
      };
      "scheduler" in t && (t.scheduler = void 0), await t.sendEvent(s, p, n, "");
    } else
      await t.sendEvent(s, this.opts.updateEventType, e, "");
  }
  async sendSnapshot(t, s, o, a) {
    const e = d(o), n = {
      update: e,
      last_event_id: a
    };
    if (this.opts.updatesAsRegularMessages) {
      const r = {
        body: this.opts.snapshotEventType + ": " + e,
        msgtype: this.opts.snapshotEventType,
        ...n
      };
      "scheduler" in t && (t.scheduler = void 0), await t.sendEvent(s, p, r, "");
    } else
      await t.sendEvent(s, this.opts.snapshotEventType, n, "");
  }
  isUpdateEvent(t) {
    return this.opts.updatesAsRegularMessages ? t.type === p && t.content.msgtype === this.opts.updateEventType : t.type === this.opts.updateEventType;
  }
  isSnapshotEvent(t) {
    return this.opts.updatesAsRegularMessages ? t.type === p && t.content.msgtype === this.opts.snapshotEventType : t.type === this.opts.snapshotEventType;
  }
  get WrappedEventType() {
    return this.opts.updatesAsRegularMessages ? p : this.opts.updateEventType;
  }
}
export {
  y as MatrixCRDTEventTranslator
};
