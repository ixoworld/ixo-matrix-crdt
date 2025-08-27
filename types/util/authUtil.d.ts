import { MatrixClient } from "matrix-js-sdk";
/**
 * No-signing authentication for mobile-web Matrix architecture
 * Security model: Matrix room membership = authorization to collaborate
 *
 * Why this works:
 * - Web app uses mobile device's Matrix credentials (no separate device ID)
 * - Matrix room membership provides sufficient security for document collaboration
 * - WebRTC messages only reach room members
 * - Mobile wallet handles primary authentication
 */
export declare function signObject(matrixClient: MatrixClient, obj: any): Promise<void>;
export declare function verifyObject(matrixClient: MatrixClient, memberReader: any, obj: any, expectedEventType?: string): Promise<void>;
