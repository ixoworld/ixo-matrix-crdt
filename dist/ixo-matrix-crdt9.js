class n {
  constructor(t) {
    this.doc = t, this.clientId = this.generateClientId(), this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 3e4);
  }
  states = /* @__PURE__ */ new Map();
  localState = null;
  clientId;
  listeners = {};
  cleanupInterval;
  generateClientId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  get clientID() {
    return this.clientId;
  }
  /**
   * Set local user's awareness state (cursor position, selection, user info)
   */
  setLocalState(t) {
    t === null ? (this.localState = null, this.states.delete(this.clientId)) : (this.localState = {
      ...this.localState,
      ...t,
      timestamp: Date.now()
    }, this.states.set(this.clientId, this.localState)), this.emit("change", {
      added: [],
      updated: [this.clientId],
      removed: t === null ? [this.clientId] : []
    }), this.emit("update", {
      added: [],
      updated: [this.clientId],
      removed: t === null ? [this.clientId] : []
    });
  }
  /**
   * Update a single field in local state
   */
  setLocalStateField(t, e) {
    this.localState || (this.localState = { timestamp: Date.now() }), this.localState[t] = e, this.localState.timestamp = Date.now(), this.states.set(this.clientId, this.localState), this.emit("change", {
      added: [],
      updated: [this.clientId],
      removed: []
    }), this.emit("update", {
      added: [],
      updated: [this.clientId],
      removed: []
    });
  }
  /**
   * Get all awareness states (local + remote)
   */
  getStates() {
    return new Map(this.states);
  }
  /**
   * Get local awareness state
   */
  getLocalState() {
    return this.localState;
  }
  /**
   * Apply remote awareness update
   */
  applyAwarenessUpdate(t) {
    const { clientId: e, state: s } = t;
    if (e === this.clientId)
      return;
    const a = this.states.has(e);
    s === null ? (this.states.delete(e), a && this.emit("change", {
      added: [],
      updated: [],
      removed: [e]
    })) : (this.states.set(e, s), this.emit("change", {
      added: a ? [] : [e],
      updated: a ? [e] : [],
      removed: []
    }));
  }
  /**
   * Encode local awareness state for WebRTC transmission
   */
  encodeAwarenessUpdate() {
    if (!this.localState)
      return new Uint8Array(0);
    const t = {
      clientId: this.clientId,
      state: this.localState
    }, e = JSON.stringify(t);
    return new TextEncoder().encode(e);
  }
  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(t) {
    try {
      const e = new TextDecoder().decode(t), s = JSON.parse(e);
      this.applyAwarenessUpdate(s);
    } catch (e) {
      console.error("Failed to decode awareness update:", e);
    }
  }
  /**
   * Remove stale awareness states (older than 30 seconds)
   */
  cleanupStaleStates() {
    const t = Date.now(), e = 30 * 1e3, s = [];
    this.states.forEach((a, i) => {
      i !== this.clientId && t - a.timestamp > e && s.push(i);
    }), s.length > 0 && (s.forEach((a) => this.states.delete(a)), this.emit("change", {
      added: [],
      updated: [],
      removed: s
    }));
  }
  /**
   * Event listener
   */
  on(t, e) {
    this.listeners[t] || (this.listeners[t] = []), this.listeners[t].push(e);
  }
  /**
   * Remove event listener
   */
  off(t, e) {
    if (this.listeners[t]) {
      const s = this.listeners[t].indexOf(e);
      s > -1 && this.listeners[t].splice(s, 1);
    }
  }
  emit(t, e) {
    this.listeners[t] && this.listeners[t].forEach((s) => s(e));
  }
  destroy() {
    this.cleanupInterval && clearInterval(this.cleanupInterval), this.states.clear(), this.listeners = {}, this.localState = null;
  }
}
export {
  n as SimpleAwareness
};
