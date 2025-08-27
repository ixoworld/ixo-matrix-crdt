/**
 * BlockNote-compatible awareness for matrix-crdt
 * Tracks real-time user presence: cursors, selections, user info
 */
export interface BlockNoteAwarenessState {
  user?: {
    name: string;
    color: string;
    clientId: string;
  };
  cursor?: {
    blockId: string;
    position: number;
    selectionStart?: number;
    selectionEnd?: number;
    isTyping?: boolean;
    lastActivity: number;
  };
  isTyping?: boolean;
  timestamp: number;
}

export class BlockNoteAwareness {
  private states = new Map<string, BlockNoteAwarenessState>();
  private localState: BlockNoteAwarenessState | null = null;
  private clientId: string;
  private listeners: { [event: string]: Function[] } = {};
  private cleanupInterval: any;
  private debug = true; // Enable debug logging

  constructor(private doc: any) {
    this.clientId = this.generateClientId();

    // Clean up stale awareness states every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 30000);

    if (this.debug) {
      console.log('[BlockNoteAwareness] Initialized with clientId:', this.clientId);
    }
  }

  private generateClientId(): string {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  get clientID(): string {
    return this.clientId;
  }

  /**
   * Set local user's awareness state
   */
  setLocalState(state: Partial<BlockNoteAwarenessState> | null) {
    if (this.debug) {
      console.log('[BlockNoteAwareness] setLocalState called:', state);
    }

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
    const changeData = {
      added: [],
      updated: [this.clientId],
      removed: state === null ? [this.clientId] : []
    };

    this.emit('change', changeData);
    this.emit('update', changeData);
  }

  /**
   * Update a single field in local state
   */
  setLocalStateField(field: keyof BlockNoteAwarenessState, value: any) {
    if (this.debug) {
      console.log('[BlockNoteAwareness] setLocalStateField:', field, value);
    }

    if (!this.localState) {
      this.localState = { timestamp: Date.now() };
    }

    (this.localState as any)[field] = value;
    this.localState.timestamp = Date.now();
    this.states.set(this.clientId, this.localState);

    const changeData = {
      added: [],
      updated: [this.clientId],
      removed: []
    };

    this.emit('change', changeData);
    this.emit('update', changeData);
  }

  /**
   * Get all awareness states (local + remote)
   */
  getStates(): Map<string, BlockNoteAwarenessState> {
    return new Map(this.states);
  }

  /**
   * Get local awareness state
   */
  getLocalState(): BlockNoteAwarenessState | null {
    return this.localState;
  }

  /**
   * Apply remote awareness update
   */
  applyAwarenessUpdate(update: { clientId: string; state: BlockNoteAwarenessState | null }) {
    const { clientId, state } = update;

    if (this.debug) {
      console.log('[BlockNoteAwareness] applyAwarenessUpdate:', update);
    }

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

    if (this.debug) {
      console.log('[BlockNoteAwareness] Encoding update:', update);
    }

    return new TextEncoder().encode(jsonStr);
  }

  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(bytes: Uint8Array) {
    try {
      const jsonStr = new TextDecoder().decode(bytes);
      const update = JSON.parse(jsonStr);

      if (this.debug) {
        console.log('[BlockNoteAwareness] Received update bytes:', update);
      }

      this.applyAwarenessUpdate(update);
    } catch (e) {
      console.error('[BlockNoteAwareness] Failed to decode awareness update:', e);
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
      if (this.debug) {
        console.log('[BlockNoteAwareness] Cleaning up stale states:', toRemove);
      }
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

    if (this.debug) {
      console.log('[BlockNoteAwareness] Listener added for event:', event);
    }
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
    if (this.debug) {
      console.log('[BlockNoteAwareness] Emitting event:', event, data);
    }

    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error('[BlockNoteAwareness] Error in event listener:', e);
        }
      });
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.states.clear();
    this.listeners = {};
    this.localState = null;

    if (this.debug) {
      console.log('[BlockNoteAwareness] Destroyed');
    }
  }
}
