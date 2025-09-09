import { publish as l, subscribe as C, unsubscribe as w } from "./ixo-matrix-crdt51.js";
import { readVarUint as B, createDecoder as M, readUint8 as I, readVarString as P, readVarUint8Array as U } from "./ixo-matrix-crdt16.js";
import { toUint8Array as n, writeVarUint as i, writeUint8 as f, createEncoder as a, writeVarString as g, writeVarUint8Array as y } from "./ixo-matrix-crdt17.js";
import { createModuleLogger as S } from "./ixo-matrix-crdt22.js";
import { createMutex as k } from "./ixo-matrix-crdt52.js";
import { uuidv4 as A } from "./ixo-matrix-crdt39.js";
import { decrypt as V, encrypt as v } from "./ixo-matrix-crdt40.js";
import { announceSignalingInfo as x, globalSignalingConns as E } from "./ixo-matrix-crdt20.js";
import { messageBcPeerId as h, customMessage as b } from "./ixo-matrix-crdt53.js";
import { BOLD as D, UNBOLD as L } from "./ixo-matrix-crdt38.js";
const N = S("y-webrtc");
class J {
  // public readonly awareness: awarenessProtocol.Awareness;
  constructor(e, s, t, o, d) {
    this.provider = e, this.onCustomMessage = s, this.onPeerConnected = t, this.name = o, this.key = d;
  }
  /**
   * Do not assume that peerId is unique. This is only meant for sending signaling messages.
   */
  peerId = A();
  synced = !1;
  webrtcConns = /* @__PURE__ */ new Map();
  bcConns = /* @__PURE__ */ new Set();
  mux = k();
  bcconnected = !1;
  _bcSubscriber = (e) => V(new Uint8Array(e), this.key).then(
    (s) => this.mux(() => {
      this.readMessage(s, (t) => {
        this.broadcastBcMessage(n(t));
      });
    })
  );
  // public checkIsSynced() {
  //   let synced = true;
  //   this.webrtcConns.forEach((peer) => {
  //     if (!peer.synced) {
  //       synced = false;
  //     }
  //   });
  //   if ((!synced && this.synced) || (synced && !this.synced)) {
  //     this.synced = synced;
  //     this.provider.emit("synced", [{ synced }]);
  //     log(
  //       "synced ",
  //       logging.BOLD,
  //       this.name,
  //       logging.UNBOLD,
  //       " with all peers"
  //     );
  //   }
  // }
  readMessage = (e, s) => {
    const t = M(e), o = a(), d = B(t), m = (c) => {
      i(o, b), y(o, c), s(o);
    };
    switch (d) {
      case b:
        this.onCustomMessage(
          U(t),
          m
        );
        break;
      // case messageSync: {
      //   encoding.writeVarUint(encoder, messageSync);
      //   const syncMessageType = syncProtocol.readSyncMessage(
      //     decoder,
      //     encoder,
      //     this.doc,
      //     this
      //   );
      //   if (
      //     syncMessageType === syncProtocol.messageYjsSyncStep2 &&
      //     !this.synced
      //   ) {
      //     syncedCallback();
      //   }
      //   if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
      //     sendReply = true;
      //   }
      //   break;
      // }
      // case messageQueryAwareness:
      //   encoding.writeVarUint(encoder, messageAwareness);
      //   encoding.writeVarUint8Array(
      //     encoder,
      //     awarenessProtocol.encodeAwarenessUpdate(
      //       this.awareness,
      //       Array.from(this.awareness.getStates().keys())
      //     )
      //   );
      //   sendReply = true;
      //   break;
      // case messageAwareness:
      //   awarenessProtocol.applyAwarenessUpdate(
      //     this.awareness,
      //     decoding.readVarUint8Array(decoder),
      //     this
      //   );
      //   break;
      case h: {
        const c = I(t) === 1, r = P(t);
        if (r !== this.peerId && (this.bcConns.has(r) && !c || !this.bcConns.has(r) && c)) {
          const p = [], u = [];
          c ? (this.bcConns.add(r), u.push(r), this.onPeerConnected(m)) : (this.bcConns.delete(r), p.push(r)), this.provider.emit("peers", [
            {
              added: u,
              removed: p,
              webrtcPeers: Array.from(this.webrtcConns.keys()),
              bcPeers: Array.from(this.bcConns)
            }
          ]), this.broadcastBcPeerId();
        }
        break;
      }
      default:
        console.error("Unable to compute message");
        return;
    }
  };
  broadcastBcPeerId() {
    if (this.provider.filterBcConns) {
      const e = a();
      i(e, h), f(e, 1), g(e, this.peerId), this.broadcastBcMessage(n(e));
    }
  }
  broadcastWebrtcConn(e) {
    N("broadcast message in ", D, this.name, L), this.webrtcConns.forEach((s) => {
      try {
        s.peer.send(e);
      } catch {
      }
    });
  }
  broadcastRoomMessage(e) {
    const s = a();
    i(s, b), y(s, e);
    const t = n(s);
    this.bcconnected && this.broadcastBcMessage(t), this.broadcastWebrtcConn(t);
  }
  broadcastBcMessage(e) {
    return v(e, this.key).then((s) => this.mux(() => l(this.name, s)));
  }
  connect() {
    x(this);
    const e = this.name;
    C(e, this._bcSubscriber), this.bcconnected = !0, this.broadcastBcPeerId();
  }
  disconnect() {
    E.forEach((s) => {
      s.connected && s.send({ type: "unsubscribe", topics: [this.name] });
    });
    const e = a();
    i(e, h), f(e, 0), g(e, this.peerId), this.broadcastBcMessage(n(e)), w(this.name, this._bcSubscriber), this.bcconnected = !1, this.webrtcConns.forEach((s) => s.destroy());
  }
  destroy() {
    this.disconnect();
  }
}
export {
  J as Room
};
