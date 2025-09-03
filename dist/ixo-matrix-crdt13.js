import "another-json";
function n(e) {
  const r = e instanceof ArrayBuffer ? new Uint8Array(e) : e;
  return Buffer.from(r).toString("base64");
}
function t(e) {
  const r = Buffer.from(e, "base64");
  return new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
}
export {
  t as decodeBase64,
  n as encodeBase64
};
