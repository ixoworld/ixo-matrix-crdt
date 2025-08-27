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
export declare class BlockNoteAwareness {
    private doc;
    private states;
    private localState;
    private clientId;
    private listeners;
    private cleanupInterval;
    private debug;
    constructor(doc: any);
    private generateClientId;
    get clientID(): string;
    /**
     * Set local user's awareness state
     */
    setLocalState(state: Partial<BlockNoteAwarenessState> | null): void;
    /**
     * Update a single field in local state
     */
    setLocalStateField(field: keyof BlockNoteAwarenessState, value: any): void;
    /**
     * Get all awareness states (local + remote)
     */
    getStates(): Map<string, BlockNoteAwarenessState>;
    /**
     * Get local awareness state
     */
    getLocalState(): BlockNoteAwarenessState | null;
    /**
     * Apply remote awareness update
     */
    applyAwarenessUpdate(update: {
        clientId: string;
        state: BlockNoteAwarenessState | null;
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
