import { getRandomValues as t } from "./ixo-matrix-crdt47.js";
const a = Math.random, n = () => t(new Uint32Array(1))[0], o = "10000000-1000-4000-8000" + -1e11, i = () => o.replace(
  /[018]/g,
  /** @param {number} c */
  (e) => (e ^ n() & 15 >> e / 4).toString(16)
);
export {
  a as rand,
  n as uint32,
  i as uuidv4
};
