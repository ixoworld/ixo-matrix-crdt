/**
 * Built-in awareness for matrix-crdt
 * Tracks real-time user presence: cursors, selections, user info
 */
export interface AwarenessState {
  user?: {
    name: string;
    color: string;
    clientId: string;
  };
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  timestamp: number;
}

export class SimpleAwareness {
  private states = new Map<string, AwarenessState>();
  private localState: AwarenessState | null = null;
  private clientId: string;
  private listeners: { [event: string]: Function[] } = {};
  private cleanupInterval: any;

  constructor(private doc: any) {
    this.clientId = this.generateClientId();
    
    // Clean up stale awareness states every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 30000);
  }

  private generateClientId(): string {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  get clientID(): string {
    return this.clientId;
  }

  /**
   * Set local user's awareness state (cursor position, selection, user info)
   */
  setLocalState(state: Partial<AwarenessState> | null) {
    if (state === null) {
      this.localState = null;
      this.states.delete(this.clientId);
    } else {
      this.localState = {
        ...this.localState,
        ...state,
        timestamp: Date.now()
      };
      this.states.set(this.clientId, this.localState);
    }

    // Emit change event
    this.emit('change', {
      added: [],
      updated: [this.clientId],
      removed: state === null ? [this.clientId] : []
    });

    // Also emit update event (for WebRTC broadcasting)
    this.emit('update', {
      added: [],
      updated: [this.clientId], 
      removed: state === null ? [this.clientId] : []
    });
  }

  /**
   * Update a single field in local state
   */
  setLocalStateField(field: keyof AwarenessState, value: any) {
    if (!this.localState) {
      this.localState = { timestamp: Date.now() };
    }
    
    (this.localState as any)[field] = value;
    this.localState.timestamp = Date.now();
    this.states.set(this.clientId, this.localState);

    this.emit('change', {
      added: [],
      updated: [this.clientId],
      removed: []
    });

    this.emit('update', {
      added: [],
      updated: [this.clientId],
      removed: []
    });
  }

  /**
   * Get all awareness states (local + remote)
   */
  getStates(): Map<string, AwarenessState> {
    return new Map(this.states);
  }

  /**
   * Get local awareness state
   */
  getLocalState(): AwarenessState | null {
    return this.localState;
  }

  /**
   * Apply remote awareness update
   */
  applyAwarenessUpdate(update: { clientId: string; state: AwarenessState | null }) {
    const { clientId, state } = update;
    
    if (clientId === this.clientId) {
      return; // Don't apply our own updates
    }

    const hadState = this.states.has(clientId);
    
    if (state === null) {
      // Remove remote user
      this.states.delete(clientId);
      if (hadState) {
        this.emit('change', {
          added: [],
          updated: [],
          removed: [clientId]
        });
      }
    } else {
      // Add or update remote user
      this.states.set(clientId, state);
      this.emit('change', {
        added: hadState ? [] : [clientId],
        updated: hadState ? [clientId] : [],
        removed: []
      });
    }
  }

  /**
   * Encode local awareness state for WebRTC transmission
   */
  encodeAwarenessUpdate(): Uint8Array {
    if (!this.localState) {
      return new Uint8Array(0);
    }

    const update = {
      clientId: this.clientId,
      state: this.localState
    };

    const jsonStr = JSON.stringify(update);
    return new TextEncoder().encode(jsonStr);
  }

  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(bytes: Uint8Array) {
    try {
      const jsonStr = new TextDecoder().decode(bytes);
      const update = JSON.parse(jsonStr);
      this.applyAwarenessUpdate(update);
    } catch (e) {
      console.error('Failed to decode awareness update:', e);
    }
  }

  /**
   * Remove stale awareness states (older than 30 seconds)
   */
  private cleanupStaleStates() {
    const now = Date.now();
    const staleThreshold = 30 * 1000; // 30 seconds
    const toRemove: string[] = [];

    this.states.forEach((state, clientId) => {
      if (clientId !== this.clientId && (now - state.timestamp) > staleThreshold) {
        toRemove.push(clientId);
      }
    });

    if (toRemove.length > 0) {
      toRemove.forEach(clientId => this.states.delete(clientId));
      this.emit('change', {
        added: [],
        updated: [],
        removed: toRemove
      });
    }
  }

  /**
   * Event listener
   */
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.states.clear();
    this.listeners = {};
    this.localState = null;
  }
}