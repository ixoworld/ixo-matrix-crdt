import { BIT8 as s, BITS7 as u, BIT7 as S, BITS6 as b } from "./ixo-matrix-crdt23.js";
import { MAX_SAFE_INTEGER as c } from "./ixo-matrix-crdt24.js";
import { utf8TextDecoder as g } from "./ixo-matrix-crdt25.js";
import { create as m } from "./ixo-matrix-crdt26.js";
const w = m("Unexpected end of array"), y = m("Integer out of Range");
class A {
  /**
   * @param {Uint8Array} uint8Array Binary data to decode
   */
  constructor(r) {
    this.arr = r, this.pos = 0;
  }
}
const _ = (t) => new A(t), U = (t, r) => {
  const n = new Uint8Array(t.arr.buffer, t.pos + t.arr.byteOffset, r);
  return t.pos += r, n;
}, h = (t) => U(t, a(t)), i = (t) => t.arr[t.pos++], a = (t) => {
  let r = 0, n = 1;
  const o = t.arr.length;
  for (; t.pos < o; ) {
    const e = t.arr[t.pos++];
    if (r = r + (e & u) * n, n *= 128, e < s)
      return r;
    if (r > c)
      throw y;
  }
  throw w;
}, V = (t) => {
  let r = t.arr[t.pos++], n = r & b, o = 64;
  const e = (r & S) > 0 ? -1 : 1;
  if ((r & s) === 0)
    return e * n;
  const I = t.arr.length;
  for (; t.pos < I; ) {
    if (r = t.arr[t.pos++], n = n + (r & u) * o, o *= 128, r < s)
      return e * n;
    if (n > c)
      throw y;
  }
  throw w;
}, T = (t) => {
  let r = a(t);
  if (r === 0)
    return "";
  {
    let n = String.fromCodePoint(i(t));
    if (--r < 100)
      for (; r--; )
        n += String.fromCodePoint(i(t));
    else
      for (; r > 0; ) {
        const o = r < 1e4 ? r : 1e4, e = t.arr.subarray(t.pos, t.pos + o);
        t.pos += o, n += String.fromCodePoint.apply(
          null,
          /** @type {any} */
          e
        ), r -= o;
      }
    return decodeURIComponent(escape(n));
  }
}, B = (t) => (
  /** @type any */
  g.decode(h(t))
), f = g ? B : T, l = (t, r) => {
  const n = new DataView(t.arr.buffer, t.arr.byteOffset + t.pos, r);
  return t.pos += r, n;
}, F = (t) => l(t, 4).getFloat32(0, !1), x = (t) => l(t, 8).getFloat64(0, !1), D = (t) => (
  /** @type {any} */
  l(t, 8).getBigInt64(0, !1)
), O = [
  (t) => {
  },
  // CASE 127: undefined
  (t) => null,
  // CASE 126: null
  V,
  // CASE 125: integer
  F,
  // CASE 124: float32
  x,
  // CASE 123: float64
  D,
  // CASE 122: bigint
  (t) => !1,
  // CASE 121: boolean (false)
  (t) => !0,
  // CASE 120: boolean (true)
  f,
  // CASE 119: string
  (t) => {
    const r = a(t), n = {};
    for (let o = 0; o < r; o++) {
      const e = f(t);
      n[e] = p(t);
    }
    return n;
  },
  (t) => {
    const r = a(t), n = [];
    for (let o = 0; o < r; o++)
      n.push(p(t));
    return n;
  },
  h
  // CASE 116: Uint8Array
], p = (t) => O[127 - i(t)](t);
export {
  A as Decoder,
  B as _readVarStringNative,
  T as _readVarStringPolyfill,
  _ as createDecoder,
  p as readAny,
  D as readBigInt64,
  F as readFloat32,
  x as readFloat64,
  l as readFromDataView,
  i as readUint8,
  U as readUint8Array,
  V as readVarInt,
  f as readVarString,
  a as readVarUint,
  h as readVarUint8Array
};
