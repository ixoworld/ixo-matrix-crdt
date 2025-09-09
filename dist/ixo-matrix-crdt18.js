import { writeVarUint as m, writeVarString as L, createEncoder as k, toUint8Array as y } from "./ixo-matrix-crdt17.js";
import { readVarUint as g, createDecoder as A, readVarString as M } from "./ixo-matrix-crdt16.js";
import { getUnixTime as f } from "./ixo-matrix-crdt30.js";
import { floor as V } from "./ixo-matrix-crdt28.js";
import { Observable as x } from "./ixo-matrix-crdt31.js";
import { equalityDeep as U } from "./ixo-matrix-crdt32.js";
import "yjs";
const S = 3e4;
class C extends x {
  /**
   * @param {Y.Doc} doc
   */
  constructor(o) {
    super(), this.doc = o, this.clientID = o.clientID, this.states = /* @__PURE__ */ new Map(), this.meta = /* @__PURE__ */ new Map(), this._checkInterval = /** @type {any} */
    setInterval(() => {
      const s = f();
      this.getLocalState() !== null && S / 2 <= s - /** @type {{lastUpdated:number}} */
      this.meta.get(this.clientID).lastUpdated && this.setLocalState(this.getLocalState());
      const l = [];
      this.meta.forEach((i, t) => {
        t !== this.clientID && S <= s - i.lastUpdated && this.states.has(t) && l.push(t);
      }), l.length > 0 && O(this, l, "timeout");
    }, V(S / 10)), o.on("destroy", () => {
      this.destroy();
    }), this.setLocalState({});
  }
  destroy() {
    this.emit("destroy", [this]), this.setLocalState(null), super.destroy(), clearInterval(this._checkInterval);
  }
  /**
   * @return {Object<string,any>|null}
   */
  getLocalState() {
    return this.states.get(this.clientID) || null;
  }
  /**
   * @param {Object<string,any>|null} state
   */
  setLocalState(o) {
    const s = this.clientID, l = this.meta.get(s), i = l === void 0 ? 0 : l.clock + 1, t = this.states.get(s);
    o === null ? this.states.delete(s) : this.states.set(s, o), this.meta.set(s, {
      clock: i,
      lastUpdated: f()
    });
    const c = [], d = [], n = [], r = [];
    o === null ? r.push(s) : t == null ? o != null && c.push(s) : (d.push(s), U(t, o) || n.push(s)), (c.length > 0 || n.length > 0 || r.length > 0) && this.emit("change", [{ added: c, updated: n, removed: r }, "local"]), this.emit("update", [{ added: c, updated: d, removed: r }, "local"]);
  }
  /**
   * @param {string} field
   * @param {any} value
   */
  setLocalStateField(o, s) {
    const l = this.getLocalState();
    l !== null && this.setLocalState({
      ...l,
      [o]: s
    });
  }
  /**
   * @return {Map<number,Object<string,any>>}
   */
  getStates() {
    return this.states;
  }
}
const O = (e, o, s) => {
  const l = [];
  for (let i = 0; i < o.length; i++) {
    const t = o[i];
    if (e.states.has(t)) {
      if (e.states.delete(t), t === e.clientID) {
        const c = (
          /** @type {MetaClientState} */
          e.meta.get(t)
        );
        e.meta.set(t, {
          clock: c.clock + 1,
          lastUpdated: f()
        });
      }
      l.push(t);
    }
  }
  l.length > 0 && (e.emit("change", [{ added: [], updated: [], removed: l }, s]), e.emit("update", [{ added: [], updated: [], removed: l }, s]));
}, F = (e, o, s = e.states) => {
  const l = o.length, i = k();
  m(i, l);
  for (let t = 0; t < l; t++) {
    const c = o[t], d = s.get(c) || null, n = (
      /** @type {MetaClientState} */
      e.meta.get(c).clock
    );
    m(i, c), m(i, n), L(i, JSON.stringify(d));
  }
  return y(i);
}, j = (e, o, s) => {
  const l = A(o), i = f(), t = [], c = [], d = [], n = [], r = g(l);
  for (let I = 0; I < r; I++) {
    const a = g(l);
    let u = g(l);
    const h = JSON.parse(M(l)), p = e.meta.get(a), v = e.states.get(a), D = p === void 0 ? 0 : p.clock;
    (D < u || D === u && h === null && e.states.has(a)) && (h === null ? a === e.clientID && e.getLocalState() != null ? u++ : e.states.delete(a) : e.states.set(a, h), e.meta.set(a, {
      clock: u,
      lastUpdated: i
    }), p === void 0 && h !== null ? t.push(a) : p !== void 0 && h === null ? n.push(a) : h !== null && (U(h, v) || d.push(a), c.push(a)));
  }
  (t.length > 0 || d.length > 0 || n.length > 0) && e.emit("change", [{
    added: t,
    updated: d,
    removed: n
  }, s]), (t.length > 0 || c.length > 0 || n.length > 0) && e.emit("update", [{
    added: t,
    updated: c,
    removed: n
  }, s]);
};
export {
  C as Awareness,
  j as applyAwarenessUpdate,
  F as encodeAwarenessUpdate,
  S as outdatedTimeout,
  O as removeAwarenessStates
};
