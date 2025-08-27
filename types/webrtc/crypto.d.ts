/**
 * @param {string} secret
 * @param {string} roomName
 * @return {PromiseLike<CryptoKey>}
 */
export declare const deriveKey: (secret: string, roomName: string) => Promise<CryptoKey>;
/**
 * @param {Uint8Array} data data to be encrypted
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} encrypted, base64 encoded message
 */
export declare const encrypt: (data: Uint8Array, key?: CryptoKey) => Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Object} data data to be encrypted
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} encrypted data, if key is provided
 */
export declare const encryptJson: (data: any, key?: CryptoKey) => Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Uint8Array} data
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} decrypted buffer
 */
export declare const decrypt: (data: Uint8Array, key?: CryptoKey) => Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Uint8Array} data
 * @param {CryptoKey?} key
 * @return {PromiseLike<Object>} decrypted object
 */
export declare const decryptJson: (data: Uint8Array, key?: CryptoKey) => Promise<any>;
