import { setIfUndefined as c } from "./ixo-matrix-crdt37.js";
import { create as l } from "./ixo-matrix-crdt34.js";
import { fromBase64 as h, toBase64 as i, createUint8ArrayFromArrayBuffer as u } from "./ixo-matrix-crdt54.js";
import { onChange as b, varStorage as f, offChange as g } from "./ixo-matrix-crdt46.js";
const r = /* @__PURE__ */ new Map();
class m {
  /**
   * @param {string} room
   */
  constructor(s) {
    this.room = s, this.onmessage = null, this._onChange = (e) => e.key === s && this.onmessage !== null && this.onmessage({ data: h(e.newValue || "") }), b(this._onChange);
  }
  /**
   * @param {ArrayBuffer} buf
   */
  postMessage(s) {
    f.setItem(this.room, i(u(s)));
  }
  close() {
    g(this._onChange);
  }
}
const d = typeof BroadcastChannel > "u" ? m : BroadcastChannel, a = (n) => c(r, n, () => {
  const s = l(), e = new d(n);
  return e.onmessage = (t) => s.forEach((o) => o(t.data, "broadcastchannel")), {
    bc: e,
    subs: s
  };
}), w = (n, s) => (a(n).subs.add(s), s), M = (n, s) => {
  const e = a(n), t = e.subs.delete(s);
  return t && e.subs.size === 0 && (e.bc.close(), r.delete(n)), t;
}, _ = (n, s, e = null) => {
  const t = a(n);
  t.bc.postMessage(s), t.subs.forEach((o) => o(s, e));
};
export {
  _ as publish,
  w as subscribe,
  M as unsubscribe
};
