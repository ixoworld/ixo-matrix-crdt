import { Observable as d } from "./ixo-matrix-crdt37.js";
import { getUnixTime as a } from "./ixo-matrix-crdt36.js";
import { min as f, log10 as m } from "./ixo-matrix-crdt27.js";
const p = 1200, g = 2500, c = 3e4, r = (e) => {
  if (e.shouldConnect && e.ws === null) {
    const s = new WebSocket(e.url), n = e.binaryType;
    let o = null;
    n && (s.binaryType = n), e.ws = s, e.connecting = !0, e.connected = !1, s.onmessage = (t) => {
      e.lastMessageReceived = a();
      const i = t.data, u = typeof i == "string" ? JSON.parse(i) : i;
      u && u.type === "pong" && (clearTimeout(o), o = setTimeout(l, c / 2)), e.emit("message", [u, e]);
    };
    const h = (t) => {
      e.ws !== null && (e.ws = null, e.connecting = !1, e.connected ? (e.connected = !1, e.emit("disconnect", [{ type: "disconnect", error: t }, e])) : e.unsuccessfulReconnects++, setTimeout(r, f(m(e.unsuccessfulReconnects + 1) * p, g), e)), clearTimeout(o);
    }, l = () => {
      e.ws === s && e.send({
        type: "ping"
      });
    };
    s.onclose = () => h(null), s.onerror = (t) => h(t), s.onopen = () => {
      e.lastMessageReceived = a(), e.connecting = !1, e.connected = !0, e.unsuccessfulReconnects = 0, e.emit("connect", [{ type: "connect" }, e]), o = setTimeout(l, c / 2);
    };
  }
};
class b extends d {
  /**
   * @param {string} url
   * @param {object} opts
   * @param {'arraybuffer' | 'blob' | null} [opts.binaryType] Set `ws.binaryType`
   */
  constructor(s, { binaryType: n } = {}) {
    super(), this.url = s, this.ws = null, this.binaryType = n || null, this.connected = !1, this.connecting = !1, this.unsuccessfulReconnects = 0, this.lastMessageReceived = 0, this.shouldConnect = !0, this._checkInterval = setInterval(() => {
      this.connected && c < a() - this.lastMessageReceived && this.ws.close();
    }, c / 2), r(this);
  }
  /**
   * @param {any} message
   */
  send(s) {
    this.ws && this.ws.send(JSON.stringify(s));
  }
  destroy() {
    clearInterval(this._checkInterval), this.disconnect(), super.destroy();
  }
  disconnect() {
    this.shouldConnect = !1, this.ws !== null && this.ws.close();
  }
  connect() {
    this.shouldConnect = !0, !this.connected && this.ws === null && r(this);
  }
}
export {
  b as WebsocketClient
};
