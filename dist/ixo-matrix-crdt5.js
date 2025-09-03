class d {
  /** active WebRTC room (null until constructor completes) */
  room = null;
  doc;
  roomId;
  matrixClient;
  opts;
  /* hooks that subclasses may override ------------------------------------ */
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  onCustomMessage = (e, t) => {
    console.warn("[MatrixWebrtcProvider] onCustomMessage not implemented");
  };
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  onPeerConnected = (e) => {
    console.warn("[MatrixWebrtcProvider] onPeerConnected not implemented");
  };
  /* ----------------------------------------------------------------------- */
  constructor(e, t, n, s = {}) {
    this.doc = e, this.matrixClient = t, this.roomId = n, this.opts = {
      maxConns: 20 + Math.floor(Math.random() * 15),
      peerOpts: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      },
      ...s
    }, this.room = new l(this, t, n, this.opts);
  }
  destroy() {
    this.room && (this.room.disconnect(), this.room = null);
  }
}
class l {
  constructor(e, t, n, s) {
    this.provider = e, this.matrixClient = t, this.roomId = n, this.opts = s, this.myPeerId = `${t.getUserId()}-${Date.now()}`, console.log("[MatrixWebrtcRoom] Initializing with peerId:", this.myPeerId), this.connect();
  }
  webrtcConns = /* @__PURE__ */ new Map();
  myPeerId;
  /* ----------------------------------------------------- life‑cycle */
  connect() {
    this.matrixClient.on(
      "Room.timeline",
      this.handleMatrixEvent.bind(this)
    ), this.announcePresence();
  }
  disconnect() {
    console.log("[MatrixWebrtcRoom] Disconnecting"), this.webrtcConns.forEach((e) => e.close()), this.webrtcConns.clear(), this.matrixClient.off(
      "Room.timeline",
      this.handleMatrixEvent.bind(this)
    );
  }
  /* ----------------------------------------------------- matrix → rtc */
  async announcePresence() {
    await this.matrixClient.sendEvent(
      this.roomId,
      "com.yjs.webrtc.announce",
      {
        peerId: this.myPeerId,
        timestamp: Date.now()
      }
    );
  }
  handleMatrixEvent(e, t) {
    if (t.roomId !== this.roomId) return;
    const n = e.getSender(), s = e.getContent(), i = e.getType();
    if (!(n === this.matrixClient.getUserId() && s.peerId === this.myPeerId))
      switch (i) {
        case "com.yjs.webrtc.announce":
          this.webrtcConns.size < (this.opts.maxConns ?? 20) && this.handlePeerAnnounce(s.peerId, n);
          break;
        case "com.yjs.webrtc.signal":
          s.targetPeer === this.myPeerId && this.handleWebrtcSignal(s);
          break;
      }
  }
  /* ---------------------------------------------------- peer handling */
  async handlePeerAnnounce(e, t) {
    if (this.webrtcConns.has(e)) return;
    const n = this.matrixClient.getUserId() < t, s = new r(
      this,
      e,
      t,
      n,
      this.matrixClient,
      this.roomId,
      this.myPeerId,
      this.opts.peerOpts
    );
    this.webrtcConns.set(e, s), this.setupConnectionHandlers(s), n && await s.initiate();
  }
  handleWebrtcSignal(e) {
    const t = this.webrtcConns.get(e.fromPeer);
    if (t)
      t.handleSignal(e.signal);
    else if (e.signal.type === "offer") {
      const n = new r(
        this,
        e.fromPeer,
        e.fromUser,
        !1,
        this.matrixClient,
        this.roomId,
        this.myPeerId,
        this.opts.peerOpts
      );
      this.webrtcConns.set(e.fromPeer, n), this.setupConnectionHandlers(n), n.handleSignal(e.signal);
    }
  }
  /* ---------------------------------------------------- conn helpers */
  setupConnectionHandlers(e) {
    e.onopen = () => {
      this.provider.onPeerConnected((t) => e.send(t));
    }, e.onmessage = (t) => {
      this.provider.onCustomMessage(t, (n) => e.send(n));
    }, e.onclose = () => {
      this.webrtcConns.delete(e.peerId);
    };
  }
  broadcastRoomMessage(e) {
    this.webrtcConns.forEach((t) => {
      t.connected && t.send(e);
    });
  }
  /* ----------------------------------------------------- debug */
  get peers() {
    return this.webrtcConns;
  }
}
class r {
  constructor(e, t, n, s, i, a, c, h) {
    this.room = e, this.peerId = t, this.userId = n, this.isInitiator = s, this.matrixClient = i, this.roomId = a, this.myPeerId = c, this.pc = new RTCPeerConnection(h), this.setupPeerConnection();
  }
  connected = !1;
  onopen = null;
  onmessage = null;
  onclose = null;
  pc;
  channel = null;
  /* ------------------------------------------------ rtc lifecycle */
  setupPeerConnection() {
    this.pc.onicecandidate = (e) => {
      e.candidate && this.sendSignal({ type: "ice-candidate", candidate: e.candidate });
    }, this.pc.ondatachannel = (e) => {
      this.setupDataChannel(e.channel);
    };
  }
  setupDataChannel(e) {
    this.channel = e, e.onopen = () => {
      this.connected = !0, this.onopen?.();
    }, e.onmessage = (t) => this.onmessage?.(new Uint8Array(t.data)), e.onclose = () => {
      this.connected = !1, this.onclose?.();
    };
  }
  async initiate() {
    this.channel = this.pc.createDataChannel("yjs", { ordered: !0 }), this.setupDataChannel(this.channel);
    const e = await this.pc.createOffer();
    await this.pc.setLocalDescription(e), this.sendSignal({ type: "offer", offer: e });
  }
  /* ----------------------------------------------- signalling */
  async handleSignal(e) {
    switch (e.type) {
      case "offer": {
        if (this.isInitiator) {
          console.debug(
            "[MatrixWebrtcConn] Ignoring colliding offer – I am initiator"
          );
          return;
        }
        await this.pc.setRemoteDescription(e.offer);
        const t = await this.pc.createAnswer();
        await this.pc.setLocalDescription(t), this.sendSignal({ type: "answer", answer: t });
        break;
      }
      case "answer": {
        if (this.pc.signalingState !== "have-local-offer") return;
        await this.pc.setRemoteDescription(e.answer);
        break;
      }
      case "ice-candidate":
        try {
          await this.pc.addIceCandidate(e.candidate);
        } catch {
        }
        break;
    }
  }
  async sendSignal(e) {
    await this.matrixClient.sendEvent(
      this.roomId,
      "com.yjs.webrtc.signal",
      {
        fromPeer: this.myPeerId,
        fromUser: this.matrixClient.getUserId(),
        targetPeer: this.peerId,
        signal: e
      }
    );
  }
  /* ------------------------------------------------ public helpers */
  send(e) {
    if (this.channel && this.connected) {
      const t = e.buffer instanceof ArrayBuffer ? e : new Uint8Array(new ArrayBuffer(e.byteLength));
      t !== e && t.set(e), this.channel.send(t);
    }
  }
  close() {
    this.pc.close(), this.channel?.close(), this.connected = !1, this.onclose?.();
  }
}
export {
  d as MatrixWebrtcProvider
};
