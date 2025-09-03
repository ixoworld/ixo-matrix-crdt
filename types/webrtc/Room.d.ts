import * as encoding from "lib0/encoding";
import { WebrtcConn } from "./WebrtcConn";
import { WebrtcProvider } from "./WebrtcProvider";
export declare class Room {
    readonly provider: WebrtcProvider;
    readonly onCustomMessage: (message: Uint8Array, reply: (message: Uint8Array) => void) => void;
    readonly onPeerConnected: (reply: (message: Uint8Array) => void) => void;
    readonly name: string;
    readonly key: CryptoKey | undefined;
    /**
     * Do not assume that peerId is unique. This is only meant for sending signaling messages.
     */
    readonly peerId: string;
    private synced;
    readonly webrtcConns: Map<string, WebrtcConn>;
    readonly bcConns: Set<string>;
    readonly mux: import("lib0/mutex.js").mutex;
    private bcconnected;
    private _bcSubscriber;
    readMessage: (buf: Uint8Array, reply: (reply: encoding.Encoder) => void) => void;
    private broadcastBcPeerId;
    private broadcastWebrtcConn;
    broadcastRoomMessage(m: Uint8Array): void;
    private broadcastBcMessage;
    constructor(provider: WebrtcProvider, onCustomMessage: (message: Uint8Array, reply: (message: Uint8Array) => void) => void, onPeerConnected: (reply: (message: Uint8Array) => void) => void, name: string, key: CryptoKey | undefined);
    connect(): void;
    disconnect(): void;
    destroy(): void;
}
