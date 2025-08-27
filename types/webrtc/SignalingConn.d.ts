import * as ws from "lib0/websocket";
import { Room } from "./Room";
import { WebrtcProvider } from "./WebrtcProvider";
export declare class SignalingConn extends ws.WebsocketClient {
    readonly providers: Set<WebrtcProvider>;
    constructor(url: string);
    publishSignalingMessage: (room: Room, data: any) => void;
}
