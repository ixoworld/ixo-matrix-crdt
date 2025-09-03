function a(e, t) {
  return n(new DataView(e), new DataView(t));
}
function n(e, t) {
  if (e.byteLength !== t.byteLength) return !1;
  for (let r = 0; r < e.byteLength; r++)
    if (e.getUint8(r) !== t.getUint8(r)) return !1;
  return !0;
}
export {
  a as arrayBuffersAreEqual,
  n as dataViewsAreEqual
};
