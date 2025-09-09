import { create as c } from "./ixo-matrix-crdt26.js";
import { createModuleLogger as m } from "./ixo-matrix-crdt22.js";
import { setIfUndefined as d } from "./ixo-matrix-crdt33.js";
import { floor as g } from "./ixo-matrix-crdt27.js";
import { Observable as a } from "./ixo-matrix-crdt37.js";
import { rand as p } from "./ixo-matrix-crdt39.js";
import { deriveKey as f } from "./ixo-matrix-crdt40.js";
import { globalSignalingConns as h, globalRooms as n } from "./ixo-matrix-crdt20.js";
import { Room as u } from "./ixo-matrix-crdt41.js";
import { SignalingConn as C } from "./ixo-matrix-crdt42.js";
m("y-webrtc");
const y = (r, o, e, s, i) => {
  if (n.has(s))
    throw c(`A Yjs Doc connected to room "${s}" already exists!`);
  const t = new u(r, o, e, s, i);
  return n.set(s, t), t;
};
class B extends a {
  constructor(o, {
    signaling: e = [
      "wss://signaling.yjs.dev",
      "wss://y-webrtc-signaling-eu.herokuapp.com",
      "wss://y-webrtc-signaling-us.herokuapp.com"
    ],
    password: s = void 0,
    // awareness = new awarenessProtocol.Awareness(doc),
    maxConns: i = 20 + g(p() * 15),
    // the random factor reduces the chance that n clients form a cluster
    filterBcConns: t = !0,
    peerOpts: v = {}
    // simple-peer options. See https://github.com/feross/simple-peer#peer--new-peeropts
  } = {}) {
    super(), this.roomName = o, this.filterBcConns = t, this.shouldConnect = !1, this.signalingUrls = e, this.signalingConns = [], this.maxConns = i, this.peerOpts = { iceServers: [] }, this.key = s ? f(s, o) : Promise.resolve(void 0), this.key.then((l) => {
      this.room = y(
        this,
        this.onCustomMessage,
        this.onPeerConnected,
        o,
        l
      ), this.shouldConnect ? this.room.connect() : this.room.disconnect();
    }), this.connect();
  }
  // public readonly awareness: awarenessProtocol.Awareness;
  shouldConnect = !1;
  filterBcConns = !0;
  signalingUrls;
  signalingConns;
  peerOpts;
  maxConns;
  key;
  room;
  /**
   * @type {boolean}
   */
  get connected() {
    return this.room !== null && this.shouldConnect;
  }
  connect() {
    this.shouldConnect = !0, this.signalingUrls.forEach((o) => {
      const e = d(
        h,
        o,
        () => new C(o)
      );
      this.signalingConns.push(e), e.providers.add(this);
    }), this.room && this.room.connect();
  }
  disconnect() {
    this.shouldConnect = !1, this.signalingConns.forEach((o) => {
      o.providers.delete(this), o.providers.size === 0 && (o.destroy(), h.delete(o.url));
    }), this.room && this.room.disconnect();
  }
  destroy() {
    this.key.then(() => {
      this.room?.destroy(), n.delete(this.roomName);
    }), super.destroy();
  }
}
export {
  B as WebrtcProvider
};
