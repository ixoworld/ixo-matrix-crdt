class l {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  /**
   * @param {string} key
   * @param {any} newValue
   */
  setItem(t, r) {
    this.map.set(t, r);
  }
  /**
   * @param {string} key
   */
  getItem(t) {
    return this.map.get(t);
  }
}
let o = new l(), a = !0;
try {
  typeof localStorage < "u" && localStorage && (o = localStorage, a = !1);
} catch {
}
const s = o, n = (e) => a || addEventListener(
  "storage",
  /** @type {any} */
  e
), c = (e) => a || removeEventListener(
  "storage",
  /** @type {any} */
  e
);
export {
  c as offChange,
  n as onChange,
  s as varStorage
};
