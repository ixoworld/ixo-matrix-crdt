import { floor as e, abs as I, min as B, max as U, isNegativeZero as S } from "./ixo-matrix-crdt28.js";
import { isInteger as V } from "./ixo-matrix-crdt25.js";
import { BITS7 as o, BITS31 as k, BITS6 as h, BIT8 as w, BIT7 as F } from "./ixo-matrix-crdt24.js";
import { utf8TextEncoder as c, encodeUtf8 as L } from "./ixo-matrix-crdt26.js";
import { isArray as T } from "./ixo-matrix-crdt29.js";
class v {
  constructor() {
    this.cpos = 0, this.cbuf = new Uint8Array(100), this.bufs = [];
  }
}
const K = () => new v(), x = (t) => {
  let s = t.cpos;
  for (let i = 0; i < t.bufs.length; i++)
    s += t.bufs[i].length;
  return s;
}, M = (t) => {
  const s = new Uint8Array(x(t));
  let i = 0;
  for (let l = 0; l < t.bufs.length; l++) {
    const n = t.bufs[l];
    s.set(n, i), i += n.length;
  }
  return s.set(new Uint8Array(t.cbuf.buffer, 0, t.cpos), i), s;
}, _ = (t, s) => {
  const i = t.cbuf.length;
  i - t.cpos < s && (t.bufs.push(new Uint8Array(t.cbuf.buffer, 0, t.cpos)), t.cbuf = new Uint8Array(U(i, s) * 2), t.cpos = 0);
}, f = (t, s) => {
  const i = t.cbuf.length;
  t.cpos === i && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(i * 2), t.cpos = 0), t.cbuf[t.cpos++] = s;
}, Q = f, r = (t, s) => {
  for (; s > o; )
    f(t, w | o & s), s = e(s / 128);
  f(t, o & s);
}, C = (t, s) => {
  const i = S(s);
  for (i && (s = -s), f(t, (s > h ? w : 0) | (i ? F : 0) | h & s), s = e(s / 64); s > 0; )
    f(t, (s > o ? w : 0) | o & s), s = e(s / 128);
}, g = new Uint8Array(3e4), D = g.length / 3, E = (t, s) => {
  if (s.length < D) {
    const i = c.encodeInto(s, g).written || 0;
    r(t, i);
    for (let l = 0; l < i; l++)
      f(t, g[l]);
  } else
    A(t, L(s));
}, N = (t, s) => {
  const i = unescape(encodeURIComponent(s)), l = i.length;
  r(t, l);
  for (let n = 0; n < l; n++)
    f(
      t,
      /** @type {number} */
      i.codePointAt(n)
    );
}, u = c && /** @type {any} */
c.encodeInto ? E : N, P = (t, s) => {
  const i = t.cbuf.length, l = t.cpos, n = B(i - l, s.length), b = s.length - n;
  t.cbuf.set(s.subarray(0, n), l), t.cpos += n, b > 0 && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(U(i * 2, b)), t.cbuf.set(s.subarray(n)), t.cpos = b);
}, A = (t, s) => {
  r(t, s.byteLength), P(t, s);
}, p = (t, s) => {
  _(t, s);
  const i = new DataView(t.cbuf.buffer, t.cpos, s);
  return t.cpos += s, i;
}, j = (t, s) => p(t, 4).setFloat32(0, s, !1), O = (t, s) => p(t, 8).setFloat64(0, s, !1), z = (t, s) => (
  /** @type {any} */
  p(t, 8).setBigInt64(0, s, !1)
), a = new DataView(new ArrayBuffer(4)), R = (t) => (a.setFloat32(0, t), a.getFloat32(0) === t), y = (t, s) => {
  switch (typeof s) {
    case "string":
      f(t, 119), u(t, s);
      break;
    case "number":
      V(s) && I(s) <= k ? (f(t, 125), C(t, s)) : R(s) ? (f(t, 124), j(t, s)) : (f(t, 123), O(t, s));
      break;
    case "bigint":
      f(t, 122), z(t, s);
      break;
    case "object":
      if (s === null)
        f(t, 126);
      else if (T(s)) {
        f(t, 117), r(t, s.length);
        for (let i = 0; i < s.length; i++)
          y(t, s[i]);
      } else if (s instanceof Uint8Array)
        f(t, 116), A(t, s);
      else {
        f(t, 118);
        const i = Object.keys(s);
        r(t, i.length);
        for (let l = 0; l < i.length; l++) {
          const n = i[l];
          u(t, n), y(t, s[n]);
        }
      }
      break;
    case "boolean":
      f(t, s ? 120 : 121);
      break;
    default:
      f(t, 127);
  }
};
export {
  v as Encoder,
  E as _writeVarStringNative,
  N as _writeVarStringPolyfill,
  K as createEncoder,
  x as length,
  M as toUint8Array,
  _ as verifyLen,
  f as write,
  y as writeAny,
  z as writeBigInt64,
  j as writeFloat32,
  O as writeFloat64,
  p as writeOnDataView,
  Q as writeUint8,
  P as writeUint8Array,
  C as writeVarInt,
  u as writeVarString,
  r as writeVarUint,
  A as writeVarUint8Array
};
