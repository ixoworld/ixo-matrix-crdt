export declare function initMatrixSDK(): void;
export declare function createRandomMatrixClient(): Promise<{
    username: string;
    client: import("matrix-js-sdk").MatrixClient;
}>;
export declare function createRandomMatrixClientAndRoom(access: "public-read-write" | "public-read"): Promise<{
    client: import("matrix-js-sdk").MatrixClient;
    roomId: any;
    roomName: string;
}>;
export declare function createMatrixUser(username: string, password: string): Promise<import("matrix-js-sdk").MatrixClient>;
