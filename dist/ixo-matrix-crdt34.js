import { create as e } from "./ixo-matrix-crdt46.js";
import { getUnixTime as m } from "./ixo-matrix-crdt36.js";
import { getVariable as h } from "./ixo-matrix-crdt29.js";
import { nop as L } from "./ixo-matrix-crdt38.js";
import { stringify as b } from "./ixo-matrix-crdt45.js";
const D = e(), w = e(), E = e(), G = e(), R = e(), j = e(), y = e(), O = e(), U = e(), k = (o) => {
  o.length === 1 && o[0]?.constructor === Function && (o = /** @type {Array<string|Symbol|Object|number>} */
  /** @type {[function]} */
  o[0]());
  const r = [], i = [];
  let t = 0;
  for (; t < o.length; t++) {
    const n = o[t];
    if (n === void 0)
      break;
    if (n.constructor === String || n.constructor === Number)
      r.push(n);
    else if (n.constructor === Object)
      break;
  }
  for (t > 0 && i.push(r.join("")); t < o.length; t++) {
    const n = o[t];
    n instanceof Symbol || i.push(n);
  }
  return i;
}, u = [R, y, O, E];
let l = 0, g = m();
const F = (o, r) => {
  const i = u[l], t = h("log"), n = t !== null && (t === "*" || t === "true" || new RegExp(t, "gi").test(r));
  return l = (l + 1) % u.length, r += ": ", n ? (...s) => {
    s.length === 1 && s[0]?.constructor === Function && (s = s[0]());
    const f = m(), p = f - g;
    g = f, o(
      i,
      r,
      U,
      ...s.map((c) => {
        switch (c != null && c.constructor === Uint8Array && (c = Array.from(c)), typeof c) {
          case "string":
          case "symbol":
            return c;
          default:
            return b(c);
        }
      }),
      i,
      " +" + p + "ms"
    );
  } : L;
};
export {
  E as BLUE,
  D as BOLD,
  R as GREEN,
  G as GREY,
  O as ORANGE,
  y as PURPLE,
  j as RED,
  w as UNBOLD,
  U as UNCOLOR,
  k as computeNoColorLoggingArgs,
  F as createModuleLogger
};
