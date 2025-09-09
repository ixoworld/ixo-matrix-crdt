import { fromBase64 as g, toBase64 as b } from "./ixo-matrix-crdt54.js";
import { createModuleLogger as y } from "./ixo-matrix-crdt22.js";
import { setIfUndefined as m } from "./ixo-matrix-crdt33.js";
import { WebsocketClient as a } from "./ixo-matrix-crdt55.js";
import { decryptJson as u, encryptJson as d } from "./ixo-matrix-crdt40.js";
import { globalRooms as c } from "./ixo-matrix-crdt20.js";
import { WebrtcConn as h } from "./ixo-matrix-crdt56.js";
const l = y("y-webrtc");
class A extends a {
  providers = /* @__PURE__ */ new Set();
  constructor(n) {
    super(n), this.on("connect", () => {
      l(`connected (${n})`);
      const o = Array.from(c.keys());
      this.send({ type: "subscribe", topics: o }), c.forEach(
        (r) => this.publishSignalingMessage(r, {
          type: "announce",
          from: r.peerId
        })
      );
    }), this.on("message", (o) => {
      switch (o.type) {
        case "publish": {
          const r = o.topic, s = c.get(r);
          if (s == null || typeof r != "string")
            return;
          const p = (e) => {
            const t = s.webrtcConns, i = s.peerId;
            if (e == null || e.from === i || e.to !== void 0 && e.to !== i || s.bcConns.has(e.from))
              return;
            const f = t.has(e.from) ? () => {
            } : () => s.provider.emit("peers", [
              {
                removed: [],
                added: [e.from],
                webrtcPeers: Array.from(s.webrtcConns.keys()),
                bcPeers: Array.from(s.bcConns)
              }
            ]);
            switch (e.type) {
              case "announce":
                t.size < s.provider.maxConns && (m(
                  t,
                  e.from,
                  () => new h(this, !0, e.from, s)
                ), f());
                break;
              case "signal":
                e.to === i && (m(
                  t,
                  e.from,
                  () => new h(this, !1, e.from, s)
                ).peer.signal(e.signal), f());
                break;
            }
          };
          s.key ? typeof o.data == "string" && u(g(o.data), s.key).then(p) : p(o.data);
        }
      }
    }), this.on("disconnect", () => l(`disconnect (${n})`));
  }
  publishSignalingMessage = (n, o) => {
    n.key ? d(o, n.key).then((r) => {
      this.send({
        type: "publish",
        topic: n.name,
        data: b(r)
      });
    }) : this.send({ type: "publish", topic: n.name, data: o });
  };
}
export {
  A as SignalingConn
};
