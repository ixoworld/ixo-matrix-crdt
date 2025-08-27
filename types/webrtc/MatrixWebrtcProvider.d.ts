import * as Y from "yjs";
import { MatrixClient } from "matrix-js-sdk";
/**
 * Options that can be passed to MatrixWebrtcProvider (mostly ICE config).
 */
export interface MatrixWebrtcProviderOptions {
    password?: string;
    maxConns?: number;
    peerOpts?: RTCConfiguration;
}
/**
 * Thin wrapper that wires a Yjs Doc to a Matrix room and mirrors updates via
 * a peer‑to‑peer WebRTC mesh.  SignedWebrtcProvider extends this class, so the
 * public surface MUST remain 100 % backward‑compatible.
 */
export declare class MatrixWebrtcProvider {
    /** active WebRTC room (null until constructor completes) */
    room: MatrixWebrtcRoom | null;
    protected doc: Y.Doc;
    private roomId;
    private matrixClient;
    private opts;
    onCustomMessage: (_buf: Uint8Array, _reply: (m: Uint8Array) => void) => void;
    onPeerConnected: (_reply: (m: Uint8Array) => void) => void;
    constructor(doc: Y.Doc, matrixClient: MatrixClient, roomId: string, opts?: MatrixWebrtcProviderOptions);
    destroy(): void;
}
declare class MatrixWebrtcRoom {
    private provider;
    private matrixClient;
    readonly roomId: string;
    private opts;
    private webrtcConns;
    private myPeerId;
    constructor(provider: MatrixWebrtcProvider, matrixClient: MatrixClient, roomId: string, opts: MatrixWebrtcProviderOptions);
    private connect;
    disconnect(): void;
    private announcePresence;
    private handleMatrixEvent;
    private handlePeerAnnounce;
    private handleWebrtcSignal;
    private setupConnectionHandlers;
    broadcastRoomMessage(msg: Uint8Array): void;
    get peers(): Map<string, MatrixWebrtcConn>;
}
declare class MatrixWebrtcConn {
    private room;
    readonly peerId: string;
    readonly userId: string;
    private readonly isInitiator;
    private matrixClient;
    private roomId;
    private myPeerId;
    connected: boolean;
    onopen: (() => void) | null;
    onmessage: ((m: Uint8Array) => void) | null;
    onclose: (() => void) | null;
    private pc;
    private channel;
    constructor(room: MatrixWebrtcRoom, peerId: string, userId: string, isInitiator: boolean, matrixClient: MatrixClient, roomId: string, myPeerId: string, peerOpts: RTCConfiguration);
    private setupPeerConnection;
    private setupDataChannel;
    initiate(): Promise<void>;
    handleSignal(signal: any): Promise<void>;
    private sendSignal;
    send(msg: Uint8Array): void;
    close(): void;
}
export {};
