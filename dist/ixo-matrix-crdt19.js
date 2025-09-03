import { writeVarUint as s, writeVarUint8Array as n } from "./ixo-matrix-crdt17.js";
import { readVarUint as w, readVarUint8Array as p } from "./ixo-matrix-crdt16.js";
import * as o from "yjs";
const S = 0, y = 1, i = 2, V = (t, e) => {
  s(t, S);
  const r = o.encodeStateVector(e);
  n(t, r);
}, U = (t, e, r) => {
  s(t, y), n(t, o.encodeStateAsUpdate(e, r));
}, g = (t, e, r) => U(e, r, p(t)), m = (t, e, r) => {
  try {
    o.applyUpdate(e, p(t), r);
  } catch (a) {
    console.error("Caught error while handling a Yjs update", a);
  }
}, Y = (t, e) => {
  s(t, i), n(t, e);
}, h = m, f = (t, e, r, a) => {
  const c = w(t);
  switch (c) {
    case S:
      g(t, e, r);
      break;
    case y:
      m(t, r, a);
      break;
    case i:
      h(t, r, a);
      break;
    default:
      throw new Error("Unknown message type");
  }
  return c;
};
export {
  S as messageYjsSyncStep1,
  y as messageYjsSyncStep2,
  i as messageYjsUpdate,
  f as readSyncMessage,
  g as readSyncStep1,
  m as readSyncStep2,
  h as readUpdate,
  V as writeSyncStep1,
  U as writeSyncStep2,
  Y as writeUpdate
};
