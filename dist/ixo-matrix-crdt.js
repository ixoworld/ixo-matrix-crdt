import * as dt from "matrix-js-sdk";
import { RoomEvent as Ue, MatrixEvent as ut, Method as ft, Direction as pt } from "matrix-js-sdk";
import { lifecycle as te, event as A } from "vscode-lib";
import * as p from "yjs";
import "another-json";
import * as mt from "lodash";
import gt from "simple-peer";
async function yt(t, e) {
  const s = t.getUserId();
  if (!s)
    throw new Error("User ID not available");
  e.userId = s, e.timestamp = Date.now(), console.log(`Tagged WebRTC message from user: ${s}`);
}
async function wt(t, e, s, n) {
  if (!s.userId)
    throw new Error("WebRTC message missing user identification");
  if (s.timestamp) {
    const r = Date.now() - s.timestamp, o = 60 * 1e3;
    if (r > o) {
      console.warn(`Old WebRTC message ignored (${Math.round(r / 1e3)}s old)`);
      return;
    }
  }
  if (!await e.isValidMember(s.userId))
    throw new Error(`User ${s.userId} is not authorized for this collaboration room`);
  console.log(`Verified WebRTC message from authorized room member: ${s.userId}`);
}
class bt extends te.Disposable {
  constructor(e, s) {
    super(), this.matrixClient = e, this.reader = s, this._register(
      this.reader.onEvents((n) => n.events.forEach((i) => this.processEvent(i)))
    );
  }
  disposed = !1;
  initialized = !1;
  initializing = !1;
  initializeOutdated = !1;
  members = /* @__PURE__ */ new Map();
  powerLevels;
  hasWriteAccess(e, s = "m.room.message") {
    if (!this.members.has(e))
      return !1;
    const n = this.powerLevels;
    let i = n.events[s];
    i === void 0 && (i = n.events_default);
    let r = n.users[e];
    if (r === void 0 && (r = n.users_default), typeof r != "number" || typeof i != "number")
      throw new Error("unexpected");
    return r >= i;
  }
  /**
   * Check if a user ID is a valid room member
   * This is the primary security check for WebRTC messages
   */
  async isValidMember(e) {
    return this.members.has(e);
  }
  processEvent = (e) => {
    if (!(e.type !== "m.room.power_levels" && e.type !== "m.room.member")) {
      if (this.initializing) {
        this.initializeOutdated = !0;
        return;
      }
      if (this.initialized) {
        if (e.type === "m.room.power_levels") {
          this.powerLevels = e.content;
          return;
        }
        if (e.type === "m.room.member") {
          if (e.content.membership === "join" || e.content.membership === "invite") {
            const s = {
              displayname: e.content.displayname,
              user_id: e.state_key
            };
            this.members.set(e.state_key, s);
          } else
            this.members.delete(e.state_key);
          return;
        }
        throw new Error("unexpected");
      }
    }
  };
  async initialize() {
    if (this.initializing || this.initialized)
      throw new Error("already initializing / initialized");
    if (!this.reader.isStarted)
      throw new Error(
        "MatrixReader must have started before initializing MatrixMemberReader"
      );
    this.initializing = !0;
    const [e, s] = await Promise.all([
      this.matrixClient.getStateEvent(
        this.reader.roomId,
        "m.room.power_levels",
        void 0
      ),
      this.matrixClient.members(
        this.reader.roomId,
        void 0,
        ["knock", "leave", "ban"]
        // any because of https://github.com/matrix-org/matrix-js-sdk/pull/2319
      )
    ]);
    if (this.initializeOutdated)
      return this.initializing = !1, this.initializeOutdated = !1, this.initialize();
    this.powerLevels = e, s.chunk.filter(
      (n) => n.type === "m.room.member" && (n.content.membership === "join" || n.content.membership === "invite")
    ).forEach((n) => {
      this.members.set(n.state_key, {
        displayname: n.content.displayname,
        user_id: n.state_key
      });
    }), this.initializing = !1, this.initialized = !0;
  }
  dispose() {
    this.disposed = !0, super.dispose();
  }
}
const vt = 30 * 1e3, St = 30 * 1e3, Ct = {
  snapshotInterval: 30
  // send a snapshot after 30 events
};
class It extends te.Disposable {
  constructor(e, s, n, i = {}) {
    super(), this.matrixClient = e, this.roomId = s, this.translator = n, this.opts = { ...Ct, ...i }, this.matrixClient.on(Ue.Timeline, this.matrixRoomListener);
  }
  latestToken;
  disposed = !1;
  polling = !1;
  pendingPollRequest;
  pollRetryTimeout;
  messagesSinceSnapshot = 0;
  _onEvents = this._register(
    new A.Emitter()
  );
  onEvents = this._onEvents.event;
  opts;
  /**
   * Only receives messages from rooms the user has joined, and after startClient() has been called
   * (i.e.: they're received via the sync API).
   *
   * At this moment, we only poll for events using the /events endpoint.
   * I.e. the Sync API should not be used (and startClient() should not be called).
   *
   * We do this because we don't want the MatrixClient to keep all events in memory.
   * For yjs, this is not necessary, as events are document updates which are accumulated in the yjs
   * document, so already stored there.
   *
   * In a later version, it might be more efficient to call the /sync API manually
   * (without relying on the Timeline / sync system in the matrix-js-sdk),
   * because it allows us to retrieve events for multiple rooms simultaneously, instead of
   * a seperate /events poll per room
   */
  matrixRoomListener = (e, s, n) => {
    throw console.error("not expected; Room.timeline on MatrixClient"), new Error(
      "unexpected, we don't use /sync calls for MatrixReader, startClient should not be used on the Matrix client"
    );
  };
  /**
   * Handle incoming events to determine whether a snapshot message needs to be sent
   *
   * MatrixReader keeps an internal counter of messages received.
   * every opts.snapshotInterval messages, we send a snapshot of the entire document state.
   */
  processIncomingEventsForSnapshot(e) {
    let s = !1;
    for (let n of e)
      if (this.translator.isUpdateEvent(n)) {
        if (n.room_id !== this.roomId)
          throw new Error("event received with invalid roomid");
        this.messagesSinceSnapshot++, this.messagesSinceSnapshot % this.opts.snapshotInterval === 0 && n.user_id === this.matrixClient.credentials.userId && (s = !0);
      } else this.translator.isSnapshotEvent(n) && (this.messagesSinceSnapshot = 0, s = !1);
    return s;
  }
  async decryptRawEventsIfNecessary(e) {
    return await Promise.all(
      e.map(async (n) => {
        if (n.type === "m.room.encrypted") {
          const i = new ut(n);
          return await this.matrixClient.decryptEventIfNeeded(i), i.getEffectiveEvent();
        } else
          return n;
      })
    );
  }
  /**
   * Peek for new room events using the Matrix /events API (long-polling)
   * This function automatically keeps polling until MatrixReader.dispose() is called
   */
  async peekPoll() {
    if (!this.latestToken)
      throw new Error("polling but no pagination token");
    if (!this.disposed)
      try {
        this.pendingPollRequest = this.matrixClient.http.authedRequest(
          ft.Get,
          "/events",
          {
            room_id: this.roomId,
            timeout: vt.toString(),
            from: this.latestToken
          }
        );
        const e = await this.pendingPollRequest;
        if (this.pendingPollRequest = void 0, this.disposed)
          return;
        const s = await this.decryptRawEventsIfNecessary(e.chunk), n = this.processIncomingEventsForSnapshot(s);
        s.length && this._onEvents.fire({ events: s, shouldSendSnapshot: n }), this.latestToken = e.end, this.peekPoll();
      } catch (e) {
        console.error("peek error", e), this.disposed || (this.pollRetryTimeout = setTimeout(
          () => this.peekPoll(),
          St
        ));
      }
  }
  /**
   * Before starting polling, call getInitialDocumentUpdateEvents to get the history of events
   * when coming online.
   *
   * This methods paginates back until
   * - (a) all events in the room have been received. In that case we return all events.
   * - (b) it encounters a snapshot. In this case we return the snapshot event and all update events
   *        that occur after that latest snapshot
   *
   * (if typeFilter is set we retrieve all events of that type. TODO: can we deprecate this param?)
   */
  async getInitialDocumentUpdateEvents(e) {
    let s = [], n = "", i = !0, r;
    for (; i; ) {
      const o = await this.matrixClient.createMessagesRequest(
        this.roomId,
        n,
        30,
        pt.Backward
        // TODO: filter?
      ), a = await this.decryptRawEventsIfNecessary(o.chunk);
      for (let c of a)
        if (e)
          c.type === e && s.push(c);
        else if (this.translator.isSnapshotEvent(c))
          s.push(c), r = c.content.last_event_id;
        else if (this.translator.isUpdateEvent(c)) {
          if (r && r === c.event_id)
            return this.latestToken || (this.latestToken = o.start), s.reverse();
          this.messagesSinceSnapshot++, s.push(c);
        }
      n = o.end || "", this.latestToken || (this.latestToken = o.start), i = !!(o.start !== o.end && o.end);
    }
    return s.reverse();
  }
  /**
   * Start polling the room for messages
   */
  startPolling() {
    if (this.polling)
      throw new Error("already polling");
    this.polling = !0, this.peekPoll();
  }
  get isStarted() {
    return this.polling;
  }
  dispose() {
    this.disposed = !0, super.dispose(), this.pollRetryTimeout && clearTimeout(this.pollRetryTimeout), this.pendingPollRequest, this.matrixClient.off(Ue.Timeline, this.matrixRoomListener);
  }
}
const Ne = 64, P = 128, ce = 63, _ = 127, Et = 2147483647, R = Math.floor, Ut = Math.abs, At = Math.log10, We = (t, e) => t < e ? t : e, ze = (t, e) => t > e ? t : e, _t = (t) => t !== 0 ? t < 0 : 1 / t < 0, je = Number.MAX_SAFE_INTEGER, xt = Number.isInteger || ((t) => typeof t == "number" && isFinite(t) && R(t) === t), ge = () => /* @__PURE__ */ new Set(), Mt = Array.from, Tt = Array.isArray, kt = String.fromCharCode, Pt = (t) => t.toLowerCase(), Rt = /^\s*/g, Dt = (t) => t.replace(Rt, ""), Lt = /([A-Z])/g, Ae = (t, e) => Dt(t.replace(Lt, (s) => `${e}${Pt(s)}`)), Bt = (t) => {
  const e = unescape(encodeURIComponent(t)), s = e.length, n = new Uint8Array(s);
  for (let i = 0; i < s; i++)
    n[i] = /** @type {number} */
    e.codePointAt(i);
  return n;
}, W = (
  /** @type {TextEncoder} */
  typeof TextEncoder < "u" ? new TextEncoder() : null
), Ot = (t) => W.encode(t), le = W ? Ot : Bt;
let F = typeof TextDecoder > "u" ? null : new TextDecoder("utf-8", { fatal: !0, ignoreBOM: !0 });
F && F.decode(new Uint8Array()).length === 1 && (F = null);
const se = (t) => new Error(t);
class Ft {
  constructor() {
    this.cpos = 0, this.cbuf = new Uint8Array(100), this.bufs = [];
  }
}
const u = () => new Ft(), Nt = (t) => {
  let e = t.cpos;
  for (let s = 0; s < t.bufs.length; s++)
    e += t.bufs[s].length;
  return e;
}, f = (t) => {
  const e = new Uint8Array(Nt(t));
  let s = 0;
  for (let n = 0; n < t.bufs.length; n++) {
    const i = t.bufs[n];
    e.set(i, s), s += i.length;
  }
  return e.set(new Uint8Array(t.cbuf.buffer, 0, t.cpos), s), e;
}, Wt = (t, e) => {
  const s = t.cbuf.length;
  s - t.cpos < e && (t.bufs.push(new Uint8Array(t.cbuf.buffer, 0, t.cpos)), t.cbuf = new Uint8Array(ze(s, e) * 2), t.cpos = 0);
}, d = (t, e) => {
  const s = t.cbuf.length;
  t.cpos === s && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(s * 2), t.cpos = 0), t.cbuf[t.cpos++] = e;
}, _e = d, l = (t, e) => {
  for (; e > _; )
    d(t, P | _ & e), e = R(e / 128);
  d(t, _ & e);
}, zt = (t, e) => {
  const s = _t(e);
  for (s && (e = -e), d(t, (e > ce ? P : 0) | (s ? Ne : 0) | ce & e), e = R(e / 64); e > 0; )
    d(t, (e > _ ? P : 0) | _ & e), e = R(e / 128);
}, he = new Uint8Array(3e4), jt = he.length / 3, Vt = (t, e) => {
  if (e.length < jt) {
    const s = W.encodeInto(e, he).written || 0;
    l(t, s);
    for (let n = 0; n < s; n++)
      d(t, he[n]);
  } else
    m(t, le(e));
}, $t = (t, e) => {
  const s = unescape(encodeURIComponent(e)), n = s.length;
  l(t, n);
  for (let i = 0; i < n; i++)
    d(
      t,
      /** @type {number} */
      s.codePointAt(i)
    );
}, D = W && /** @type {any} */
W.encodeInto ? Vt : $t, Ht = (t, e) => {
  const s = t.cbuf.length, n = t.cpos, i = We(s - n, e.length), r = e.length - i;
  t.cbuf.set(e.subarray(0, i), n), t.cpos += i, r > 0 && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(ze(s * 2, r)), t.cbuf.set(e.subarray(i)), t.cpos = r);
}, m = (t, e) => {
  l(t, e.byteLength), Ht(t, e);
}, ye = (t, e) => {
  Wt(t, e);
  const s = new DataView(t.cbuf.buffer, t.cpos, e);
  return t.cpos += e, s;
}, Gt = (t, e) => ye(t, 4).setFloat32(0, e, !1), qt = (t, e) => ye(t, 8).setFloat64(0, e, !1), Jt = (t, e) => (
  /** @type {any} */
  ye(t, 8).setBigInt64(0, e, !1)
), xe = new DataView(new ArrayBuffer(4)), Yt = (t) => (xe.setFloat32(0, t), xe.getFloat32(0) === t), q = (t, e) => {
  switch (typeof e) {
    case "string":
      d(t, 119), D(t, e);
      break;
    case "number":
      xt(e) && Ut(e) <= Et ? (d(t, 125), zt(t, e)) : Yt(e) ? (d(t, 124), Gt(t, e)) : (d(t, 123), qt(t, e));
      break;
    case "bigint":
      d(t, 122), Jt(t, e);
      break;
    case "object":
      if (e === null)
        d(t, 126);
      else if (Tt(e)) {
        d(t, 117), l(t, e.length);
        for (let s = 0; s < e.length; s++)
          q(t, e[s]);
      } else if (e instanceof Uint8Array)
        d(t, 116), m(t, e);
      else {
        d(t, 118);
        const s = Object.keys(e);
        l(t, s.length);
        for (let n = 0; n < s.length; n++) {
          const i = s[n];
          D(t, i), q(t, e[i]);
        }
      }
      break;
    case "boolean":
      d(t, e ? 120 : 121);
      break;
    default:
      d(t, 127);
  }
}, Ve = se("Unexpected end of array"), $e = se("Integer out of Range");
class Kt {
  /**
   * @param {Uint8Array} uint8Array Binary data to decode
   */
  constructor(e) {
    this.arr = e, this.pos = 0;
  }
}
const T = (t) => new Kt(t), Xt = (t, e) => {
  const s = new Uint8Array(t.arr.buffer, t.pos + t.arr.byteOffset, e);
  return t.pos += e, s;
}, S = (t) => Xt(t, y(t)), J = (t) => t.arr[t.pos++], y = (t) => {
  let e = 0, s = 1;
  const n = t.arr.length;
  for (; t.pos < n; ) {
    const i = t.arr[t.pos++];
    if (e = e + (i & _) * s, s *= 128, i < P)
      return e;
    if (e > je)
      throw $e;
  }
  throw Ve;
}, Zt = (t) => {
  let e = t.arr[t.pos++], s = e & ce, n = 64;
  const i = (e & Ne) > 0 ? -1 : 1;
  if ((e & P) === 0)
    return i * s;
  const r = t.arr.length;
  for (; t.pos < r; ) {
    if (e = t.arr[t.pos++], s = s + (e & _) * n, n *= 128, e < P)
      return i * s;
    if (s > je)
      throw $e;
  }
  throw Ve;
}, Qt = (t) => {
  let e = y(t);
  if (e === 0)
    return "";
  {
    let s = String.fromCodePoint(J(t));
    if (--e < 100)
      for (; e--; )
        s += String.fromCodePoint(J(t));
    else
      for (; e > 0; ) {
        const n = e < 1e4 ? e : 1e4, i = t.arr.subarray(t.pos, t.pos + n);
        t.pos += n, s += String.fromCodePoint.apply(
          null,
          /** @type {any} */
          i
        ), e -= n;
      }
    return decodeURIComponent(escape(s));
  }
}, es = (t) => (
  /** @type any */
  F.decode(S(t))
), z = F ? es : Qt, we = (t, e) => {
  const s = new DataView(t.arr.buffer, t.arr.byteOffset + t.pos, e);
  return t.pos += e, s;
}, ts = (t) => we(t, 4).getFloat32(0, !1), ss = (t) => we(t, 8).getFloat64(0, !1), ns = (t) => (
  /** @type {any} */
  we(t, 8).getBigInt64(0, !1)
), is = [
  (t) => {
  },
  // CASE 127: undefined
  (t) => null,
  // CASE 126: null
  Zt,
  // CASE 125: integer
  ts,
  // CASE 124: float32
  ss,
  // CASE 123: float64
  ns,
  // CASE 122: bigint
  (t) => !1,
  // CASE 121: boolean (false)
  (t) => !0,
  // CASE 120: boolean (true)
  z,
  // CASE 119: string
  (t) => {
    const e = y(t), s = {};
    for (let n = 0; n < e; n++) {
      const i = z(t);
      s[i] = Y(t);
    }
    return s;
  },
  (t) => {
    const e = y(t), s = [];
    for (let n = 0; n < e; n++)
      s.push(Y(t));
    return s;
  },
  S
  // CASE 116: Uint8Array
], Y = (t) => is[127 - J(t)](t), be = 0, He = 1, ve = 2, rs = (t, e) => {
  l(t, be);
  const s = p.encodeStateVector(e);
  m(t, s);
}, os = (t, e, s) => {
  l(t, He), m(t, p.encodeStateAsUpdate(e, s));
}, as = (t, e, s) => os(e, s, S(t)), Ge = (t, e, s) => {
  try {
    p.applyUpdate(e, S(t), s);
  } catch (n) {
    console.error("Caught error while handling a Yjs update", n);
  }
}, qe = (t, e) => {
  l(t, ve), m(t, e);
}, cs = Ge, Je = (t, e, s, n) => {
  const i = y(t);
  switch (i) {
    case be:
      as(t, e, s);
      break;
    case He:
      Ge(t, s, n);
      break;
    case ve:
      cs(t, s, n);
      break;
    default:
      throw new Error("Unknown message type");
  }
  return i;
}, x = () => /* @__PURE__ */ new Map(), j = (t, e, s) => {
  let n = t.get(e);
  return n === void 0 && t.set(e, n = s()), n;
}, ls = (t, e) => {
  const s = [];
  for (const [n, i] of t)
    s.push(e(i, n));
  return s;
}, Me = (t) => t === void 0 ? null : t;
class hs {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  /**
   * @param {string} key
   * @param {any} newValue
   */
  setItem(e, s) {
    this.map.set(e, s);
  }
  /**
   * @param {string} key
   */
  getItem(e) {
    return this.map.get(e);
  }
}
let Ye = new hs(), Se = !0;
try {
  typeof localStorage < "u" && localStorage && (Ye = localStorage, Se = !1);
} catch {
}
const Ke = Ye, ds = (t) => Se || addEventListener(
  "storage",
  /** @type {any} */
  t
), us = (t) => Se || removeEventListener(
  "storage",
  /** @type {any} */
  t
), fs = Object.keys, Te = (t) => fs(t).length, ps = (t, e) => Object.prototype.hasOwnProperty.call(t, e), ke = Symbol("Equality"), ms = () => {
}, N = (t, e) => {
  if (t === e)
    return !0;
  if (t == null || e == null || t.constructor !== e.constructor)
    return !1;
  if (t[ke] != null)
    return t[ke](e);
  switch (t.constructor) {
    case ArrayBuffer:
      t = new Uint8Array(t), e = new Uint8Array(e);
    // eslint-disable-next-line no-fallthrough
    case Uint8Array: {
      if (t.byteLength !== e.byteLength)
        return !1;
      for (let s = 0; s < t.length; s++)
        if (t[s] !== e[s])
          return !1;
      break;
    }
    case Set: {
      if (t.size !== e.size)
        return !1;
      for (const s of t)
        if (!e.has(s))
          return !1;
      break;
    }
    case Map: {
      if (t.size !== e.size)
        return !1;
      for (const s of t.keys())
        if (!e.has(s) || !N(t.get(s), e.get(s)))
          return !1;
      break;
    }
    case Object:
      if (Te(t) !== Te(e))
        return !1;
      for (const s in t)
        if (!ps(t, s) || !N(t[s], e[s]))
          return !1;
      break;
    case Array:
      if (t.length !== e.length)
        return !1;
      for (let s = 0; s < t.length; s++)
        if (!N(t[s], e[s]))
          return !1;
      break;
    default:
      return !1;
  }
  return !0;
}, gs = (t, e) => e.includes(t), L = typeof process < "u" && process.release && /node|io\.js/.test(process.release.name) && Object.prototype.toString.call(typeof process < "u" ? process : 0) === "[object process]", Xe = typeof window < "u" && typeof document < "u" && !L;
let b;
const ys = () => {
  if (b === void 0)
    if (L) {
      b = x();
      const t = process.argv;
      let e = null;
      for (let s = 0; s < t.length; s++) {
        const n = t[s];
        n[0] === "-" ? (e !== null && b.set(e, ""), e = n) : e !== null && (b.set(e, n), e = null);
      }
      e !== null && b.set(e, "");
    } else typeof location == "object" ? (b = x(), (location.search || "?").slice(1).split("&").forEach((t) => {
      if (t.length !== 0) {
        const [e, s] = t.split("=");
        b.set(`--${Ae(e, "-")}`, s), b.set(`-${Ae(e, "-")}`, s);
      }
    })) : b = x();
  return b;
}, de = (t) => ys().has(t), K = (t) => Me(L ? process.env[t.toUpperCase().replaceAll("-", "_")] : Ke.getItem(t)), Ze = (t) => de("--" + t) || K(t) !== null;
Ze("production");
const ws = L && gs(process.env.FORCE_COLOR, ["true", "1", "2"]), bs = ws || !de("--no-colors") && // @todo deprecate --no-colors
!Ze("no-color") && (!L || process.stdout.isTTY) && (!L || de("--color") || K("COLORTERM") !== null || (K("TERM") || "").includes("color"));
class vs {
  /**
   * @param {L} left
   * @param {R} right
   */
  constructor(e, s) {
    this.left = e, this.right = s;
  }
}
const v = (t, e) => new vs(t, e);
typeof DOMParser < "u" && new DOMParser();
const Ss = (t) => ls(t, (e, s) => `${s}:${e};`).join(""), Cs = JSON.stringify, C = Date.now, I = Symbol, E = I(), X = I(), Qe = I(), ue = I(), et = I(), Is = I(), tt = I(), st = I(), Z = I(), Es = (t) => {
  t.length === 1 && t[0]?.constructor === Function && (t = /** @type {Array<string|Symbol|Object|number>} */
  /** @type {[function]} */
  t[0]());
  const e = [], s = [];
  let n = 0;
  for (; n < t.length; n++) {
    const i = t[n];
    if (i === void 0)
      break;
    if (i.constructor === String || i.constructor === Number)
      e.push(i);
    else if (i.constructor === Object)
      break;
  }
  for (n > 0 && s.push(e.join("")); n < t.length; n++) {
    const i = t[n];
    i instanceof Symbol || s.push(i);
  }
  return s;
}, Pe = [et, tt, st, Qe];
let ne = 0, Re = C();
const Us = (t, e) => {
  const s = Pe[ne], n = K("log"), i = n !== null && (n === "*" || n === "true" || new RegExp(n, "gi").test(e));
  return ne = (ne + 1) % Pe.length, e += ": ", i ? (...r) => {
    r.length === 1 && r[0]?.constructor === Function && (r = r[0]());
    const o = C(), a = o - Re;
    Re = o, t(
      s,
      e,
      Z,
      ...r.map((c) => {
        switch (c != null && c.constructor === Uint8Array && (c = Array.from(c)), typeof c) {
          case "string":
          case "symbol":
            return c;
          default:
            return Cs(c);
        }
      }),
      s,
      " +" + a + "ms"
    );
  } : ms;
}, As = {
  [E]: v("font-weight", "bold"),
  [X]: v("font-weight", "normal"),
  [Qe]: v("color", "blue"),
  [et]: v("color", "green"),
  [ue]: v("color", "grey"),
  [Is]: v("color", "red"),
  [tt]: v("color", "purple"),
  [st]: v("color", "orange"),
  // not well supported in chrome when debugging node with inspector - TODO: deprecate
  [Z]: v("color", "black")
}, _s = (t) => {
  t.length === 1 && t[0]?.constructor === Function && (t = /** @type {Array<string|Symbol|Object|number>} */
  /** @type {[function]} */
  t[0]());
  const e = [], s = [], n = x();
  let i = [], r = 0;
  for (; r < t.length; r++) {
    const o = t[r], a = As[o];
    if (a !== void 0)
      n.set(a.left, a.right);
    else {
      if (o === void 0)
        break;
      if (o.constructor === String || o.constructor === Number) {
        const c = Ss(n);
        r > 0 || c.length > 0 ? (e.push("%c" + o), s.push(c)) : e.push(o);
      } else
        break;
    }
  }
  for (r > 0 && (i = s, i.unshift(e.join(""))); r < t.length; r++) {
    const o = t[r];
    o instanceof Symbol || i.push(o);
  }
  return i;
}, xs = bs ? _s : Es, Ms = (...t) => {
  console.log(...xs(t)), Ts.forEach((e) => e.print(t));
}, Ts = ge(), B = (t) => Us(Ms, t);
class ks {
  /** active WebRTC room (null until constructor completes) */
  room = null;
  doc;
  roomId;
  matrixClient;
  opts;
  /* hooks that subclasses may override ------------------------------------ */
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  onCustomMessage = (e, s) => {
    console.warn("[MatrixWebrtcProvider] onCustomMessage not implemented");
  };
  // eslint‑disable-next-line @typescript-eslint/no-unused-vars
  onPeerConnected = (e) => {
    console.warn("[MatrixWebrtcProvider] onPeerConnected not implemented");
  };
  /* ----------------------------------------------------------------------- */
  constructor(e, s, n, i = {}) {
    this.doc = e, this.matrixClient = s, this.roomId = n, this.opts = {
      maxConns: 20 + Math.floor(Math.random() * 15),
      peerOpts: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      },
      ...i
    }, this.room = new Ps(this, s, n, this.opts);
  }
  destroy() {
    this.room && (this.room.disconnect(), this.room = null);
  }
}
class Ps {
  constructor(e, s, n, i) {
    this.provider = e, this.matrixClient = s, this.roomId = n, this.opts = i, this.myPeerId = `${s.getUserId()}-${Date.now()}`, console.log("[MatrixWebrtcRoom] Initializing with peerId:", this.myPeerId), this.connect();
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
  handleMatrixEvent(e, s) {
    if (s.roomId !== this.roomId) return;
    const n = e.getSender(), i = e.getContent(), r = e.getType();
    if (!(n === this.matrixClient.getUserId() && i.peerId === this.myPeerId))
      switch (r) {
        case "com.yjs.webrtc.announce":
          this.webrtcConns.size < (this.opts.maxConns ?? 20) && this.handlePeerAnnounce(i.peerId, n);
          break;
        case "com.yjs.webrtc.signal":
          i.targetPeer === this.myPeerId && this.handleWebrtcSignal(i);
          break;
      }
  }
  /* ---------------------------------------------------- peer handling */
  async handlePeerAnnounce(e, s) {
    if (this.webrtcConns.has(e)) return;
    const n = this.matrixClient.getUserId() < s, i = new De(
      this,
      e,
      s,
      n,
      this.matrixClient,
      this.roomId,
      this.myPeerId,
      this.opts.peerOpts
    );
    this.webrtcConns.set(e, i), this.setupConnectionHandlers(i), n && await i.initiate();
  }
  handleWebrtcSignal(e) {
    const s = this.webrtcConns.get(e.fromPeer);
    if (s)
      s.handleSignal(e.signal);
    else if (e.signal.type === "offer") {
      const n = new De(
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
      this.provider.onPeerConnected((s) => e.send(s));
    }, e.onmessage = (s) => {
      this.provider.onCustomMessage(s, (n) => e.send(n));
    }, e.onclose = () => {
      this.webrtcConns.delete(e.peerId);
    };
  }
  broadcastRoomMessage(e) {
    this.webrtcConns.forEach((s) => {
      s.connected && s.send(e);
    });
  }
  /* ----------------------------------------------------- debug */
  get peers() {
    return this.webrtcConns;
  }
}
class De {
  constructor(e, s, n, i, r, o, a, c) {
    this.room = e, this.peerId = s, this.userId = n, this.isInitiator = i, this.matrixClient = r, this.roomId = o, this.myPeerId = a, this.pc = new RTCPeerConnection(c), this.setupPeerConnection();
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
    }, e.onmessage = (s) => this.onmessage?.(new Uint8Array(s.data)), e.onclose = () => {
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
        const s = await this.pc.createAnswer();
        await this.pc.setLocalDescription(s), this.sendSignal({ type: "answer", answer: s });
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
      const s = e.buffer instanceof ArrayBuffer ? e : new Uint8Array(new ArrayBuffer(e.byteLength));
      s !== e && s.set(e), this.channel.send(s);
    }
  }
  close() {
    this.pc.close(), this.channel?.close(), this.connected = !1, this.onclose?.();
  }
}
function fe(t) {
  const e = t instanceof ArrayBuffer ? new Uint8Array(t) : t;
  return Buffer.from(e).toString("base64");
}
function nt(t) {
  const e = Buffer.from(t, "base64");
  return new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
}
const Rs = B("signed-webrtc"), Le = 0, ie = 1;
class Ds extends ks {
  constructor(e, s, n, i, r, o, a) {
    super(e, s, n, a), this.sign = i, this.verify = r, this.awareness = o, e.on("update", this._docUpdateHandler), e.on("destroy", this.destroy.bind(this)), this.awareness && this.awareness.on("update", this._awarenessUpdateHandler), typeof window < "u" && window.addEventListener("beforeunload", () => {
      this.awareness && this.awareness.setLocalState(null), this.destroy();
    });
  }
  awareness;
  onCustomMessage = (e, s) => {
    const n = T(e), i = u();
    switch (y(n)) {
      case Le:
        const o = Y(n);
        this.verify(o).then(
          () => {
            const a = nt(o.message), c = T(a);
            if (Je(
              c,
              i,
              this.doc,
              this
            ) !== ve)
              throw Rs("error: expect only updates"), new Error("error: only update messages expected");
          },
          (a) => {
            console.error("couldn't verify message", a);
          }
        );
        break;
      case ie:
        if (this.awareness) {
          const a = S(n);
          this.awareness.applyAwarenessUpdateFromBytes(a);
        }
        break;
    }
  };
  onPeerConnected = (e) => {
    if (console.log("WebRTC peer connected for real-time document sync"), this.awareness && this.awareness.getLocalState()) {
      const n = u();
      l(n, ie), m(n, this.awareness.encodeAwarenessUpdate()), e(f(n));
    }
  };
  _docUpdateHandler = async (e, s) => {
    if (!this.room || s === this)
      return;
    const n = u();
    l(n, Le);
    const i = u();
    qe(i, e);
    const r = {
      message: fe(f(i))
    };
    await this.sign(r), q(n, r), this.room.broadcastRoomMessage(f(n));
  };
  // Add awareness update handler
  _awarenessUpdateHandler = ({ added: e, updated: s, removed: n }, i) => {
    const r = this.room;
    if (!r || !this.awareness) {
      console.log("[SignedWebrtcProvider] No room or awareness available");
      return;
    }
    e.concat(s).concat(n), console.log("[SignedWebrtcProvider] Awareness change:", { added: e, updated: s, removed: n });
    const o = u();
    l(o, ie), m(o, this.awareness.encodeAwarenessUpdate());
    const a = f(o);
    console.log("[SignedWebrtcProvider] Broadcasting awareness update, size:", a.length), r.broadcastRoomMessage(a);
  };
  destroy() {
    this.awareness && this.awareness.off("update", this._awarenessUpdateHandler), this.doc.off("update", this._docUpdateHandler), this.doc.off("destroy", this.destroy), super.destroy();
  }
}
class Ls {
  // Enable debug logging
  constructor(e) {
    this.doc = e, this.clientId = this.generateClientId(), this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 3e4), this.debug && console.log("[BlockNoteAwareness] Initialized with clientId:", this.clientId);
  }
  states = /* @__PURE__ */ new Map();
  localState = null;
  clientId;
  listeners = {};
  cleanupInterval;
  debug = !0;
  generateClientId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  get clientID() {
    return this.clientId;
  }
  /**
   * Set local user's awareness state
   */
  setLocalState(e) {
    this.debug && console.log("[BlockNoteAwareness] setLocalState called:", e), e === null ? (this.localState = null, this.states.delete(this.clientId)) : (this.localState = {
      ...this.localState,
      ...e,
      timestamp: Date.now()
    }, this.states.set(this.clientId, this.localState));
    const s = {
      added: [],
      updated: [this.clientId],
      removed: e === null ? [this.clientId] : []
    };
    this.emit("change", s), this.emit("update", s);
  }
  /**
   * Update a single field in local state
   */
  setLocalStateField(e, s) {
    this.debug && console.log("[BlockNoteAwareness] setLocalStateField:", e, s), this.localState || (this.localState = { timestamp: Date.now() }), this.localState[e] = s, this.localState.timestamp = Date.now(), this.states.set(this.clientId, this.localState);
    const n = {
      added: [],
      updated: [this.clientId],
      removed: []
    };
    this.emit("change", n), this.emit("update", n);
  }
  /**
   * Get all awareness states (local + remote)
   */
  getStates() {
    return new Map(this.states);
  }
  /**
   * Get local awareness state
   */
  getLocalState() {
    return this.localState;
  }
  /**
   * Apply remote awareness update
   */
  applyAwarenessUpdate(e) {
    const { clientId: s, state: n } = e;
    if (this.debug && console.log("[BlockNoteAwareness] applyAwarenessUpdate:", e), s === this.clientId)
      return;
    const i = this.states.has(s);
    n === null ? (this.states.delete(s), i && this.emit("change", {
      added: [],
      updated: [],
      removed: [s]
    })) : (this.states.set(s, n), this.emit("change", {
      added: i ? [] : [s],
      updated: i ? [s] : [],
      removed: []
    }));
  }
  /**
   * Encode local awareness state for WebRTC transmission
   */
  encodeAwarenessUpdate() {
    if (!this.localState)
      return new Uint8Array(0);
    const e = {
      clientId: this.clientId,
      state: this.localState
    }, s = JSON.stringify(e);
    return this.debug && console.log("[BlockNoteAwareness] Encoding update:", e), new TextEncoder().encode(s);
  }
  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(e) {
    try {
      const s = new TextDecoder().decode(e), n = JSON.parse(s);
      this.debug && console.log("[BlockNoteAwareness] Received update bytes:", n), this.applyAwarenessUpdate(n);
    } catch (s) {
      console.error("[BlockNoteAwareness] Failed to decode awareness update:", s);
    }
  }
  /**
   * Remove stale awareness states (older than 30 seconds)
   */
  cleanupStaleStates() {
    const e = Date.now(), s = 30 * 1e3, n = [];
    this.states.forEach((i, r) => {
      r !== this.clientId && e - i.timestamp > s && n.push(r);
    }), n.length > 0 && (this.debug && console.log("[BlockNoteAwareness] Cleaning up stale states:", n), n.forEach((i) => this.states.delete(i)), this.emit("change", {
      added: [],
      updated: [],
      removed: n
    }));
  }
  /**
   * Event listener
   */
  on(e, s) {
    this.listeners[e] || (this.listeners[e] = []), this.listeners[e].push(s), this.debug && console.log("[BlockNoteAwareness] Listener added for event:", e);
  }
  /**
   * Remove event listener
   */
  off(e, s) {
    if (this.listeners[e]) {
      const n = this.listeners[e].indexOf(s);
      n > -1 && this.listeners[e].splice(n, 1);
    }
  }
  emit(e, s) {
    this.debug && console.log("[BlockNoteAwareness] Emitting event:", e, s), this.listeners[e] && this.listeners[e].forEach((n) => {
      try {
        n(s);
      } catch (i) {
        console.error("[BlockNoteAwareness] Error in event listener:", i);
      }
    });
  }
  destroy() {
    this.cleanupInterval && clearInterval(this.cleanupInterval), this.states.clear(), this.listeners = {}, this.localState = null, this.debug && console.log("[BlockNoteAwareness] Destroyed");
  }
}
const Bs = {
  // throttle flushing write events to matrix by 500ms
  flushInterval: process.env.NODE_ENV === "test" ? 100 : 500,
  // if writing to the room fails, wait 30 seconds before retrying
  retryIfForbiddenInterval: 1e3 * 30
};
class Os extends te.Disposable {
  constructor(e, s, n = {}) {
    super(), this.matrixClient = e, this.translator = s, this.opts = { ...Bs, ...n }, this.throttledFlushUpdatesToMatrix = mt.throttle(
      this.flushUpdatesToMatrix,
      this.canWrite ? this.opts.flushInterval : this.opts.retryIfForbiddenInterval
    );
  }
  pendingUpdates = [];
  isSendingUpdates = !1;
  _canWrite = !0;
  retryTimeoutHandler;
  roomId;
  _onCanWriteChanged = this._register(
    new A.Emitter()
  );
  onCanWriteChanged = this._onCanWriteChanged.event;
  _onSentAllEvents = this._register(
    new A.Emitter()
  );
  onSentAllEvents = this._onSentAllEvents.event;
  throttledFlushUpdatesToMatrix;
  opts;
  setCanWrite(e) {
    this._canWrite !== e && (this._canWrite = e, this._onCanWriteChanged.fire());
  }
  flushUpdatesToMatrix = async () => {
    if (this.isSendingUpdates || !this.pendingUpdates.length || !this.roomId)
      return;
    this.isSendingUpdates = !0;
    const e = p.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];
    let s = !1;
    try {
      console.log("Sending updates"), await this.translator.sendUpdate(this.matrixClient, this.roomId, e), this.setCanWrite(!0), console.log("sent updates");
    } catch (n) {
      if (n.errcode === "M_FORBIDDEN") {
        console.warn("not allowed to edit document", n), this.setCanWrite(!1);
        try {
          await this.matrixClient.joinRoom(this.roomId), console.log("joined room", this.roomId), s = !0;
        } catch (i) {
          console.warn("failed to join room", i);
        }
      } else
        console.error("error sending updates", n);
      this.pendingUpdates.unshift(e);
    } finally {
      this.isSendingUpdates = !1;
    }
    this.pendingUpdates.length ? this.retryTimeoutHandler = setTimeout(
      () => {
        this.throttledFlushUpdatesToMatrix();
      },
      s ? 0 : this.canWrite ? this.opts.flushInterval : this.opts.retryIfForbiddenInterval
    ) : (console.log("_onSentAllEvents"), this._onSentAllEvents.fire());
  };
  async initialize(e) {
    this.roomId = e, this.throttledFlushUpdatesToMatrix();
  }
  get canWrite() {
    return this._canWrite;
  }
  writeUpdate(e) {
    this.pendingUpdates.push(e), this.throttledFlushUpdatesToMatrix();
  }
  // Helper method that's mainly used in unit tests
  async waitForFlush() {
    !this.pendingUpdates.length && !this.isSendingUpdates || await A.Event.toPromise(this.onSentAllEvents);
  }
  dispose() {
    super.dispose(), clearTimeout(this.retryTimeoutHandler), this.throttledFlushUpdatesToMatrix.cancel();
  }
}
function Fs(t, e) {
  return Ns(new DataView(t), new DataView(e));
}
function Ns(t, e) {
  if (t.byteLength !== e.byteLength) return !1;
  for (let s = 0; s < t.byteLength; s++)
    if (t.getUint8(s) !== e.getUint8(s)) return !1;
  return !0;
}
const O = "m.room.message", Ws = {
  // set to true to send everything encapsulated in a m.room.message,
  // so you can debug rooms easily in element or other matrix clients
  updatesAsRegularMessages: !1,
  updateEventType: "matrix-crdt.doc_update",
  snapshotEventType: "matrix-crdt.doc_snapshot"
};
class zs {
  opts;
  constructor(e = {}) {
    this.opts = { ...Ws, ...e };
  }
  async sendUpdate(e, s, n) {
    const i = fe(n), r = {
      update: i
    };
    if (this.opts.updatesAsRegularMessages) {
      const o = {
        body: this.opts.updateEventType + ": " + i,
        msgtype: this.opts.updateEventType,
        ...r
      };
      "scheduler" in e && (e.scheduler = void 0), await e.sendEvent(s, O, o, "");
    } else
      await e.sendEvent(s, this.opts.updateEventType, r, "");
  }
  async sendSnapshot(e, s, n, i) {
    const r = fe(n), o = {
      update: r,
      last_event_id: i
    };
    if (this.opts.updatesAsRegularMessages) {
      const a = {
        body: this.opts.snapshotEventType + ": " + r,
        msgtype: this.opts.snapshotEventType,
        ...o
      };
      "scheduler" in e && (e.scheduler = void 0), await e.sendEvent(s, O, a, "");
    } else
      await e.sendEvent(s, this.opts.snapshotEventType, o, "");
  }
  isUpdateEvent(e) {
    return this.opts.updatesAsRegularMessages ? e.type === O && e.content.msgtype === this.opts.updateEventType : e.type === this.opts.updateEventType;
  }
  isSnapshotEvent(e) {
    return this.opts.updatesAsRegularMessages ? e.type === O && e.content.msgtype === this.opts.snapshotEventType : e.type === this.opts.snapshotEventType;
  }
  get WrappedEventType() {
    return this.opts.updatesAsRegularMessages ? O : this.opts.updateEventType;
  }
}
const js = {
  enableExperimentalWebrtcSync: !1,
  enableAwareness: !1,
  reader: {},
  writer: {},
  translator: {}
};
class xn extends te.Disposable {
  /**
   * Creates an instance of MatrixProvider.
   * @param {Y.Doc} doc The `Y.Doc` to sync over the Matrix Room
   * @param {MatrixClient} matrixClient A `matrix-js-sdk` client with
   * permissions to read (and/or write) from the room
   * @param {{
   *           type: "id";
   *           id: string;
   *         }
   *       | { type: "alias"; alias: string }}
   *          A room alias (e.g.: #room_alias:domain) or
   *          room id (e.g.: !qporfwt:matrix.org)
   *          to sync the document with.
   * @param {MatrixProviderOptions} [opts={}] Additional configuration, all optional. See {@link MatrixProviderOptions}
   * @memberof MatrixProvider
   */
  constructor(e, s, n, i = {}) {
    super(), this.doc = e, this.matrixClient = s, this.room = n, this.opts = { ...js, ...i }, this.translator = new zs(this.opts.translator), this.throttledWriter = new Os(
      this.matrixClient,
      this.translator,
      this.opts.writer
    ), this.opts.enableAwareness && (this.awareness = new Ls(e)), e.on("update", this.documentUpdateListener);
  }
  disposed = !1;
  _roomId;
  initializeTimeoutHandler;
  initializedResolve;
  // TODO: rewrite to remove initializedPromise and use async / await instead
  initializedPromise = new Promise((e) => {
    this.initializedResolve = e;
  });
  webrtcProvider;
  reader;
  throttledWriter;
  translator;
  awareness;
  _onDocumentAvailable = this._register(
    new A.Emitter()
  );
  _onDocumentUnavailable = this._register(
    new A.Emitter()
  );
  _onReceivedEvents = this._register(
    new A.Emitter()
  );
  opts;
  onDocumentAvailable = this._onDocumentAvailable.event;
  onReceivedEvents = this._onReceivedEvents.event;
  onDocumentUnavailable = this._onDocumentUnavailable.event;
  get onCanWriteChanged() {
    return this.throttledWriter.onCanWriteChanged;
  }
  get canWrite() {
    return this.throttledWriter.canWrite;
  }
  get roomId() {
    return this._roomId;
  }
  get matrixReader() {
    return this.reader;
  }
  get awarenessInstance() {
    return this.awareness;
  }
  totalEventsReceived = 0;
  /**
   * Listener for changes to the Yjs document.
   * Forwards changes to the Matrix Room if applicable
   */
  documentUpdateListener = async (e, s) => {
    s === this || this.webrtcProvider && s === this.webrtcProvider || s?.provider || this.throttledWriter.writeUpdate(e);
  };
  /**
   * Handles incoming events from MatrixReader
   */
  processIncomingEvents = (e, s = !1) => {
    e = e.filter((o) => !(!this.translator.isUpdateEvent(o) && !this.translator.isSnapshotEvent(o))), this.totalEventsReceived += e.length;
    const n = e.map(
      (o) => new Uint8Array(nt(o.content.update))
    ), i = p.mergeUpdates(n);
    if (!n.length)
      return i;
    if (p.applyUpdate(this.doc, i, this), s) {
      const o = e[e.length - 1], a = p.encodeStateAsUpdate(this.doc);
      this.translator.sendSnapshot(
        this.matrixClient,
        this._roomId,
        a,
        o.event_id
      ).catch((c) => {
        console.error("failed to send snapshot");
      });
    }
    return e.filter(
      (o) => o.user_id !== this.matrixClient.credentials.userId
    ).length && this._onReceivedEvents.fire(), i;
  };
  /**
   * Experimental; we can use WebRTC to sync updates instantly over WebRTC.
   *
   * The default Matrix-writer only flushes events every 500ms.
   * WebRTC can also sync awareness updates which is not available via Matrix yet.
   * See SignedWebrtcProvider.ts for more details + motivation
   *
   * TODO: we should probably extract this from MatrixProvider so that
   * API consumers can instantiate / configure this seperately
   */
  async initializeWebrtc() {
    if (!this._roomId)
      throw new Error("not initialized");
    if (!this.reader)
      throw new Error("needs reader to initialize webrtc");
    const e = this._register(
      new bt(this.matrixClient, this.reader)
    );
    await e.initialize();
    const s = dt.createClient({
      baseUrl: this.matrixClient.baseUrl || this.matrixClient.clientOpts?.baseUrl,
      accessToken: this.matrixClient.getAccessToken ? this.matrixClient.getAccessToken() : this.matrixClient.credentials?.accessToken,
      userId: this.matrixClient.getUserId() || void 0,
      timelineSupport: !0
      // we need Room.timeline events
    });
    let n;
    try {
      const i = {
        room: {
          timeline: {
            limit: 10,
            types: ["com.yjs.webrtc.*"]
          }
        },
        presence: { types: [] },
        account_data: { types: [] }
      };
      n = await s.createFilter(i);
    } catch {
    }
    s.startClient({
      filter: n,
      initialSyncLimit: 10
    }), await new Promise(
      (i) => s.once(
        "sync",
        (r) => r === "PREPARED" && i()
      )
    ), this._register({ dispose: () => s.stopClient() }), this.webrtcProvider = new Ds(
      this.doc,
      s,
      // <- use the tiny client for signalling
      this._roomId,
      async (i) => {
        await yt(this.matrixClient, i);
      },
      async (i) => {
        await wt(
          this.matrixClient,
          e,
          i,
          this.translator.WrappedEventType
        );
      },
      this.awareness
    );
  }
  async initializeNoCatch() {
    const e = this.room.type === "id" ? this.room.id : this.room.alias;
    try {
      if (this.room.type === "id")
        this._roomId = this.room.id;
      else if (this.room.type === "alias") {
        const h = await this.matrixClient.getRoomIdForAlias(this.room.alias);
        this._roomId = h.room_id;
      }
      if (!this._roomId)
        throw new Error("error receiving room id");
      console.log("room resolved", this._roomId), await this.throttledWriter.initialize(this._roomId);
    } catch (h) {
      let w = 5e3;
      h.errcode === "M_NOT_FOUND" ? (console.log("room not found", e), this._onDocumentUnavailable.fire()) : h.name === "ConnectionError" ? console.log("room not found (offline)", e) : (console.error("error retrieving room", e, h), w = 30 * 1e3, this._onDocumentUnavailable.fire()), this.initializeTimeoutHandler = setTimeout(() => {
        this.initialize();
      }, w);
      return;
    }
    let s = p.encodeStateAsUpdate(this.doc);
    const n = p.encodeStateVectorFromUpdate(s), i = p.diffUpdate(
      s,
      n
    );
    let r = p.snapshot(this.doc);
    const o = await this.initializeReader();
    this._onDocumentAvailable.fire();
    const a = p.encodeStateVectorFromUpdate(o), c = p.diffUpdate(s, a);
    if (Fs(i.buffer, c.buffer)) {
      let h = new p.Doc();
      p.applyUpdate(h, o);
      let w = p.snapshot(h);
      if (Vs(w, r)) {
        this.initializedResolve();
        return;
      }
    }
    c.length > 2 && this.throttledWriter.writeUpdate(c), this.initializedResolve();
  }
  /**
   * Get all initial events from the room + start polling
   */
  async initializeReader() {
    if (this.reader)
      throw new Error("already initialized reader");
    if (!this._roomId)
      throw new Error("no roomId");
    this.reader = this._register(
      new It(
        this.matrixClient,
        this._roomId,
        this.translator,
        this.opts.reader
      )
    ), this._register(
      this.reader.onEvents(
        (s) => this.processIncomingEvents(s.events, s.shouldSendSnapshot)
      )
    );
    const e = await this.reader.getInitialDocumentUpdateEvents();
    return this.reader.startPolling(), this.processIncomingEvents(e);
  }
  /**
   * For testing purposes; make sure pending events have been flushed to Matrix
   */
  async waitForFlush() {
    await this.initializedPromise, await this.throttledWriter.waitForFlush();
  }
  async initialize() {
    try {
      await this.initializeNoCatch(), await this.initializedPromise, !this.disposed && this.opts.enableExperimentalWebrtcSync && await this.initializeWebrtc();
    } catch (e) {
      throw console.error(e), e;
    }
  }
  dispose() {
    super.dispose(), this.disposed = !0, this.webrtcProvider?.destroy(), this.reader?.dispose(), this.awareness?.destroy(), clearTimeout(this.initializeTimeoutHandler), this.doc.off("update", this.documentUpdateListener);
  }
}
function Vs(t, e) {
  for (const [s, n] of e.ds.clients.entries()) {
    const i = t.ds.clients.get(s) || [];
    if (n.length > i.length)
      return !1;
    for (let r = 0; r < n.length; r++) {
      const o = n[r], a = i[r];
      if (o.clock !== a.clock || o.len !== a.len)
        return !1;
    }
  }
  return !0;
}
async function Mn(t, e, s) {
  try {
    const n = [];
    return n.push({
      type: "m.room.guest_access",
      state_key: "",
      content: {
        guest_access: "forbidden"
      }
    }), n.push({
      type: "m.room.join_rules",
      content: {
        join_rule: s === "public-read-write" ? "public" : "invite"
      }
    }), n.push({
      type: "m.room.history_visibility",
      content: {
        history_visibility: "world_readable"
      }
    }), { status: "ok", roomId: (await t.createRoom({
      room_alias_name: e,
      visibility: "public",
      // Whether this room is visible to the /publicRooms API or not." One of: ["private", "public"]
      name: e,
      topic: "",
      initial_state: n
    })).room_id };
  } catch (n) {
    return n.errcode === "M_ROOM_IN_USE" ? "already-exists" : n.name === "ConnectionError" ? "offline" : {
      status: "error",
      error: n
    };
  }
}
async function Tn(t, e) {
  let s;
  try {
    s = await t.getStateEvent(e, "m.room.join_rules");
  } catch (n) {
    return {
      status: "error",
      error: n
    };
  }
  if (s.join_rule === "public")
    return "public-read-write";
  if (s.join_rule === "invite")
    return "public-read";
  throw new Error("unsupported join_rule");
}
async function kn(t, e, s) {
  try {
    return await t.sendStateEvent(
      e,
      "m.room.join_rules",
      { join_rule: s === "public-read-write" ? "public" : "invite" },
      ""
    ), { status: "ok", roomId: e };
  } catch (n) {
    return n.name === "ConnectionError" ? "offline" : {
      status: "error",
      error: n
    };
  }
}
class Ce {
  constructor() {
    this._observers = x();
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  on(e, s) {
    j(this._observers, e, ge).add(s);
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  once(e, s) {
    const n = (...i) => {
      this.off(e, n), s(...i);
    };
    this.on(e, n);
  }
  /**
   * @param {N} name
   * @param {function} f
   */
  off(e, s) {
    const n = this._observers.get(e);
    n !== void 0 && (n.delete(s), n.size === 0 && this._observers.delete(e));
  }
  /**
   * Emit a named event. All registered event listeners that listen to the
   * specified name will receive the event.
   *
   * @todo This should catch exceptions
   *
   * @param {N} name The event name.
   * @param {Array<any>} args The arguments that are applied to the event listener.
   */
  emit(e, s) {
    return Mt((this._observers.get(e) || x()).values()).forEach((n) => n(...s));
  }
  destroy() {
    this._observers = x();
  }
}
const re = 3e4;
class $s extends Ce {
  /**
   * @param {Y.Doc} doc
   */
  constructor(e) {
    super(), this.doc = e, this.clientID = e.clientID, this.states = /* @__PURE__ */ new Map(), this.meta = /* @__PURE__ */ new Map(), this._checkInterval = /** @type {any} */
    setInterval(() => {
      const s = C();
      this.getLocalState() !== null && re / 2 <= s - /** @type {{lastUpdated:number}} */
      this.meta.get(this.clientID).lastUpdated && this.setLocalState(this.getLocalState());
      const n = [];
      this.meta.forEach((i, r) => {
        r !== this.clientID && re <= s - i.lastUpdated && this.states.has(r) && n.push(r);
      }), n.length > 0 && it(this, n, "timeout");
    }, R(re / 10)), e.on("destroy", () => {
      this.destroy();
    }), this.setLocalState({});
  }
  destroy() {
    this.emit("destroy", [this]), this.setLocalState(null), super.destroy(), clearInterval(this._checkInterval);
  }
  /**
   * @return {Object<string,any>|null}
   */
  getLocalState() {
    return this.states.get(this.clientID) || null;
  }
  /**
   * @param {Object<string,any>|null} state
   */
  setLocalState(e) {
    const s = this.clientID, n = this.meta.get(s), i = n === void 0 ? 0 : n.clock + 1, r = this.states.get(s);
    e === null ? this.states.delete(s) : this.states.set(s, e), this.meta.set(s, {
      clock: i,
      lastUpdated: C()
    });
    const o = [], a = [], c = [], h = [];
    e === null ? h.push(s) : r == null ? e != null && o.push(s) : (a.push(s), N(r, e) || c.push(s)), (o.length > 0 || c.length > 0 || h.length > 0) && this.emit("change", [{ added: o, updated: c, removed: h }, "local"]), this.emit("update", [{ added: o, updated: a, removed: h }, "local"]);
  }
  /**
   * @param {string} field
   * @param {any} value
   */
  setLocalStateField(e, s) {
    const n = this.getLocalState();
    n !== null && this.setLocalState({
      ...n,
      [e]: s
    });
  }
  /**
   * @return {Map<number,Object<string,any>>}
   */
  getStates() {
    return this.states;
  }
}
const it = (t, e, s) => {
  const n = [];
  for (let i = 0; i < e.length; i++) {
    const r = e[i];
    if (t.states.has(r)) {
      if (t.states.delete(r), r === t.clientID) {
        const o = (
          /** @type {MetaClientState} */
          t.meta.get(r)
        );
        t.meta.set(r, {
          clock: o.clock + 1,
          lastUpdated: C()
        });
      }
      n.push(r);
    }
  }
  n.length > 0 && (t.emit("change", [{ added: [], updated: [], removed: n }, s]), t.emit("update", [{ added: [], updated: [], removed: n }, s]));
}, Be = (t, e, s = t.states) => {
  const n = e.length, i = u();
  l(i, n);
  for (let r = 0; r < n; r++) {
    const o = e[r], a = s.get(o) || null, c = (
      /** @type {MetaClientState} */
      t.meta.get(o).clock
    );
    l(i, o), l(i, c), D(i, JSON.stringify(a));
  }
  return f(i);
}, Hs = (t, e, s) => {
  const n = T(e), i = C(), r = [], o = [], a = [], c = [], h = y(n);
  for (let w = 0; w < h; w++) {
    const g = y(n);
    let V = y(n);
    const U = JSON.parse(z(n)), $ = t.meta.get(g), ht = t.states.get(g), Ee = $ === void 0 ? 0 : $.clock;
    (Ee < V || Ee === V && U === null && t.states.has(g)) && (U === null ? g === t.clientID && t.getLocalState() != null ? V++ : t.states.delete(g) : t.states.set(g, U), t.meta.set(g, {
      clock: V,
      lastUpdated: i
    }), $ === void 0 && U !== null ? r.push(g) : $ !== void 0 && U === null ? c.push(g) : U !== null && (N(U, ht) || a.push(g), o.push(g)));
  }
  (r.length > 0 || a.length > 0 || c.length > 0) && t.emit("change", [{
    added: r,
    updated: a,
    removed: c
  }, s]), (r.length > 0 || o.length > 0 || c.length > 0) && t.emit("update", [{
    added: r,
    updated: o,
    removed: c
  }, s]);
}, Q = /* @__PURE__ */ new Map(), M = /* @__PURE__ */ new Map();
function pe(t) {
  Q.forEach((e) => {
    e.connected && (e.send({ type: "subscribe", topics: [t.name] }), t.webrtcConns.size < t.provider.maxConns && e.publishSignalingMessage(t, {
      type: "announce",
      from: t.peerId
    }));
  });
}
const Gs = crypto.getRandomValues.bind(crypto), qs = Math.random, Js = () => Gs(new Uint32Array(1))[0], Ys = "10000000-1000-4000-8000" + -1e11, Ks = () => Ys.replace(
  /[018]/g,
  /** @param {number} c */
  (t) => (t ^ Js() & 15 >> t / 4).toString(16)
);
Promise.all.bind(Promise);
const Xs = (t) => Promise.reject(t), Zs = (t, e) => {
  const s = le(t).buffer, n = le(e).buffer, i = s instanceof ArrayBuffer ? s : new ArrayBuffer(s.byteLength), r = n instanceof ArrayBuffer ? n : new ArrayBuffer(n.byteLength);
  return s !== i && new Uint8Array(i).set(new Uint8Array(s)), n !== r && new Uint8Array(r).set(new Uint8Array(n)), crypto.subtle.importKey("raw", i, "PBKDF2", !1, ["deriveKey"]).then(
    (o) => crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: r,
        iterations: 1e5,
        hash: "SHA-256"
      },
      o,
      {
        name: "AES-GCM",
        length: 256
      },
      !0,
      ["encrypt", "decrypt"]
    )
  );
}, rt = async (t, e) => {
  if (!e)
    return t;
  const s = crypto.getRandomValues(new Uint8Array(12)), n = t.buffer instanceof ArrayBuffer ? t : new Uint8Array(new ArrayBuffer(t.byteLength));
  return n !== t && n.set(t), crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: s
    },
    e,
    n
  ).then((i) => {
    const r = u();
    return D(r, "AES-GCM"), m(r, s), m(r, new Uint8Array(i)), f(r);
  });
}, Qs = (t, e) => {
  const s = u();
  return q(s, t), rt(f(s), e);
}, ot = async (t, e) => {
  if (!e)
    return t;
  const s = T(t);
  z(s) !== "AES-GCM" && Xs(se("Unknown encryption algorithm"));
  const i = S(s), r = S(s), o = i.buffer instanceof ArrayBuffer ? i : new Uint8Array(new ArrayBuffer(i.byteLength)), a = r.buffer instanceof ArrayBuffer ? r : new Uint8Array(new ArrayBuffer(r.byteLength));
  return o !== i && o.set(i), a !== r && a.set(r), crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: o
    },
    e,
    a
  ).then((c) => new Uint8Array(c));
}, en = (t, e) => ot(t, e).then(
  (s) => Y(T(new Uint8Array(s)))
), tn = (t) => new Uint8Array(t), sn = (t, e, s) => new Uint8Array(t, e, s), nn = (t) => new Uint8Array(t), rn = (t) => {
  let e = "";
  for (let s = 0; s < t.byteLength; s++)
    e += kt(t[s]);
  return btoa(e);
}, on = (t) => Buffer.from(t.buffer, t.byteOffset, t.byteLength).toString("base64"), an = (t) => {
  const e = atob(t), s = tn(e.length);
  for (let n = 0; n < e.length; n++)
    s[n] = e.charCodeAt(n);
  return s;
}, cn = (t) => {
  const e = Buffer.from(t, "base64");
  return sn(e.buffer, e.byteOffset, e.byteLength);
}, at = Xe ? rn : on, ct = Xe ? an : cn, lt = /* @__PURE__ */ new Map();
class ln {
  /**
   * @param {string} room
   */
  constructor(e) {
    this.room = e, this.onmessage = null, this._onChange = (s) => s.key === e && this.onmessage !== null && this.onmessage({ data: ct(s.newValue || "") }), ds(this._onChange);
  }
  /**
   * @param {ArrayBuffer} buf
   */
  postMessage(e) {
    Ke.setItem(this.room, at(nn(e)));
  }
  close() {
    us(this._onChange);
  }
}
const hn = typeof BroadcastChannel > "u" ? ln : BroadcastChannel, Ie = (t) => j(lt, t, () => {
  const e = ge(), s = new hn(t);
  return s.onmessage = (n) => e.forEach((i) => i(n.data, "broadcastchannel")), {
    bc: s,
    subs: e
  };
}), dn = (t, e) => (Ie(t).subs.add(e), e), un = (t, e) => {
  const s = Ie(t), n = s.subs.delete(e);
  return n && s.subs.size === 0 && (s.bc.close(), lt.delete(t)), n;
}, fn = (t, e, s = null) => {
  const n = Ie(t);
  n.bc.postMessage(e), n.subs.forEach((i) => i(e, s));
}, pn = () => {
  let t = !0;
  return (e, s) => {
    if (t) {
      t = !1;
      try {
        e();
      } finally {
        t = !0;
      }
    } else s !== void 0 && s();
  };
}, oe = 4, G = 5, mn = B("y-webrtc");
class gn {
  // public readonly awareness: awarenessProtocol.Awareness;
  constructor(e, s, n, i, r) {
    this.provider = e, this.onCustomMessage = s, this.onPeerConnected = n, this.name = i, this.key = r;
  }
  /**
   * Do not assume that peerId is unique. This is only meant for sending signaling messages.
   */
  peerId = Ks();
  synced = !1;
  webrtcConns = /* @__PURE__ */ new Map();
  bcConns = /* @__PURE__ */ new Set();
  mux = pn();
  bcconnected = !1;
  _bcSubscriber = (e) => ot(new Uint8Array(e), this.key).then(
    (s) => this.mux(() => {
      this.readMessage(s, (n) => {
        this.broadcastBcMessage(f(n));
      });
    })
  );
  // public checkIsSynced() {
  //   let synced = true;
  //   this.webrtcConns.forEach((peer) => {
  //     if (!peer.synced) {
  //       synced = false;
  //     }
  //   });
  //   if ((!synced && this.synced) || (synced && !this.synced)) {
  //     this.synced = synced;
  //     this.provider.emit("synced", [{ synced }]);
  //     log(
  //       "synced ",
  //       logging.BOLD,
  //       this.name,
  //       logging.UNBOLD,
  //       " with all peers"
  //     );
  //   }
  // }
  readMessage = (e, s) => {
    const n = T(e), i = u(), r = y(n), o = (a) => {
      l(i, G), m(i, a), s(i);
    };
    switch (r) {
      case G:
        this.onCustomMessage(
          S(n),
          o
        );
        break;
      // case messageSync: {
      //   encoding.writeVarUint(encoder, messageSync);
      //   const syncMessageType = syncProtocol.readSyncMessage(
      //     decoder,
      //     encoder,
      //     this.doc,
      //     this
      //   );
      //   if (
      //     syncMessageType === syncProtocol.messageYjsSyncStep2 &&
      //     !this.synced
      //   ) {
      //     syncedCallback();
      //   }
      //   if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
      //     sendReply = true;
      //   }
      //   break;
      // }
      // case messageQueryAwareness:
      //   encoding.writeVarUint(encoder, messageAwareness);
      //   encoding.writeVarUint8Array(
      //     encoder,
      //     awarenessProtocol.encodeAwarenessUpdate(
      //       this.awareness,
      //       Array.from(this.awareness.getStates().keys())
      //     )
      //   );
      //   sendReply = true;
      //   break;
      // case messageAwareness:
      //   awarenessProtocol.applyAwarenessUpdate(
      //     this.awareness,
      //     decoding.readVarUint8Array(decoder),
      //     this
      //   );
      //   break;
      case oe: {
        const a = J(n) === 1, c = z(n);
        if (c !== this.peerId && (this.bcConns.has(c) && !a || !this.bcConns.has(c) && a)) {
          const h = [], w = [];
          a ? (this.bcConns.add(c), w.push(c), this.onPeerConnected(o)) : (this.bcConns.delete(c), h.push(c)), this.provider.emit("peers", [
            {
              added: w,
              removed: h,
              webrtcPeers: Array.from(this.webrtcConns.keys()),
              bcPeers: Array.from(this.bcConns)
            }
          ]), this.broadcastBcPeerId();
        }
        break;
      }
      default:
        console.error("Unable to compute message");
        return;
    }
  };
  broadcastBcPeerId() {
    if (this.provider.filterBcConns) {
      const e = u();
      l(e, oe), _e(e, 1), D(e, this.peerId), this.broadcastBcMessage(f(e));
    }
  }
  broadcastWebrtcConn(e) {
    mn("broadcast message in ", E, this.name, X), this.webrtcConns.forEach((s) => {
      try {
        s.peer.send(e);
      } catch {
      }
    });
  }
  broadcastRoomMessage(e) {
    const s = u();
    l(s, G), m(s, e);
    const n = f(s);
    this.bcconnected && this.broadcastBcMessage(n), this.broadcastWebrtcConn(n);
  }
  broadcastBcMessage(e) {
    return rt(e, this.key).then((s) => this.mux(() => fn(this.name, s)));
  }
  connect() {
    pe(this);
    const e = this.name;
    dn(e, this._bcSubscriber), this.bcconnected = !0, this.broadcastBcPeerId();
  }
  disconnect() {
    Q.forEach((s) => {
      s.connected && s.send({ type: "unsubscribe", topics: [this.name] });
    });
    const e = u();
    l(e, oe), _e(e, 0), D(e, this.peerId), this.broadcastBcMessage(f(e)), un(this.name, this._bcSubscriber), this.bcconnected = !1, this.webrtcConns.forEach((s) => s.destroy());
  }
  destroy() {
    this.disconnect();
  }
}
const yn = 1200, wn = 2500, ee = 3e4, me = (t) => {
  if (t.shouldConnect && t.ws === null) {
    const e = new WebSocket(t.url), s = t.binaryType;
    let n = null;
    s && (e.binaryType = s), t.ws = e, t.connecting = !0, t.connected = !1, e.onmessage = (o) => {
      t.lastMessageReceived = C();
      const a = o.data, c = typeof a == "string" ? JSON.parse(a) : a;
      c && c.type === "pong" && (clearTimeout(n), n = setTimeout(r, ee / 2)), t.emit("message", [c, t]);
    };
    const i = (o) => {
      t.ws !== null && (t.ws = null, t.connecting = !1, t.connected ? (t.connected = !1, t.emit("disconnect", [{ type: "disconnect", error: o }, t])) : t.unsuccessfulReconnects++, setTimeout(me, We(At(t.unsuccessfulReconnects + 1) * yn, wn), t)), clearTimeout(n);
    }, r = () => {
      t.ws === e && t.send({
        type: "ping"
      });
    };
    e.onclose = () => i(null), e.onerror = (o) => i(o), e.onopen = () => {
      t.lastMessageReceived = C(), t.connecting = !1, t.connected = !0, t.unsuccessfulReconnects = 0, t.emit("connect", [{ type: "connect" }, t]), n = setTimeout(r, ee / 2);
    };
  }
};
class bn extends Ce {
  /**
   * @param {string} url
   * @param {object} opts
   * @param {'arraybuffer' | 'blob' | null} [opts.binaryType] Set `ws.binaryType`
   */
  constructor(e, { binaryType: s } = {}) {
    super(), this.url = e, this.ws = null, this.binaryType = s || null, this.connected = !1, this.connecting = !1, this.unsuccessfulReconnects = 0, this.lastMessageReceived = 0, this.shouldConnect = !0, this._checkInterval = setInterval(() => {
      this.connected && ee < C() - this.lastMessageReceived && this.ws.close();
    }, ee / 2), me(this);
  }
  /**
   * @param {any} message
   */
  send(e) {
    this.ws && this.ws.send(JSON.stringify(e));
  }
  destroy() {
    clearInterval(this._checkInterval), this.disconnect(), super.destroy();
  }
  disconnect() {
    this.shouldConnect = !1, this.ws !== null && this.ws.close();
  }
  connect() {
    this.shouldConnect = !0, !this.connected && this.ws === null && me(this);
  }
}
const k = B("y-webrtc");
class Oe {
  /**
   * @param {SignalingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Room} room
   */
  constructor(e, s, n, i) {
    this.remotePeerId = n, this.room = i, k("establishing connection to ", E, n), this.peer = new gt({ initiator: s, ...i.provider.peerOpts }), this.peer.on("signal", (r) => {
      e.publishSignalingMessage(i, {
        to: n,
        from: i.peerId,
        type: "signal",
        signal: r
      });
    }), this.peer.on("connect", () => {
      k("connected to ", E, n), this.connected = !0, i.onPeerConnected((r) => {
        const o = u();
        l(o, G), m(o, r), this.sendWebrtcConn(o);
      });
    }), this.peer.on("close", () => {
      this.connected = !1, this.closed = !0, i.webrtcConns.has(this.remotePeerId) && (i.webrtcConns.delete(this.remotePeerId), i.provider.emit("peers", [
        {
          removed: [this.remotePeerId],
          added: [],
          webrtcPeers: Array.from(i.webrtcConns.keys()),
          bcPeers: Array.from(i.bcConns)
        }
      ])), this.peer.destroy(), k("closed connection to ", E, n), pe(i);
    }), this.peer.on("error", (r) => {
      k("Error in connection to ", E, n, ": ", r), pe(i);
    }), this.peer.on("data", (r) => {
      k(
        "received message from ",
        E,
        this.remotePeerId,
        ue,
        " (",
        i.name,
        ")",
        X,
        Z
      ), this.room.readMessage(r, (o) => {
        this.sendWebrtcConn(o);
      });
    });
  }
  closed = !1;
  connected = !1;
  synced = !1;
  sendWebrtcConn(e) {
    k(
      "send message to ",
      E,
      this.remotePeerId,
      X,
      ue,
      " (",
      this.room.name,
      ")",
      Z
    );
    try {
      this.peer.send(f(e));
    } catch {
    }
  }
  peer;
  destroy() {
    this.peer.destroy();
  }
}
const Fe = B("y-webrtc");
class vn extends bn {
  providers = /* @__PURE__ */ new Set();
  constructor(e) {
    super(e), this.on("connect", () => {
      Fe(`connected (${e})`);
      const s = Array.from(M.keys());
      this.send({ type: "subscribe", topics: s }), M.forEach(
        (n) => this.publishSignalingMessage(n, {
          type: "announce",
          from: n.peerId
        })
      );
    }), this.on("message", (s) => {
      switch (s.type) {
        case "publish": {
          const n = s.topic, i = M.get(n);
          if (i == null || typeof n != "string")
            return;
          const r = (o) => {
            const a = i.webrtcConns, c = i.peerId;
            if (o == null || o.from === c || o.to !== void 0 && o.to !== c || i.bcConns.has(o.from))
              return;
            const h = a.has(o.from) ? () => {
            } : () => i.provider.emit("peers", [
              {
                removed: [],
                added: [o.from],
                webrtcPeers: Array.from(i.webrtcConns.keys()),
                bcPeers: Array.from(i.bcConns)
              }
            ]);
            switch (o.type) {
              case "announce":
                a.size < i.provider.maxConns && (j(
                  a,
                  o.from,
                  () => new Oe(this, !0, o.from, i)
                ), h());
                break;
              case "signal":
                o.to === c && (j(
                  a,
                  o.from,
                  () => new Oe(this, !1, o.from, i)
                ).peer.signal(o.signal), h());
                break;
            }
          };
          i.key ? typeof s.data == "string" && en(ct(s.data), i.key).then(r) : r(s.data);
        }
      }
    }), this.on("disconnect", () => Fe(`disconnect (${e})`));
  }
  publishSignalingMessage = (e, s) => {
    e.key ? Qs(s, e.key).then((n) => {
      this.send({
        type: "publish",
        topic: e.name,
        data: at(n)
      });
    }) : this.send({ type: "publish", topic: e.name, data: s });
  };
}
B("y-webrtc");
const Sn = (t, e, s, n, i) => {
  if (M.has(n))
    throw se(`A Yjs Doc connected to room "${n}" already exists!`);
  const r = new gn(t, e, s, n, i);
  return M.set(n, r), r;
};
class Cn extends Ce {
  constructor(e, {
    signaling: s = [
      "wss://signaling.yjs.dev",
      "wss://y-webrtc-signaling-eu.herokuapp.com",
      "wss://y-webrtc-signaling-us.herokuapp.com"
    ],
    password: n = void 0,
    // awareness = new awarenessProtocol.Awareness(doc),
    maxConns: i = 20 + R(qs() * 15),
    // the random factor reduces the chance that n clients form a cluster
    filterBcConns: r = !0,
    peerOpts: o = {}
    // simple-peer options. See https://github.com/feross/simple-peer#peer--new-peeropts
  } = {}) {
    super(), this.roomName = e, this.filterBcConns = r, this.shouldConnect = !1, this.signalingUrls = s, this.signalingConns = [], this.maxConns = i, this.peerOpts = { iceServers: [] }, this.key = n ? Zs(n, e) : Promise.resolve(void 0), this.key.then((a) => {
      this.room = Sn(
        this,
        this.onCustomMessage,
        this.onPeerConnected,
        e,
        a
      ), this.shouldConnect ? this.room.connect() : this.room.disconnect();
    }), this.connect();
  }
  // public readonly awareness: awarenessProtocol.Awareness;
  shouldConnect = !1;
  filterBcConns = !0;
  signalingUrls;
  signalingConns;
  peerOpts;
  maxConns;
  key;
  room;
  /**
   * @type {boolean}
   */
  get connected() {
    return this.room !== null && this.shouldConnect;
  }
  connect() {
    this.shouldConnect = !0, this.signalingUrls.forEach((e) => {
      const s = j(
        Q,
        e,
        () => new vn(e)
      );
      this.signalingConns.push(s), s.providers.add(this);
    }), this.room && this.room.connect();
  }
  disconnect() {
    this.shouldConnect = !1, this.signalingConns.forEach((e) => {
      e.providers.delete(this), e.providers.size === 0 && (e.destroy(), Q.delete(e.url));
    }), this.room && this.room.disconnect();
  }
  destroy() {
    this.key.then(() => {
      this.room?.destroy(), M.delete(this.roomName);
    }), super.destroy();
  }
}
const In = B("y-webrtc"), H = 0, Pn = 3, ae = 1;
class Rn extends Cn {
  constructor(e, s, n, i = new $s(s)) {
    super(e, n), this.doc = s, this.awareness = i, s.on("destroy", this.destroy.bind(this)), this.doc.on("update", this._docUpdateHandler), this.awareness.on("update", this._awarenessUpdateHandler), window.addEventListener("beforeunload", () => {
      it(
        this.awareness,
        [s.clientID],
        "window unload"
      ), M.forEach((r) => {
        r.disconnect();
      });
    });
  }
  onCustomMessage = (e, s) => {
    const n = T(e), i = u();
    switch (y(n)) {
      case H: {
        l(i, H), Je(
          n,
          i,
          this.doc,
          this
        ) === be && s(f(i));
        break;
      }
      case ae:
        Hs(
          this.awareness,
          S(n),
          this
        );
        break;
    }
  };
  onPeerConnected = (e) => {
    const s = u();
    l(s, H), rs(s, this.doc), e(f(s));
    const n = u(), i = this.awareness.getStates();
    i.size > 0 && (l(n, ae), m(
      n,
      Be(
        this.awareness,
        Array.from(i.keys())
      )
    ), e(f(n)));
  };
  /**
   * Listens to Yjs updates and sends them to remote peers
   */
  _docUpdateHandler = (e, s) => {
    if (!this.room)
      return;
    const n = u();
    l(n, H), qe(n, e), this.room.broadcastRoomMessage(f(n));
  };
  /**
   * Listens to Awareness updates and sends them to remote peers
   */
  _awarenessUpdateHandler = ({ added: e, updated: s, removed: n }, i) => {
    if (!this.room)
      return;
    const r = e.concat(s).concat(n);
    In(
      "awareness change ",
      { added: e, updated: s, removed: n },
      "local",
      this.awareness.clientID
    );
    const o = u();
    l(o, ae), m(
      o,
      Be(this.awareness, r)
    ), this.room.broadcastRoomMessage(f(o));
  };
  destroy() {
    this.doc.off("update", this._docUpdateHandler), this.awareness.off("update", this._awarenessUpdateHandler), this.doc.off("destroy", this.destroy), super.destroy();
  }
}
class Dn {
  constructor(e) {
    this.doc = e, this.clientId = this.generateClientId(), this.cleanupInterval = setInterval(() => this.cleanupStaleStates(), 3e4);
  }
  states = /* @__PURE__ */ new Map();
  localState = null;
  clientId;
  listeners = {};
  cleanupInterval;
  generateClientId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  get clientID() {
    return this.clientId;
  }
  /**
   * Set local user's awareness state (cursor position, selection, user info)
   */
  setLocalState(e) {
    e === null ? (this.localState = null, this.states.delete(this.clientId)) : (this.localState = {
      ...this.localState,
      ...e,
      timestamp: Date.now()
    }, this.states.set(this.clientId, this.localState)), this.emit("change", {
      added: [],
      updated: [this.clientId],
      removed: e === null ? [this.clientId] : []
    }), this.emit("update", {
      added: [],
      updated: [this.clientId],
      removed: e === null ? [this.clientId] : []
    });
  }
  /**
   * Update a single field in local state
   */
  setLocalStateField(e, s) {
    this.localState || (this.localState = { timestamp: Date.now() }), this.localState[e] = s, this.localState.timestamp = Date.now(), this.states.set(this.clientId, this.localState), this.emit("change", {
      added: [],
      updated: [this.clientId],
      removed: []
    }), this.emit("update", {
      added: [],
      updated: [this.clientId],
      removed: []
    });
  }
  /**
   * Get all awareness states (local + remote)
   */
  getStates() {
    return new Map(this.states);
  }
  /**
   * Get local awareness state
   */
  getLocalState() {
    return this.localState;
  }
  /**
   * Apply remote awareness update
   */
  applyAwarenessUpdate(e) {
    const { clientId: s, state: n } = e;
    if (s === this.clientId)
      return;
    const i = this.states.has(s);
    n === null ? (this.states.delete(s), i && this.emit("change", {
      added: [],
      updated: [],
      removed: [s]
    })) : (this.states.set(s, n), this.emit("change", {
      added: i ? [] : [s],
      updated: i ? [s] : [],
      removed: []
    }));
  }
  /**
   * Encode local awareness state for WebRTC transmission
   */
  encodeAwarenessUpdate() {
    if (!this.localState)
      return new Uint8Array(0);
    const e = {
      clientId: this.clientId,
      state: this.localState
    }, s = JSON.stringify(e);
    return new TextEncoder().encode(s);
  }
  /**
   * Decode and apply awareness update from WebRTC
   */
  applyAwarenessUpdateFromBytes(e) {
    try {
      const s = new TextDecoder().decode(e), n = JSON.parse(s);
      this.applyAwarenessUpdate(n);
    } catch (s) {
      console.error("Failed to decode awareness update:", s);
    }
  }
  /**
   * Remove stale awareness states (older than 30 seconds)
   */
  cleanupStaleStates() {
    const e = Date.now(), s = 30 * 1e3, n = [];
    this.states.forEach((i, r) => {
      r !== this.clientId && e - i.timestamp > s && n.push(r);
    }), n.length > 0 && (n.forEach((i) => this.states.delete(i)), this.emit("change", {
      added: [],
      updated: [],
      removed: n
    }));
  }
  /**
   * Event listener
   */
  on(e, s) {
    this.listeners[e] || (this.listeners[e] = []), this.listeners[e].push(s);
  }
  /**
   * Remove event listener
   */
  off(e, s) {
    if (this.listeners[e]) {
      const n = this.listeners[e].indexOf(s);
      n > -1 && this.listeners[e].splice(n, 1);
    }
  }
  emit(e, s) {
    this.listeners[e] && this.listeners[e].forEach((n) => n(s));
  }
  destroy() {
    this.cleanupInterval && clearInterval(this.cleanupInterval), this.states.clear(), this.listeners = {}, this.localState = null;
  }
}
export {
  Rn as DocWebrtcProvider,
  bt as MatrixMemberReader,
  xn as MatrixProvider,
  ks as MatrixWebrtcProvider,
  Ds as SignedWebrtcProvider,
  Dn as SimpleAwareness,
  Mn as createMatrixRoom,
  Tn as getMatrixRoomAccess,
  ae as messageAwareness,
  Pn as messageQueryAwareness,
  H as messageSync,
  yt as signObject,
  kn as updateMatrixRoomAccess,
  wt as verifyObject
};
