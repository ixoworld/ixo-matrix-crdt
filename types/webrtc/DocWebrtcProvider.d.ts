import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { WebrtcProvider } from "./WebrtcProvider";
export declare const messageSync = 0;
export declare const messageQueryAwareness = 3;
export declare const messageAwareness = 1;
export declare class DocWebrtcProvider extends WebrtcProvider {
    private readonly doc;
    readonly awareness: awarenessProtocol.Awareness;
    protected onCustomMessage: (buf: Uint8Array, reply: (message: Uint8Array) => void) => void;
    protected onPeerConnected: (reply: (message: Uint8Array) => void) => void;
    /**
     * Listens to Yjs updates and sends them to remote peers
     */
    private _docUpdateHandler;
    /**
     * Listens to Awareness updates and sends them to remote peers
     */
    private _awarenessUpdateHandler;
    constructor(roomName: string, doc: Y.Doc, opts?: any, awareness?: awarenessProtocol.Awareness);
    destroy(): void;
}
