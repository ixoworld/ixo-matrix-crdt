import * as Y from "yjs";
import { MatrixClient } from "matrix-js-sdk";

/**
 * Options that can be passed to MatrixWebrtcProvider (mostly ICE config).
 */
export interface MatrixWebrtcProviderOptions {
  password?: string; // ← not used yet but kept for API‑compat
  maxConns?: number;
  peerOpts?: RTCConfiguration;
}

/**
 * Thin wrapper that wires a Yjs Doc to a Matrix room and mirrors updates via
 * a peer‑to‑peer WebRTC mesh.  SignedWebrtcProvider extends this class, so the
 * public surface MUST remain 100 % backward‑compatible.
 */
export class MatrixWebrtcProvider {
  /** active WebRTC room (null until constructor completes) */
  public room: MatrixWebrtcRoom | null = null;

  protected doc: Y.Doc;
  private roomId: string;
  private matrixClient: MatrixClient;
  private opts: MatrixWebrtcProviderOptions;

  /* hooks that subclasses may override ------------------------------------ */
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  public onCustomMessage = (
    _buf: Uint8Array,
    _reply: (m: Uint8Array) => void
  ): void => {
    console.warn("[MatrixWebrtcProvider] onCustomMessage not implemented");
  };
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  public onPeerConnected = (_reply: (m: Uint8Array) => void): void => {
    console.warn("[MatrixWebrtcProvider] onPeerConnected not implemented");
  };
  /* ----------------------------------------------------------------------- */

  constructor(
    doc: Y.Doc,
    matrixClient: MatrixClient,
    roomId: string,
    opts: MatrixWebrtcProviderOptions = {}
  ) {
    this.doc = doc;
    this.matrixClient = matrixClient;
    this.roomId = roomId;
    this.opts = {
      maxConns: 20 + Math.floor(Math.random() * 15),
      peerOpts: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
      ...opts,
    };

    this.room = new MatrixWebrtcRoom(this, matrixClient, roomId, this.opts);
  }

  destroy() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
  }
}

/* ========================================================================== *
 *                            I N T E R N A L S                               *
 * ========================================================================== */

class MatrixWebrtcRoom {
  private webrtcConns = new Map<string, MatrixWebrtcConn>();
  private myPeerId: string;

  constructor(
    private provider: MatrixWebrtcProvider,
    private matrixClient: MatrixClient,
    readonly roomId: string,
    private opts: MatrixWebrtcProviderOptions
  ) {
    this.myPeerId = `${matrixClient.getUserId()}-${Date.now()}`;

    console.log("[MatrixWebrtcRoom] Initializing with peerId:", this.myPeerId);
    this.connect();
  }

  /* ----------------------------------------------------- life‑cycle */
  private connect() {
    this.matrixClient.on(
      "Room.timeline" as any,
      this.handleMatrixEvent.bind(this)
    );
    this.announcePresence();
  }

  disconnect() {
    console.log("[MatrixWebrtcRoom] Disconnecting");
    this.webrtcConns.forEach((c) => c.close());
    this.webrtcConns.clear();
    this.matrixClient.off(
      "Room.timeline" as any,
      this.handleMatrixEvent.bind(this)
    );
  }

  /* ----------------------------------------------------- matrix → rtc */
  private async announcePresence() {
    await this.matrixClient.sendEvent(
      this.roomId,
      "com.yjs.webrtc.announce" as any,
      {
        peerId: this.myPeerId,
        timestamp: Date.now(),
      }
    );
  }

  private handleMatrixEvent(event: any, room: any) {
    if (room.roomId !== this.roomId) return;

    const sender = event.getSender();
    const content = event.getContent();
    const type = event.getType();

    // Ignore *this* tab's own echo (same MXID *and* same peerId)
    if (
      sender === this.matrixClient.getUserId() &&
      content.peerId === this.myPeerId
    ) {
      return;
    }

    switch (type) {
      case "com.yjs.webrtc.announce":
        if (this.webrtcConns.size < (this.opts.maxConns ?? 20)) {
          this.handlePeerAnnounce(content.peerId, sender);
        }
        break;
      case "com.yjs.webrtc.signal":
        if (content.targetPeer === this.myPeerId) {
          this.handleWebrtcSignal(content);
        }
        break;
    }
  }

  /* ---------------------------------------------------- peer handling */
  private async handlePeerAnnounce(peerId: string, userId: string) {
    if (this.webrtcConns.has(peerId)) return;

    // Deterministic tie‑breaker: lexicographically lower MXID initiates.
    const iAmInitiator = this.matrixClient.getUserId()! < userId;

    const conn = new MatrixWebrtcConn(
      this,
      peerId,
      userId,
      iAmInitiator,
      this.matrixClient,
      this.roomId,
      this.myPeerId,
      this.opts.peerOpts!
    );

    this.webrtcConns.set(peerId, conn);
    this.setupConnectionHandlers(conn);

    if (iAmInitiator) await conn.initiate();
  }

