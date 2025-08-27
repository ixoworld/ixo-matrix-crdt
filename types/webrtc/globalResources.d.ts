import { Room } from "./Room";
import { SignalingConn } from "./SignalingConn";
export declare const globalSignalingConns: Map<string, SignalingConn>;
export declare const globalRooms: Map<string, Room>;
export declare function announceSignalingInfo(room: Room): void;
