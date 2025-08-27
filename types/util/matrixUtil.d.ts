import { MatrixClient } from "matrix-js-sdk";
export declare const MESSAGE_EVENT_TYPE: "m.room.message";
export declare function sendMessage(client: MatrixClient, roomId: string, message: string, eventType?: "m.room.message"): Promise<void>;
