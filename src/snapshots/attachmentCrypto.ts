import { decodeBase64, encodeBase64 } from "../util/olmlib";

/**
 * Matrix `EncryptedFile` (version "v2") — the same structure Matrix clients use
 * for attachments in encrypted rooms.
 *
 * See https://spec.matrix.org/latest/client-server-api/#sending-encrypted-attachments
 *
 * matrix-js-sdk no longer ships `encryptAttachment` / `decryptAttachment`
 * (they live in the react-sdk), so the scheme is implemented here on WebCrypto.
 * Doing it by hand is only safe because the scheme is small and fully specified:
 * AES-256-CTR with a 64-bit counter, plus a SHA-256 of the ciphertext.
 */
export interface EncryptedFileInfo {
  /** the mxc:// url of the uploaded ciphertext */
  url: string;
  key: JsonWebKeyLike;
  /** unpadded base64, 16 bytes: 8 random bytes + 8 zero bytes (counter) */
  iv: string;
  hashes: { sha256: string };
  v: "v2";
}

export interface JsonWebKeyLike {
  kty: "oct";
  key_ops: string[];
  alg: "A256CTR";
  k: string;
  ext: true;
}

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "WebCrypto SubtleCrypto is not available; cannot encrypt/decrypt media snapshots"
    );
  }
  return subtle as SubtleCrypto;
}

function getRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const cryptoObj = (globalThis as any).crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("crypto.getRandomValues is not available");
  }
  cryptoObj.getRandomValues(out);
  return out;
}

function encodeUnpaddedBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/=+$/g, "");
}

function encodeUnpaddedBase64Url(bytes: Uint8Array): string {
  return encodeUnpaddedBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array {
  return decodeBase64(value.replace(/-/g, "+").replace(/_/g, "/"));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await getSubtle().digest("SHA-256", toArrayBuffer(bytes));
  return encodeUnpaddedBase64(new Uint8Array(digest));
}

/**
 * Copy into a standalone ArrayBuffer. Uint8Array views over a pooled Buffer
 * (which is what `decodeBase64` returns in Node) must never be handed to
 * WebCrypto as-is.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Encrypt a blob for upload to the Matrix media repo.
 *
 * @returns the ciphertext to upload plus the key material to put in the (already
 * end-to-end encrypted) Matrix event. `info.url` is left empty; the caller fills
 * it in once the upload returns an mxc:// url.
 */
export async function encryptAttachment(plaintext: Uint8Array): Promise<{
  ciphertext: Uint8Array;
  info: Omit<EncryptedFileInfo, "url">;
}> {
  const subtle = getSubtle();
  const keyBytes = getRandomBytes(32);

  // The IV is 16 bytes; only the first 8 are random. The low 8 bytes are the
  // counter and must start at zero so that decryption is deterministic.
  const iv = new Uint8Array(16);
  iv.set(getRandomBytes(8), 0);

  const jwk: JsonWebKeyLike = {
    kty: "oct",
    key_ops: ["encrypt", "decrypt"],
    alg: "A256CTR",
    k: encodeUnpaddedBase64Url(keyBytes),
    ext: true,
  };

  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-CTR" },
    false,
    ["encrypt"]
  );
  const ciphertextBuffer = await subtle.encrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    key,
    toArrayBuffer(plaintext)
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  return {
    ciphertext,
    info: {
      key: jwk,
      iv: encodeUnpaddedBase64(iv),
      hashes: { sha256: await sha256(ciphertext) },
      v: "v2",
    },
  };
}

/**
 * Decrypt a blob downloaded from the Matrix media repo.
 *
 * Throws if the ciphertext hash does not match `info.hashes.sha256` — a
 * mismatch means the media repo served something other than what was uploaded,
 * which must degrade the catch-up rather than corrupt the document.
 */
export async function decryptAttachment(
  ciphertext: Uint8Array,
  info: Pick<EncryptedFileInfo, "key" | "iv" | "hashes" | "v">
): Promise<Uint8Array> {
  if (info.v !== "v2") {
    throw new Error(`unsupported encrypted file version: ${String(info.v)}`);
  }
  if (!info.key?.k || !info.iv || !info.hashes?.sha256) {
    throw new Error("incomplete encrypted file info");
  }

  const actualHash = await sha256(ciphertext);
  if (actualHash !== info.hashes.sha256.replace(/=+$/g, "")) {
    throw new Error("encrypted media snapshot failed sha256 integrity check");
  }

  const subtle = getSubtle();
  const keyBytes = decodeBase64Url(info.key.k);
  // copy out of the (pooled) Buffer-backed view so the type is Uint8Array<ArrayBuffer>
  const iv = new Uint8Array(decodeBase64(info.iv));
  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    key,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(plaintext);
}

/** Exported for the unencrypted path, which hashes the blob for integrity too. */
export async function sha256UnpaddedBase64(bytes: Uint8Array): Promise<string> {
  return sha256(bytes);
}
