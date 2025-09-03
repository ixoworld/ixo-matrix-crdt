const i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
function a(n) {
  i.forEach((e) => {
    e.connected && (e.send({ type: "subscribe", topics: [n.name] }), n.webrtcConns.size < n.provider.maxConns && e.publishSignalingMessage(n, {
      type: "announce",
      from: n.peerId
    }));
  });
}
export {
  a as announceSignalingInfo,
  s as globalRooms,
  i as globalSignalingConns
};
