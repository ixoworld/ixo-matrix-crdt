import { readVarUint as p, createDecoder as y, readVarUint8Array as g } from "./ixo-matrix-crdt16.js";
import { writeVarUint as a, toUint8Array as o, createEncoder as n, writeVarUint8Array as w } from "./ixo-matrix-crdt17.js";
import { Awareness as f, removeAwarenessStates as l, applyAwarenessUpdate as u, encodeAwarenessUpdate as m } from "./ixo-matrix-crdt18.js";
import { readSyncMessage as U, messageYjsSyncStep1 as A, writeSyncStep1 as b, writeUpdate as S } from "./ixo-matrix-crdt19.js";
import { globalRooms as M } from "./ixo-matrix-crdt20.js";
import { WebrtcProvider as H } from "./ixo-matrix-crdt21.js";
import { createModuleLogger as _ } from "./ixo-matrix-crdt22.js";
const v = _("y-webrtc"), d = 0, x = 3, h = 1;
class I extends H {
  constructor(r, s, e, t = new f(s)) {
    super(r, e), this.doc = s, this.awareness = t, s.on("destroy", this.destroy.bind(this)), this.doc.on("update", this._docUpdateHandler), this.awareness.on("update", this._awarenessUpdateHandler), window.addEventListener("beforeunload", () => {
      l(
        this.awareness,
        [s.clientID],
        "window unload"
      ), M.forEach((i) => {
        i.disconnect();
      });
    });
  }
  onCustomMessage = (r, s) => {
    const e = y(r), t = n();
    switch (p(e)) {
      case d: {
        a(t, d), U(
          e,
          t,
          this.doc,
          this
        ) === A && s(o(t));
        break;
      }
      case h:
        u(
          this.awareness,
          g(e),
          this
        );
        break;
    }
  };
  onPeerConnected = (r) => {
    const s = n();
    a(s, d), b(s, this.doc), r(o(s));
    const e = n(), t = this.awareness.getStates();
    t.size > 0 && (a(e, h), w(
      e,
      m(
        this.awareness,
        Array.from(t.keys())
      )
    ), r(o(e)));
  };
  /**
   * Listens to Yjs updates and sends them to remote peers
   */
  _docUpdateHandler = (r, s) => {
    if (!this.room)
      return;
    const e = n();
    a(e, d), S(e, r), this.room.broadcastRoomMessage(o(e));
  };
  /**
   * Listens to Awareness updates and sends them to remote peers
   */
  _awarenessUpdateHandler = ({ added: r, updated: s, removed: e }, t) => {
    if (!this.room)
      return;
    const i = r.concat(s).concat(e);
    v(
      "awareness change ",
      { added: r, updated: s, removed: e },
      "local",
      this.awareness.clientID
    );
    const c = n();
    a(c, h), w(
      c,
      m(this.awareness, i)
    ), this.room.broadcastRoomMessage(o(c));
  };
  destroy() {
    this.doc.off("update", this._docUpdateHandler), this.awareness.off("update", this._awarenessUpdateHandler), this.doc.off("destroy", this.destroy), super.destroy();
  }
}
export {
  I as DocWebrtcProvider,
  h as messageAwareness,
  x as messageQueryAwareness,
  d as messageSync
};
