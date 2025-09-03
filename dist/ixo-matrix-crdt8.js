async function a(s, r) {
  const e = s.getUserId();
  if (!e)
    throw new Error("User ID not available");
  r.userId = e, r.timestamp = Date.now(), console.log(`Tagged WebRTC message from user: ${e}`);
}
async function m(s, r, e, o) {
  if (!e.userId)
    throw new Error("WebRTC message missing user identification");
  if (e.timestamp) {
    const i = Date.now() - e.timestamp, t = 60 * 1e3;
    if (i > t) {
      console.warn(`Old WebRTC message ignored (${Math.round(i / 1e3)}s old)`);
      return;
    }
  }
  if (!await r.isValidMember(e.userId))
    throw new Error(`User ${e.userId} is not authorized for this collaboration room`);
  console.log(`Verified WebRTC message from authorized room member: ${e.userId}`);
}
export {
  a as signObject,
  m as verifyObject
};
