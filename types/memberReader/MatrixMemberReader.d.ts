import { MatrixClient } from "matrix-js-sdk";
import { lifecycle } from "vscode-lib";
import { MatrixReader } from "../reader/MatrixReader";
type Member = {
    displayname: string;
    user_id: string;
};
/**
 * TODO: possible to replace with matrixClient maySendMessage / maySendEvent?
 *
 * Keeps track of Members in a room with write access
 *
 * Use hasWriteAccess to validate whether a user has write access to the room.
 *
 * A MatrixMemberReader keeps track of users and permissions by
 * retrieving and monitoring m.room.member and m.room.power_levels information
 */
export declare class MatrixMemberReader extends lifecycle.Disposable {
    private matrixClient;
    private reader;
    private disposed;
    private initialized;
    private initializing;
    private initializeOutdated;
    readonly members: Map<string, Member>;
    private powerLevels;
    constructor(matrixClient: MatrixClient, reader: MatrixReader);
    hasWriteAccess(user_id: string, event_type?: string): boolean;
    /**
     * Check if a user ID is a valid room member
     * This is the primary security check for WebRTC messages
     */
    isValidMember(userId: string): Promise<boolean>;
    private processEvent;
    initialize(): Promise<void>;
    dispose(): void;
}
export {};
