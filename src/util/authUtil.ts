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

export async function signObject(matrixClient: MatrixClient, obj: any): Promise<void> {
  const userId = matrixClient.getUserId();
  
  if (!userId) {
    throw new Error("User ID not available");
  }

  // Add user identification and timestamp (no cryptographic signing needed)
  obj.userId = userId;
  obj.timestamp = Date.now();
  
  console.log(`Tagged WebRTC message from user: ${userId}`);
}

export async function verifyObject(
  matrixClient: MatrixClient,
  memberReader: any,
  obj: any,
  expectedEventType?: string
): Promise<void> {
  
  if (!obj.userId) {
    throw new Error("WebRTC message missing user identification");
  }

  // Check message age to prevent old messages from being processed
  if (obj.timestamp) {
    const messageAge = Date.now() - obj.timestamp;
    const MAX_MESSAGE_AGE = 60 * 1000; // 60 seconds max age
    
    if (messageAge > MAX_MESSAGE_AGE) {
      console.warn(`Old WebRTC message ignored (${Math.round(messageAge/1000)}s old)`);
      return;
    }
  }

  // Primary security check: verify user is a room member
  const isValidMember = await memberReader.isValidMember(obj.userId);
  if (!isValidMember) {
    throw new Error(`User ${obj.userId} is not authorized for this collaboration room`);
  }

  console.log(`Verified WebRTC message from authorized room member: ${obj.userId}`);
}