import * as Y from "yjs";
import { MatrixWebrtcProvider } from "./webrtc/MatrixWebrtcProvider";
import { BlockNoteAwareness } from "./awareness/BlockNoteAwareness";
export declare const messageSync = 0;
export declare const messageAwareness = 1;
export declare class SignedWebrtcProvider extends MatrixWebrtcProvider {
    private sign;
    private verify;
    private awareness?;
    onCustomMessage: (buf: Uint8Array, reply: (message: Uint8Array) => void) => void;
    onPeerConnected: (reply: (message: Uint8Array) => void) => void;
    private _docUpdateHandler;
    private _awarenessUpdateHandler;
    constructor(doc: Y.Doc, matrixClient: any, roomId: string, sign: (obj: any) => Promise<void>, verify: (obj: any) => Promise<void>, awareness?: BlockNoteAwareness, opts?: any);
    destroy(): void;
}