  private handleWebrtcSignal(payload: any) {
    const conn = this.webrtcConns.get(payload.fromPeer);

    if (conn) {
      conn.handleSignal(payload.signal);
    } else if (payload.signal.type === "offer") {
      // Offer from peer we haven't seen announce yet (race) → create listener‑side conn
      const newConn = new MatrixWebrtcConn(
        this,
        payload.fromPeer,
        payload.fromUser,
        false,
        this.matrixClient,
        this.roomId,
        this.myPeerId,
        this.opts.peerOpts!
      );
      this.webrtcConns.set(payload.fromPeer, newConn);
      this.setupConnectionHandlers(newConn);
      newConn.handleSignal(payload.signal);
    }
  }

  /* ---------------------------------------------------- conn helpers */
  private setupConnectionHandlers(conn: MatrixWebrtcConn) {
    conn.onopen = () => {
      this.provider.onPeerConnected((msg) => conn.send(msg));
    };
    conn.onmessage = (data) => {
      this.provider.onCustomMessage(data, (reply) => conn.send(reply));
    };
    conn.onclose = () => {
      this.webrtcConns.delete(conn.peerId);
    };
  }

  broadcastRoomMessage(msg: Uint8Array) {
    this.webrtcConns.forEach((c) => {
      if (c.connected) c.send(msg);
    });
  }

  /* ----------------------------------------------------- debug */
  get peers() {
    return this.webrtcConns;
  }
}

/* -------------------------------------------------------------------------- */

class MatrixWebrtcConn {
  public connected = false;
  public onopen: (() => void) | null = null;
  public onmessage: ((m: Uint8Array) => void) | null = null;
  public onclose: (() => void) | null = null;

  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;

  constructor(
    private room: MatrixWebrtcRoom,
    public readonly peerId: string,
    public readonly userId: string,
    private readonly isInitiator: boolean,
    private matrixClient: MatrixClient,
    private roomId: string,
    private myPeerId: string,
    peerOpts: RTCConfiguration
  ) {
    this.pc = new RTCPeerConnection(peerOpts);
    this.setupPeerConnection();
  }

  /* ------------------------------------------------ rtc lifecycle */
  private setupPeerConnection() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal({ type: "ice-candidate", candidate: e.candidate });
      }
    };
    this.pc.ondatachannel = (e) => {
      this.setupDataChannel(e.channel);
    };
  }

  private setupDataChannel(ch: RTCDataChannel) {
    this.channel = ch;
    ch.onopen = () => {
      this.connected = true;
      this.onopen?.();
    };
    ch.onmessage = (e) => this.onmessage?.(new Uint8Array(e.data));
    ch.onclose = () => {
      this.connected = false;
      this.onclose?.();
    };
  }

  async initiate() {
    this.channel = this.pc.createDataChannel("yjs", { ordered: true });
    this.setupDataChannel(this.channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: "offer", offer });
  }

  /* ----------------------------------------------- signalling */
  async handleSignal(signal: any) {
    switch (signal.type) {
      case "offer": {
        if (this.isInitiator) {
          console.debug(
            "[MatrixWebrtcConn] Ignoring colliding offer – I am initiator"
          );
          return;
        }
        await this.pc.setRemoteDescription(signal.offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: "answer", answer });
        break;
      }

      case "answer": {
        // Prevent InvalidStateError by applying answer only once.
        if (this.pc.signalingState !== "have-local-offer") return;
        await this.pc.setRemoteDescription(signal.answer);
        break;
      }

      case "ice-candidate":
        try {
          await this.pc.addIceCandidate(signal.candidate);
        } catch (_) {
          /* ignore */
        }
        break;
    }
  }

  private async sendSignal(signal: any) {
    await this.matrixClient.sendEvent(
      this.roomId,
      "com.yjs.webrtc.signal" as any,
      {
        fromPeer: this.myPeerId,
        fromUser: this.matrixClient.getUserId(),
        targetPeer: this.peerId,
        signal,
      }
    );
  }

  /* ------------------------------------------------ public helpers */
  send(msg: Uint8Array) {
    if (this.channel && this.connected) {
      // Ensure msg has ArrayBuffer backing for WebRTC DataChannel
      const msgBuffer =
        msg.buffer instanceof ArrayBuffer
          ? msg
          : new Uint8Array(new ArrayBuffer(msg.byteLength));
      if (msgBuffer !== msg) {
        msgBuffer.set(msg);
      }
      this.channel.send(msgBuffer as ArrayBufferView<ArrayBuffer>);
    }
  }

  close() {
    this.pc.close();
    this.channel?.close();
    this.connected = false;
    this.onclose?.();
  }
}
