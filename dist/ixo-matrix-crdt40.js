import { writeVarString as m, createEncoder as u, writeVarUint8Array as i, toUint8Array as A, writeAny as B } from "./ixo-matrix-crdt17.js";
import { readVarString as h, createDecoder as p, readVarUint8Array as y, readAny as U } from "./ixo-matrix-crdt16.js";
import { reject as d } from "./ixo-matrix-crdt50.js";
import { create as b } from "./ixo-matrix-crdt27.js";
import { encodeUtf8 as s } from "./ixo-matrix-crdt26.js";
const D = (e, n) => {
  const r = s(e).buffer, o = s(n).buffer, f = r instanceof ArrayBuffer ? r : new ArrayBuffer(r.byteLength), t = o instanceof ArrayBuffer ? o : new ArrayBuffer(o.byteLength);
  return r !== f && new Uint8Array(f).set(new Uint8Array(r)), o !== t && new Uint8Array(t).set(new Uint8Array(o)), crypto.subtle.importKey("raw", f, "PBKDF2", !1, ["deriveKey"]).then(
    (a) => crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: t,
        iterations: 1e5,
        hash: "SHA-256"
      },
      a,
      {
        name: "AES-GCM",
        length: 256
      },
      !0,
      ["encrypt", "decrypt"]
    )
  );
}, l = async (e, n) => {
  if (!n)
    return e;
  const r = crypto.getRandomValues(new Uint8Array(12)), o = e.buffer instanceof ArrayBuffer ? e : new Uint8Array(new ArrayBuffer(e.byteLength));
  return o !== e && o.set(e), crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: r
    },
    n,
    o
  ).then((f) => {
    const t = u();
    return m(t, "AES-GCM"), i(t, r), i(t, new Uint8Array(f)), A(t);
  });
}, G = (e, n) => {
  const r = u();
  return B(r, e), l(A(r), n);
}, g = async (e, n) => {
  if (!n)
    return e;
  const r = p(e);
  h(r) !== "AES-GCM" && d(b("Unknown encryption algorithm"));
  const f = y(r), t = y(r), a = f.buffer instanceof ArrayBuffer ? f : new Uint8Array(new ArrayBuffer(f.byteLength)), c = t.buffer instanceof ArrayBuffer ? t : new Uint8Array(new ArrayBuffer(t.byteLength));
  return a !== f && a.set(f), c !== t && c.set(t), crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: a
    },
    n,
    c
  ).then((w) => new Uint8Array(w));
}, L = (e, n) => g(e, n).then(
  (r) => U(p(new Uint8Array(r)))
);
export {
  g as decrypt,
  L as decryptJson,
  D as deriveKey,
  l as encrypt,
  G as encryptJson
};
