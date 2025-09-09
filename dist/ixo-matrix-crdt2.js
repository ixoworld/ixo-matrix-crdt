import { lifecycle as p, event as c } from "vscode-lib";
import * as o from "yjs";
import { signObject as f, verifyObject as u } from "./ixo-matrix-crdt8.js";
import { MatrixMemberReader as w } from "./ixo-matrix-crdt7.js";
import { MatrixReader as v } from "./ixo-matrix-crdt10.js";
import { SignedWebrtcProvider as g } from "./ixo-matrix-crdt6.js";
import { BlockNoteAwareness as _ } from "./ixo-matrix-crdt11.js";
import { ThrottledMatrixWriter as b } from "./ixo-matrix-crdt12.js";
import { decodeBase64 as y } from "./ixo-matrix-crdt13.js";
import { arrayBuffersAreEqual as E } from "./ixo-matrix-crdt14.js";
import { MatrixCRDTEventTranslator as U } from "./ixo-matrix-crdt15.js";
const z = {
  enableExperimentalWebrtcSync: !1,
  enableAwareness: !1,
  reader: {},
  writer: {},
  translator: {}
};
class M extends p.Disposable {
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
  constructor(t, e, s, i = {}) {
    super(), this.doc = t, this.matrixClient = e, this.room = s, this.opts = { ...z, ...i }, this.translator = new U(this.opts.translator), this.throttledWriter = new b(
      this.matrixClient,
      this.translator,
      this.opts.writer
    ), this.opts.enableAwareness && (this.awareness = new _(t)), t.on("update", this.documentUpdateListener);
  }
  disposed = !1;
  _roomId;
  initializeTimeoutHandler;
  initializedResolve;
  // TODO: rewrite to remove initializedPromise and use async / await instead
  initializedPromise = new Promise((t) => {
    this.initializedResolve = t;
  });
  webrtcProvider;
  reader;
  throttledWriter;
  translator;
  awareness;
  _onDocumentAvailable = this._register(
    new c.Emitter()
  );
  _onDocumentUnavailable = this._register(
    new c.Emitter()
  );
  _onReceivedEvents = this._register(
    new c.Emitter()
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
  documentUpdateListener = async (t, e) => {
    e === this || this.webrtcProvider && e === this.webrtcProvider || e?.provider || this.throttledWriter.writeUpdate(t);
  };
  /**
   * Handles incoming events from MatrixReader
   */
  processIncomingEvents = (t, e = !1) => {
    t = t.filter((r) => !(!this.translator.isUpdateEvent(r) && !this.translator.isSnapshotEvent(r))), this.totalEventsReceived += t.length;
    const s = t.map(
      (r) => new Uint8Array(y(r.content.update))
    ), i = o.mergeUpdates(s);
    if (!s.length)
      return i;
    if (o.applyUpdate(this.doc, i, this), e) {
      const r = t[t.length - 1], l = o.encodeStateAsUpdate(this.doc);
      this.translator.sendSnapshot(
        this.matrixClient,
        this._roomId,
        l,
        r.event_id
      ).catch((d) => {
        console.error("failed to send snapshot");
      });
    }
    return t.filter(
      (r) => r.user_id !== this.matrixClient.credentials.userId
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
    const t = this._register(
      new w(this.matrixClient, this.reader)
    );
    await t.initialize();
    const e = this.matrixClient;
    let s;
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
      s = await e.createFilter(i);
    } catch {
    }
    e.startClient({
      filter: s,
      initialSyncLimit: 10
    }), await new Promise(
      (i) => e.once(
        "sync",
        (n) => n === "PREPARED" && i()
      )
    ), this._register({ dispose: () => e.stopClient() }), this.webrtcProvider = new g(
      this.doc,
      e,
      // <- use the tiny client for signalling
      this._roomId,
      async (i) => {
        await f(this.matrixClient, i);
      },
      async (i) => {
        await u(
          this.matrixClient,
          t,
          i,
          this.translator.WrappedEventType
        );
      },
      this.awareness
    );
  }
  async initializeNoCatch() {
    const t = this.room.type === "id" ? this.room.id : this.room.alias;
    try {
      if (this.room.type === "id")
        this._roomId = this.room.id;
      else if (this.room.type === "alias") {
        const a = await this.matrixClient.getRoomIdForAlias(this.room.alias);
        this._roomId = a.room_id;
      }
      if (!this._roomId)
        throw new Error("error receiving room id");
      console.log("room resolved", this._roomId), await this.throttledWriter.initialize(this._roomId);
    } catch (a) {
      let h = 5e3;
      a.errcode === "M_NOT_FOUND" ? (console.log("room not found", t), this._onDocumentUnavailable.fire()) : a.name === "ConnectionError" ? console.log("room not found (offline)", t) : (console.error("error retrieving room", t, a), h = 30 * 1e3, this._onDocumentUnavailable.fire()), this.initializeTimeoutHandler = setTimeout(() => {
        this.initialize();
      }, h);
      return;
    }
    let e = o.encodeStateAsUpdate(this.doc);
    const s = o.encodeStateVectorFromUpdate(e), i = o.diffUpdate(
      e,
      s
    );
    let n = o.snapshot(this.doc);
    const r = await this.initializeReader();
    this._onDocumentAvailable.fire();
    const l = o.encodeStateVectorFromUpdate(r), d = o.diffUpdate(e, l);
    if (E(i.buffer, d.buffer)) {
      let a = new o.Doc();
      o.applyUpdate(a, r);
      let h = o.snapshot(a);
      if (I(h, n)) {
        this.initializedResolve();
        return;
      }
    }
    d.length > 2 && this.throttledWriter.writeUpdate(d), this.initializedResolve();
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
      new v(
        this.matrixClient,
        this._roomId,
        this.translator,
        this.opts.reader
      )
    ), this._register(
      this.reader.onEvents(
        (e) => this.processIncomingEvents(e.events, e.shouldSendSnapshot)
      )
    );
    const t = await this.reader.getInitialDocumentUpdateEvents();
    return this.reader.startPolling(), this.processIncomingEvents(t);
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
    } catch (t) {
      throw console.error(t), t;
    }
  }
  dispose() {
    super.dispose(), this.disposed = !0, this.webrtcProvider?.destroy(), this.reader?.dispose(), this.awareness?.destroy(), clearTimeout(this.initializeTimeoutHandler), this.doc.off("update", this.documentUpdateListener);
  }
}
function I(m, t) {
  for (const [e, s] of t.ds.clients.entries()) {
    const i = m.ds.clients.get(e) || [];
    if (s.length > i.length)
      return !1;
    for (let n = 0; n < s.length; n++) {
      const r = s[n], l = i[n];
      if (r.clock !== l.clock || r.len !== l.len)
        return !1;
    }
  }
  return !0;
}
export {
  M as MatrixProvider
};
