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
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
    timestamp: number;
}
export declare class SimpleAwareness {
    private doc;
    private states;
    private localState;
    private clientId;
    private listeners;
    private cleanupInterval;
    constructor(doc: any);
    private generateClientId;
    get clientID(): string;
    /**
     * Set local user's awareness state (cursor position, selection, user info)
     */
    setLocalState(state: Partial<AwarenessState> | null): void;
    /**
     * Update a single field in local state
     */
    setLocalStateField(field: keyof AwarenessState, value: any): void;
    /**
     * Get all awareness states (local + remote)
     */
    getStates(): Map<string, AwarenessState>;
    /**
     * Get local awareness state
     */
    getLocalState(): AwarenessState | null;
    /**
     * Apply remote awareness update
     */
    applyAwarenessUpdate(update: {
        clientId: string;
        state: AwarenessState | null;
    }): void;
    /**
     * Encode local awareness state for WebRTC transmission
     */
    encodeAwarenessUpdate(): Uint8Array;
    /**
     * Decode and apply awareness update from WebRTC
     */
    applyAwarenessUpdateFromBytes(bytes: Uint8Array): void;
    /**
     * Remove stale awareness states (older than 30 seconds)
     */
    private cleanupStaleStates;
    /**
     * Event listener
     */
    on(event: string, callback: Function): void;
    /**
     * Remove event listener
     */
    off(event: string, callback: Function): void;
    private emit;
    destroy(): void;
}
