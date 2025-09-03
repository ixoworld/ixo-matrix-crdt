import { writeVarUint as l, writeVarUint8Array as f, createEncoder as g, toUint8Array as m } from "./ixo-matrix-crdt17.js";
import { createModuleLogger as b } from "./ixo-matrix-crdt22.js";
import y from "simple-peer";
import { announceSignalingInfo as a } from "./ixo-matrix-crdt20.js";
import { customMessage as C } from "./ixo-matrix-crdt53.js";
import { BOLD as n, GREY as d, UNBOLD as h, UNCOLOR as p } from "./ixo-matrix-crdt35.js";
const s = b("y-webrtc");
class L {
  /**
   * @param {SignalingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Room} room
   */
  constructor(i, c, r, e) {
    this.remotePeerId = r, this.room = e, s("establishing connection to ", n, r), this.peer = new y({ initiator: c, ...e.provider.peerOpts }), this.peer.on("signal", (t) => {
      i.publishSignalingMessage(e, {
        to: r,
        from: e.peerId,
        type: "signal",
        signal: t
      });
    }), this.peer.on("connect", () => {
      s("connected to ", n, r), this.connected = !0, e.onPeerConnected((t) => {
        const o = g();
        l(o, C), f(o, t), this.sendWebrtcConn(o);
      });
    }), this.peer.on("close", () => {
      this.connected = !1, this.closed = !0, e.webrtcConns.has(this.remotePeerId) && (e.webrtcConns.delete(this.remotePeerId), e.provider.emit("peers", [
        {
          removed: [this.remotePeerId],
          added: [],
          webrtcPeers: Array.from(e.webrtcConns.keys()),
          bcPeers: Array.from(e.bcConns)
        }
      ])), this.peer.destroy(), s("closed connection to ", n, r), a(e);
    }), this.peer.on("error", (t) => {
      s("Error in connection to ", n, r, ": ", t), a(e);
    }), this.peer.on("data", (t) => {
      s(
        "received message from ",
        n,
        this.remotePeerId,
        d,
        " (",
        e.name,
        ")",
        h,
        p
      ), this.room.readMessage(t, (o) => {
        this.sendWebrtcConn(o);
      });
    });
  }
  closed = !1;
  connected = !1;
  synced = !1;
  sendWebrtcConn(i) {
    s(
      "send message to ",
      n,
      this.remotePeerId,
      h,
      d,
      " (",
      this.room.name,
      ")",
      p
    );
    try {
      this.peer.send(m(i));
    } catch {
    }
  }
  peer;
  destroy() {
    this.peer.destroy();
  }
}
export {
  L as WebrtcConn
};
