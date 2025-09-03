import { readVarUint as m, readVarUint8Array as y, readAny as f, createDecoder as p } from "./ixo-matrix-crdt16.js";
import { writeVarUint as d, writeVarUint8Array as w, toUint8Array as c, writeAny as u, createEncoder as i } from "./ixo-matrix-crdt17.js";
import { readSyncMessage as U, messageYjsUpdate as b, writeUpdate as A } from "./ixo-matrix-crdt19.js";
import { createModuleLogger as S } from "./ixo-matrix-crdt22.js";
import { MatrixWebrtcProvider as v } from "./ixo-matrix-crdt5.js";
import { decodeBase64 as M, encodeBase64 as H } from "./ixo-matrix-crdt13.js";
const P = S("signed-webrtc"), g = 0, h = 1;
class C extends v {
  constructor(s, t, e, n, a, o, r) {
    super(s, t, e, r), this.sign = n, this.verify = a, this.awareness = o, s.on("update", this._docUpdateHandler), s.on("destroy", this.destroy.bind(this)), this.awareness && this.awareness.on("update", this._awarenessUpdateHandler), typeof window < "u" && window.addEventListener("beforeunload", () => {
      this.awareness && this.awareness.setLocalState(null), this.destroy();
    });
  }
  awareness;
  onCustomMessage = (s, t) => {
    const e = p(s), n = i();
    switch (m(e)) {
      case g:
        const o = f(e);
        this.verify(o).then(
          () => {
            const r = M(o.message), l = p(r);
            if (U(
              l,
              n,
              this.doc,
              this
            ) !== b)
              throw P("error: expect only updates"), new Error("error: only update messages expected");
          },
          (r) => {
            console.error("couldn't verify message", r);
          }
        );
        break;
      case h:
        if (this.awareness) {
          const r = y(e);
          this.awareness.applyAwarenessUpdateFromBytes(r);
        }
        break;
    }
  };
  onPeerConnected = (s) => {
    if (console.log("WebRTC peer connected for real-time document sync"), this.awareness && this.awareness.getLocalState()) {
      const e = i();
      d(e, h), w(e, this.awareness.encodeAwarenessUpdate()), s(c(e));
    }
  };
  _docUpdateHandler = async (s, t) => {
    if (!this.room || t === this)
      return;
    const e = i();
    d(e, g);
    const n = i();
    A(n, s);
    const a = {
      message: H(c(n))
    };
    await this.sign(a), u(e, a), this.room.broadcastRoomMessage(c(e));
  };
  // Add awareness update handler
  _awarenessUpdateHandler = ({ added: s, updated: t, removed: e }, n) => {
    const a = this.room;
    if (!a || !this.awareness) {
      console.log("[SignedWebrtcProvider] No room or awareness available");
      return;
    }
    s.concat(t).concat(e), console.log("[SignedWebrtcProvider] Awareness change:", { added: s, updated: t, removed: e });
    const o = i();
    d(o, h), w(o, this.awareness.encodeAwarenessUpdate());
    const r = c(o);
    console.log("[SignedWebrtcProvider] Broadcasting awareness update, size:", r.length), a.broadcastRoomMessage(r);
  };
  destroy() {
    this.awareness && this.awareness.off("update", this._awarenessUpdateHandler), this.doc.off("update", this._docUpdateHandler), this.doc.off("destroy", this.destroy), super.destroy();
  }
}
export {
  C as SignedWebrtcProvider,
  h as messageAwareness,
  g as messageSync
};
