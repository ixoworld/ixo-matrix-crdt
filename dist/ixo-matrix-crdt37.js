import { create as t, setIfUndefined as i } from "./ixo-matrix-crdt34.js";
import { create as f } from "./ixo-matrix-crdt31.js";
import { from as c } from "./ixo-matrix-crdt29.js";
class v {
  constructor() {
    this._observers = t();
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  on(e, r) {
    i(this._observers, e, f).add(r);
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  once(e, r) {
    const s = (...o) => {
      this.off(e, s), r(...o);
    };
    this.on(e, s);
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  off(e, r) {
    const s = this._observers.get(e);
    s !== void 0 && (s.delete(r), s.size === 0 && this._observers.delete(e));
  }
  /**
   * Emit a named event. All registered event listeners that listen to the
   * specified name will receive the event.
   *
   * @todo This should catch exceptions
   *
   * @param {N} name The event name.
   * @param {Array<any>} args The arguments that are applied to the event listener.
   */
  emit(e, r) {
    return c((this._observers.get(e) || t()).values()).forEach((s) => s(...r));
  }
  destroy() {
    this._observers = t();
  }
}
export {
  v as Observable
};
