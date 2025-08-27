/* eslint-env browser */

import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as promise from "lib0/promise";
import * as error from "lib0/error";
import * as string from "lib0/string";

/**
 * @param {string} secret
 * @param {string} roomName
 * @return {PromiseLike<CryptoKey>}
 */
export const deriveKey = (secret: string, roomName: string) => {
  const secretBuffer = string.encodeUtf8(secret).buffer;
  const salt = string.encodeUtf8(roomName).buffer;

  // Ensure we have ArrayBuffer, not ArrayBufferLike
  const secretArrayBuffer =
    secretBuffer instanceof ArrayBuffer
      ? secretBuffer
      : new ArrayBuffer(secretBuffer.byteLength);
  const saltArrayBuffer =
    salt instanceof ArrayBuffer ? salt : new ArrayBuffer(salt.byteLength);

  if (secretBuffer !== secretArrayBuffer) {
    new Uint8Array(secretArrayBuffer).set(new Uint8Array(secretBuffer));
  }
  if (salt !== saltArrayBuffer) {
    new Uint8Array(saltArrayBuffer).set(new Uint8Array(salt));
  }

  return crypto.subtle
    .importKey("raw", secretArrayBuffer, "PBKDF2", false, ["deriveKey"])
    .then((keyMaterial) =>
      crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltArrayBuffer,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        {
          name: "AES-GCM",
          length: 256,
        },
        true,
        ["encrypt", "decrypt"]
      )
    );
};

/**
 * @param {Uint8Array} data data to be encrypted
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} encrypted, base64 encoded message
 */
export const encrypt = async (data: Uint8Array, key?: CryptoKey) => {
  if (!key) {
    return data;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Ensure data has ArrayBuffer backing for Web Crypto API
  const dataBuffer =
    data.buffer instanceof ArrayBuffer
      ? data
      : new Uint8Array(new ArrayBuffer(data.byteLength));
  if (dataBuffer !== data) {
    dataBuffer.set(data);
  }
  return crypto.subtle
    .encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      dataBuffer as BufferSource
    )
    .then((cipher) => {
      const encryptedDataEncoder = encoding.createEncoder();
      encoding.writeVarString(encryptedDataEncoder, "AES-GCM");
      encoding.writeVarUint8Array(encryptedDataEncoder, iv);
      encoding.writeVarUint8Array(encryptedDataEncoder, new Uint8Array(cipher));
      return encoding.toUint8Array(encryptedDataEncoder);
    });
};

/**
 * @param {Object} data data to be encrypted
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} encrypted data, if key is provided
 */
export const encryptJson = (data: any, key?: CryptoKey) => {
  const dataEncoder = encoding.createEncoder();
  encoding.writeAny(dataEncoder, data);
  return encrypt(encoding.toUint8Array(dataEncoder), key);
};

/**
 * @param {Uint8Array} data
 * @param {CryptoKey?} key
 * @return {PromiseLike<Uint8Array>} decrypted buffer
 */
export const decrypt = async (data: Uint8Array, key?: CryptoKey) => {
  if (!key) {
    return data;
  }
  const dataDecoder = decoding.createDecoder(data);
  const algorithm = decoding.readVarString(dataDecoder);
  if (algorithm !== "AES-GCM") {
    promise.reject(error.create("Unknown encryption algorithm"));
  }
  const iv = decoding.readVarUint8Array(dataDecoder);
  const cipher = decoding.readVarUint8Array(dataDecoder);
  // Ensure iv and cipher have ArrayBuffer backing for Web Crypto API
  const ivBuffer =
    iv.buffer instanceof ArrayBuffer
      ? iv
      : new Uint8Array(new ArrayBuffer(iv.byteLength));
  const cipherBuffer =
    cipher.buffer instanceof ArrayBuffer
      ? cipher
      : new Uint8Array(new ArrayBuffer(cipher.byteLength));
  if (ivBuffer !== iv) {
    ivBuffer.set(iv);
  }
  if (cipherBuffer !== cipher) {
    cipherBuffer.set(cipher);
  }
  return crypto.subtle
    .decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer as BufferSource,
      },
      key,
      cipherBuffer as BufferSource
    )
    .then((data) => new Uint8Array(data));
};

/**
 * @param {Uint8Array} data
 * @param {CryptoKey?} key
 * @return {PromiseLike<Object>} decrypted object
 */
export const decryptJson = (data: Uint8Array, key?: CryptoKey) =>
  decrypt(data, key).then((decryptedValue) =>
    decoding.readAny(decoding.createDecoder(new Uint8Array(decryptedValue)))
  );
