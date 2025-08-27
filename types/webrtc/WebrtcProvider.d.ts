import { Observable } from "lib0/observable";
import { Room } from "./Room";
export declare abstract class WebrtcProvider extends Observable<string> {
    private readonly roomName;
    private shouldConnect;
    readonly filterBcConns: boolean;
    private readonly signalingUrls;
    private readonly signalingConns;
    readonly peerOpts: any;
    readonly maxConns: number;
    private readonly key;
    protected room: Room | undefined;
    protected abstract onCustomMessage: (message: Uint8Array, reply: (message: Uint8Array) => void) => void;
    protected abstract onPeerConnected: (reply: (message: Uint8Array) => void) => void;
    constructor(roomName: string, { signaling, password, maxConns, // the random factor reduces the chance that n clients form a cluster
    filterBcConns, peerOpts, }?: {
        signaling?: string[] | undefined;
        password?: string | undefined;
        maxConns?: number | undefined;
        filterBcConns?: boolean | undefined;
        peerOpts?: {} | undefined;
    });
    /**
     * @type {boolean}
     */
    get connected(): boolean;
    connect(): void;
    disconnect(): void;
    destroy(): void;
}
