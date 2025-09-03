class n {
  // Enable debug logging
  constructor(e) {
    this.doc = e, this.clientId = this.generateClientId(), this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 3e4), this.debug && console.log("[BlockNoteAwareness] Initialized with clientId:", this.clientId);
  }
  states = /* @__PURE__ */ new Map();
  localState = null;
  clientId;
  listeners = {};
  cleanupInterval;
  debug = !0;
  generateClientId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  get clientID() {
    return this.clientId;
  }
  /**
   * Set local user's awareness state
   */
  setLocalState(e) {
    this.debug && console.log("[BlockNoteAwareness] setLocalState called:", e), e === null ? (this.localState = null, this.states.delete(this.clientId)) : (this.localState = {
      ...this.localState,
      ...e,
      timestamp: Date.now()
    }, this.states.set(this.clientId, this.localState));
    const t = {
      added: [],
      updated: [this.clientId],
      removed: e === null ? [this.clientId] : []
    };
    this.emit("change", t), this.emit("update", t);
  }
  /**
   * Update a single field in local state
   */
  setLocalStateField(e, t) {
    this.debug && console.log("[BlockNoteAwareness] setLocalStateField:", e, t), this.localState || (this.localState = { timestamp: Date.now() }), this.localState[e] = t, this.localState.timestamp = Date.now(), this.states.set(this.clientId, this.localState);
    const s = {
      added: [],
      updated: [this.clientId],
      removed: []
    };
    this.emit("change", s), this.emit("update", s);
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
  applyAwarenessUpdate(e) {
    const { clientId: t, state: s } = e;
    if (this.debug && console.log("[BlockNoteAwareness] applyAwarenessUpdate:", e), t === this.clientId)
      return;
    const a = this.states.has(t);
    s === null ? (this.states.delete(t), a && this.emit("change", {
      added: [],
      updated: [],
      removed: [t]
    })) : (this.states.set(t, s), this.emit("change", {
      added: a ? [] : [t],
      updated: a ? [t] : [],
      removed: []
    }));
  }
  /**
   * Encode local awareness state for WebRTC transmission
   */
  encodeAwarenessUpdate() {
    if (!this.localState)
      return new Uint8Array(0);
    const e = {
      clientId: this.clientId,
      state: this.localState
    }, t = JSON.stringify(e);
    return this.debug && console.log("[BlockNoteAwareness] Encoding update:", e), new TextEncoder().encode(t);
  }
  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(e) {
    try {
      const t = new TextDecoder().decode(e), s = JSON.parse(t);
      this.debug && console.log("[BlockNoteAwareness] Received update bytes:", s), this.applyAwarenessUpdate(s);
    } catch (t) {
      console.error("[BlockNoteAwareness] Failed to decode awareness update:", t);
    }
  }
  /**
   * Remove stale awareness states (older than 30 seconds)
   */
  cleanupStaleStates() {
    const e = Date.now(), t = 30 * 1e3, s = [];
    this.states.forEach((a, i) => {
      i !== this.clientId && e - a.timestamp > t && s.push(i);
    }), s.length > 0 && (this.debug && console.log("[BlockNoteAwareness] Cleaning up stale states:", s), s.forEach((a) => this.states.delete(a)), this.emit("change", {
      added: [],
      updated: [],
      removed: s
    }));
  }
  /**
   * Event listener
   */
  on(e, t) {
    this.listeners[e] || (this.listeners[e] = []), this.listeners[e].push(t), this.debug && console.log("[BlockNoteAwareness] Listener added for event:", e);
  }
  /**
   * Remove event listener
   */
  off(e, t) {
    if (this.listeners[e]) {
      const s = this.listeners[e].indexOf(t);
      s > -1 && this.listeners[e].splice(s, 1);
    }
  }
  emit(e, t) {
    this.debug && console.log("[BlockNoteAwareness] Emitting event:", e, t), this.listeners[e] && this.listeners[e].forEach((s) => {
      try {
        s(t);
      } catch (a) {
        console.error("[BlockNoteAwareness] Error in event listener:", a);
      }
    });
  }
  destroy() {
    this.cleanupInterval && clearInterval(this.cleanupInterval), this.states.clear(), this.listeners = {}, this.localState = null, this.debug && console.log("[BlockNoteAwareness] Destroyed");
  }
}
export {
  n as BlockNoteAwareness
};
