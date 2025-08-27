/**
 * Verify the signature on an object
 *
 * @param {module:crypto/OlmDevice} olmDevice olm wrapper to use for verify op
 *
 * @param {Object} obj object to check signature on.
 *
 * @param {string} signingUserId  ID of the user whose signature should be checked
 *
 * @param {string} signingDeviceId  ID of the device whose signature should be checked
 *
 * @param {string} signingKey   base64-ed ed25519 public key
 *
 * Returns a promise which resolves (to undefined) if the the signature is good,
 * or rejects with an Error if it is bad.
 */
export declare function verifySignature(olmDevice: any, obj: any, signingUserId: string, signingDeviceId: string, signingKey: string): Promise<void>;
/**
 * Verify a signed JSON object
 * @param {Object} obj Object to verify
 * @param {string} pubkey The public key to use to verify
 * @param {string} userId The user ID who signed the object
 */
export declare function pkVerify(obj: any, pubkey: string, userId: string): void;
/**
 * Encode a typed array of uint8 as base64.
 * @param {Uint8Array} uint8Array The data to encode.
 * @return {string} The base64.
 */
export declare function encodeBase64(uint8Array: Uint8Array | ArrayBuffer): string;
/**
 * Decode a base64 string to a typed array of uint8.
 * @param {string} base64 The base64 to decode.
 * @return {Uint8Array} The decoded data.
 */
export declare function decodeBase64(base64: string): Uint8Array;
