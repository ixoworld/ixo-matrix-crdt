import { supportsColor as u } from "./ixo-matrix-crdt29.js";
import { create as f } from "./ixo-matrix-crdt30.js";
import { create as t } from "./ixo-matrix-crdt31.js";
import { mapToStyleString as p } from "./ixo-matrix-crdt32.js";
import { create as m } from "./ixo-matrix-crdt33.js";
import { createModuleLogger as a, computeNoColorLoggingArgs as h, UNCOLOR as L, ORANGE as d, PURPLE as b, RED as y, GREY as E, GREEN as N, BLUE as R, UNBOLD as S, BOLD as A } from "./ixo-matrix-crdt34.js";
const B = {
  [A]: t("font-weight", "bold"),
  [S]: t("font-weight", "normal"),
  [R]: t("color", "blue"),
  [N]: t("color", "green"),
  [E]: t("color", "grey"),
  [y]: t("color", "red"),
  [b]: t("color", "purple"),
  [d]: t("color", "orange"),
  // not well supported in chrome when debugging node with inspector - TODO: deprecate
  [L]: t("color", "black")
}, O = (o) => {
  o.length === 1 && o[0]?.constructor === Function && (o = /** @type {Array<string|Symbol|Object|number>} */
  /** @type {[function]} */
  o[0]());
  const n = [], s = [], i = m();
  let c = [], r = 0;
  for (; r < o.length; r++) {
    const e = o[r], l = B[e];
    if (l !== void 0)
      i.set(l.left, l.right);
    else {
      if (e === void 0)
        break;
      if (e.constructor === String || e.constructor === Number) {
        const g = p(i);
        r > 0 || g.length > 0 ? (n.push("%c" + e), s.push(g)) : n.push(e);
      } else
        break;
    }
  }
  for (r > 0 && (c = s, c.unshift(n.join(""))); r < o.length; r++) {
    const e = o[r];
    e instanceof Symbol || c.push(e);
  }
  return c;
}, w = u ? O : h, M = (...o) => {
  console.log(...w(o)), U.forEach((n) => n.print(o));
}, U = f(), j = (o) => a(M, o);
export {
  R as BLUE,
  A as BOLD,
  N as GREEN,
  E as GREY,
  d as ORANGE,
  b as PURPLE,
  y as RED,
  S as UNBOLD,
  L as UNCOLOR,
  j as createModuleLogger,
  M as print,
  U as vconsoles
};
