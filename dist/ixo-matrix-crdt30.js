import { create as n } from "./ixo-matrix-crdt34.js";
import { fromCamelCase as p } from "./ixo-matrix-crdt26.js";
import { undefinedToNull as a } from "./ixo-matrix-crdt43.js";
import { varStorage as u } from "./ixo-matrix-crdt44.js";
import { isOneOf as d } from "./ixo-matrix-crdt38.js";
const r = typeof process < "u" && process.release && /node|io\.js/.test(process.release.name) && Object.prototype.toString.call(typeof process < "u" ? process : 0) === "[object process]", T = typeof window < "u" && typeof document < "u" && !r;
let s;
const m = () => {
  if (s === void 0)
    if (r) {
      s = n();
      const e = process.argv;
      let o = null;
      for (let t = 0; t < e.length; t++) {
        const l = e[t];
        l[0] === "-" ? (o !== null && s.set(o, ""), o = l) : o !== null && (s.set(o, l), o = null);
      }
      o !== null && s.set(o, "");
    } else typeof location == "object" ? (s = n(), (location.search || "?").slice(1).split("&").forEach((e) => {
      if (e.length !== 0) {
        const [o, t] = e.split("=");
        s.set(`--${p(o, "-")}`, t), s.set(`-${p(o, "-")}`, t);
      }
    })) : s = n();
  return s;
}, c = (e) => m().has(e), i = (e) => r ? a(process.env[e.toUpperCase().replaceAll("-", "_")]) : a(u.getItem(e)), f = (e) => c("--" + e) || i(e) !== null;
f("production");
const g = r && d(process.env.FORCE_COLOR, ["true", "1", "2"]), b = g || !c("--no-colors") && // @todo deprecate --no-colors
!f("no-color") && (!r || process.stdout.isTTY) && (!r || c("--color") || i("COLORTERM") !== null || (i("TERM") || "").includes("color"));
export {
  i as getVariable,
  f as hasConf,
  c as hasParam,
  T as isBrowser,
  r as isNode,
  b as supportsColor
};
