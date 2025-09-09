import { fromCharCode as f } from "./ixo-matrix-crdt26.js";
import { isBrowser as n } from "./ixo-matrix-crdt30.js";
const s = (r) => new Uint8Array(r), a = (r, e, t) => new Uint8Array(r, e, t), u = (r) => new Uint8Array(r), c = (r) => {
  let e = "";
  for (let t = 0; t < r.byteLength; t++)
    e += f(r[t]);
  return btoa(e);
}, i = (r) => Buffer.from(r.buffer, r.byteOffset, r.byteLength).toString("base64"), m = (r) => {
  const e = atob(r), t = s(e.length);
  for (let o = 0; o < e.length; o++)
    t[o] = e.charCodeAt(o);
  return t;
}, B = (r) => {
  const e = Buffer.from(r, "base64");
  return a(e.buffer, e.byteOffset, e.byteLength);
}, A = n ? c : i, h = n ? m : B;
export {
  u as createUint8ArrayFromArrayBuffer,
  s as createUint8ArrayFromLen,
  a as createUint8ArrayViewFromArrayBuffer,
  h as fromBase64,
  A as toBase64
};
