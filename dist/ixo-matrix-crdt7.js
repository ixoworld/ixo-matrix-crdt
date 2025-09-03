import { lifecycle as a } from "vscode-lib";
class l extends a.Disposable {
  constructor(e, t) {
    super(), this.matrixClient = e, this.reader = t, this._register(
      this.reader.onEvents((i) => i.events.forEach((r) => this.processEvent(r)))
    );
  }
  disposed = !1;
  initialized = !1;
  initializing = !1;
  initializeOutdated = !1;
  members = /* @__PURE__ */ new Map();
  powerLevels;
  hasWriteAccess(e, t = "m.room.message") {
    if (!this.members.has(e))
      return !1;
    const i = this.powerLevels;
    let r = i.events[t];
    r === void 0 && (r = i.events_default);
    let s = i.users[e];
    if (s === void 0 && (s = i.users_default), typeof s != "number" || typeof r != "number")
      throw new Error("unexpected");
    return s >= r;
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
            const t = {
              displayname: e.content.displayname,
              user_id: e.state_key
            };
            this.members.set(e.state_key, t);
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
    const [e, t] = await Promise.all([
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
    this.powerLevels = e, t.chunk.filter(
      (i) => i.type === "m.room.member" && (i.content.membership === "join" || i.content.membership === "invite")
    ).forEach((i) => {
      this.members.set(i.state_key, {
        displayname: i.content.displayname,
        user_id: i.state_key
      });
    }), this.initializing = !1, this.initialized = !0;
  }
  dispose() {
    this.disposed = !0, super.dispose();
  }
}
export {
  l as MatrixMemberReader
};
