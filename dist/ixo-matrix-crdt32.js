import { length as f, hasProperty as i } from "./ixo-matrix-crdt43.js";
import { EqualityTraitSymbol as s } from "./ixo-matrix-crdt44.js";
const o = () => {
}, n = (e, r) => {
  if (e === r)
    return !0;
  if (e == null || r == null || e.constructor !== r.constructor)
    return !1;
  if (e[s] != null)
    return e[s](r);
  switch (e.constructor) {
    case ArrayBuffer:
      e = new Uint8Array(e), r = new Uint8Array(r);
    // eslint-disable-next-line no-fallthrough
    case Uint8Array: {
      if (e.byteLength !== r.byteLength)
        return !1;
      for (let t = 0; t < e.length; t++)
        if (e[t] !== r[t])
          return !1;
      break;
    }
    case Set: {
      if (e.size !== r.size)
        return !1;
      for (const t of e)
        if (!r.has(t))
          return !1;
      break;
    }
    case Map: {
      if (e.size !== r.size)
        return !1;
      for (const t of e.keys())
        if (!r.has(t) || !n(e.get(t), r.get(t)))
          return !1;
      break;
    }
    case Object:
      if (f(e) !== f(r))
        return !1;
      for (const t in e)
        if (!i(e, t) || !n(e[t], r[t]))
          return !1;
      break;
    case Array:
      if (e.length !== r.length)
        return !1;
      for (let t = 0; t < e.length; t++)
        if (!n(e[t], r[t]))
          return !1;
      break;
    default:
      return !1;
  }
  return !0;
}, c = (e, r) => r.includes(e);
export {
  n as equalityDeep,
  c as isOneOf,
  o as nop
};
