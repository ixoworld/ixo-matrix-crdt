/**
 * Helper function to create a Matrix room suitable for use with MatrixProvider.
 * Access can currently be set to "public-read-write" | "public-read"
 */
export declare function createMatrixRoom(matrixClient: any, roomName: string, access: "public-read-write" | "public-read"): Promise<"already-exists" | "offline" | {
    status: "ok";
    roomId: any;
    error?: undefined;
} | {
    status: "error";
    error: any;
    roomId?: undefined;
}>;
export declare function getMatrixRoomAccess(matrixClient: any, roomId: string): Promise<"public-read-write" | "public-read" | {
    status: "error";
    error: unknown;
}>;
/**
 * Helper function to change access of a Matrix Room
 * Access can currently be set to "public-read-write" | "public-read"
 */
export declare function updateMatrixRoomAccess(matrixClient: any, roomId: string, access: "public-read-write" | "public-read"): Promise<"offline" | {
    status: "ok";
    roomId: string;
    error?: undefined;
} | {
    status: "error";
    error: any;
    roomId?: undefined;
}>;
