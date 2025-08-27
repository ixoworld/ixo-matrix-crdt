import Peer from "simple-peer";
import { Room } from "./Room";
export declare class WebrtcConn {
    private readonly remotePeerId;
    private readonly room;
    private closed;
    private connected;
    synced: boolean;
    private sendWebrtcConn;
    readonly peer: Peer.Instance;
    /**
     * @param {SignalingConn} signalingConn
     * @param {boolean} initiator
     * @param {string} remotePeerId
     * @param {Room} room
     */
    constructor(signalingConn: any, initiator: boolean, remotePeerId: string, room: Room);
    destroy(): void;
}
