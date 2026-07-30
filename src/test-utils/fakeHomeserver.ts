/**
 * A tiny in-memory stand-in for a Matrix homeserver, covering exactly the API
 * surface matrix-crdt uses: `sendEvent`, `createMessagesRequest`,
 * `http.authedRequest` (for the `/events` long poll and media downloads),
 * `uploadContent` and a couple of getters.
 *
 * The repo's other tests need a real Synapse in docker (`ensureMatrixIsRunning`)
 * which makes them unrunnable in most environments. Snapshot behaviour —
 * especially "what does an already-deployed client do with an event type it has
 * never seen" — is deterministic protocol behaviour, so it is tested here
 * against the fake instead.
 */

export interface FakeEvent {
  type: string;
  content: any;
  event_id: string;
  room_id: string;
  user_id: string;
  sender: string;
  origin_server_ts: number;
}

/** Matrix's hard per-event ceiling (spec: "size of the event must be < 65536 bytes") */
export const MAX_EVENT_SIZE = 65536;

let eventCounter = 0;
let mediaCounter = 0;

export interface FakeRoomOptions {
  encrypted?: boolean;
}

export class FakeHomeserver {
  public readonly rooms = new Map<
    string,
    { events: FakeEvent[]; encrypted: boolean }
  >();
  public readonly media = new Map<string, Uint8Array>();
  public readonly aliases = new Map<string, string>();

  /** mxc urls whose download should fail (simulating media loss / outage) */
  public readonly brokenMedia = new Set<string>();
  /** mxc urls whose download should return these bytes instead (corruption) */
  public readonly tamperedMedia = new Map<string, Uint8Array>();
  /** set to false to simulate a homeserver without authenticated media */
  public authenticatedMediaSupported = true;

  public uploadCount = 0;
  public downloadCount = 0;
  /** how many backwards-pagination pages have been requested */
  public messagesRequestCount = 0;
  /** event-type filters supplied to `/messages`, in request order */
  public readonly messagesRequestTypeFilters: Array<
    readonly string[] | undefined
  > = [];

  private readonly transactions = new Map<string, { event_id: string }>();

  public createRoom(roomId: string, opts: FakeRoomOptions = {}) {
    this.rooms.set(roomId, { events: [], encrypted: !!opts.encrypted });
    this.aliases.set(`#${roomId}:fake`, roomId);
    return roomId;
  }

  public getRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`unknown room ${roomId}`);
    }
    return room;
  }

  public eventsOfType(roomId: string, type: string) {
    return this.getRoom(roomId).events.filter((e) => e.type === type);
  }

  public createClient(userId = "@alice:fake") {
    return new FakeMatrixClient(this, userId);
  }

  public getTransaction(
    roomId: string,
    eventType: string,
    userId: string,
    transactionId: string
  ) {
    return this.transactions.get(
      `${roomId}\u0000${eventType}\u0000${userId}\u0000${transactionId}`
    );
  }

  public setTransaction(
    roomId: string,
    eventType: string,
    userId: string,
    transactionId: string,
    response: { event_id: string }
  ) {
    this.transactions.set(
      `${roomId}\u0000${eventType}\u0000${userId}\u0000${transactionId}`,
      response
    );
  }
}

export class FakeMatrixClient {
  public readonly credentials: { userId: string };
  public readonly http: { authedRequest: (...args: any[]) => Promise<any> };
  /** every /events poll resolves after this many ms (simulated long poll) */
  public pollDelayMs = 20;

  public constructor(
    private readonly hs: FakeHomeserver,
    private readonly userId: string
  ) {
    this.credentials = { userId };
    this.http = {
      authedRequest: (
        method: any,
        path: string,
        queryParams?: any,
        body?: any,
        opts?: any
      ) => this.authedRequest(method, path, queryParams, body, opts),
    };
  }

  public getUserId() {
    return this.userId;
  }

  public getAccessToken() {
    return "fake_token";
  }

  public async getRoomIdForAlias(alias: string) {
    const roomId = this.hs.aliases.get(alias);
    if (!roomId) {
      const err: any = new Error("not found");
      err.errcode = "M_NOT_FOUND";
      throw err;
    }
    return { room_id: roomId };
  }

  public async getStateEvent(roomId: string, type: string, _key: string) {
    const room = this.hs.getRoom(roomId);
    if (type === "m.room.encryption") {
      if (room.encrypted) {
        return { algorithm: "m.megolm.v1.aes-sha2" };
      }
      const err: any = new Error("not found");
      err.errcode = "M_NOT_FOUND";
      throw err;
    }
    const err: any = new Error("not found");
    err.errcode = "M_NOT_FOUND";
    throw err;
  }

  public async sendEvent(
    roomId: string,
    type: string,
    content: any,
    txnId?: string
  ) {
    if (txnId) {
      const existing = this.hs.getTransaction(
        roomId,
        type,
        this.userId,
        txnId
      );
      if (existing) {
        return existing;
      }
    }
    const room = this.hs.getRoom(roomId);
    // Matrix caps a PDU at 65,536 bytes. Enforcing it here is the whole point of
    // this test suite: it is what makes an inline full-document snapshot
    // impossible past ~45 KB of document.
    const approxSize = JSON.stringify({
      type,
      content,
      room_id: roomId,
      sender: this.userId,
      event_id: "$evt_00000000000000000000",
      origin_server_ts: Date.now(),
    }).length;
    if (approxSize > MAX_EVENT_SIZE) {
      const err: any = new Error(
        `event too large (${approxSize} > ${MAX_EVENT_SIZE})`
      );
      err.errcode = "M_TOO_LARGE";
      err.httpStatus = 413;
      throw err;
    }
    const event: FakeEvent = {
      type,
      content,
      event_id: `$evt_${++eventCounter}`,
      room_id: roomId,
      user_id: this.userId,
      sender: this.userId,
      origin_server_ts: Date.now(),
    };
    room.events.push(event);
    const response = { event_id: event.event_id };
    if (txnId) {
      this.hs.setTransaction(roomId, type, this.userId, txnId, response);
    }
    return response;
  }

  /**
   * Backwards pagination over the room timeline, matching the token semantics
   * MatrixReader relies on: `start` is where this page began, `end` is the token
   * to continue from and is absent once the walk reached room genesis.
   */
  public async createMessagesRequest(
    roomId: string,
    fromToken: string,
    limit: number,
    dir: any,
    timelineFilter?: any
  ) {
    const room = this.hs.getRoom(roomId);
    this.hs.messagesRequestCount++;
    const typeFilter = timelineFilter
      ?.getRoomTimelineFilterComponent?.()
      ?.toJSON?.()?.types as string[] | undefined;
    this.hs.messagesRequestTypeFilters.push(typeFilter);
    const matches = (event: FakeEvent) =>
      !typeFilter || typeFilter.includes(event.type);

    if (dir === "f") {
      const cursor =
        fromToken === "" ? 0 : Math.max(0, parseInt(fromToken, 10));
      const chunk: FakeEvent[] = [];
      let index = cursor;
      while (index < room.events.length && chunk.length < limit) {
        const event = room.events[index++];
        if (matches(event)) {
          chunk.push(event);
        }
      }
      return {
        chunk,
        start: String(cursor),
        end: index < room.events.length ? String(index) : undefined,
      };
    }

    const cursor =
      fromToken === ""
        ? room.events.length
        : Math.min(room.events.length, Math.max(0, parseInt(fromToken, 10)));
    const chunk: FakeEvent[] = [];
    let index = cursor - 1;
    // Backwards pagination returns newest-first. The raw timeline cursor keeps
    // moving over non-matching events just as a homeserver-side filter does.
    while (index >= 0 && chunk.length < limit) {
      const event = room.events[index--];
      if (matches(event)) {
        chunk.push(event);
      }
    }
    return {
      chunk,
      start: String(cursor),
      end: index >= 0 ? String(index + 1) : undefined,
    };
  }

  public async uploadContent(file: any, _opts?: any) {
    this.hs.uploadCount++;
    const bytes =
      file instanceof Uint8Array ? new Uint8Array(file) : new Uint8Array(file);
    const mxcUrl = `mxc://fake/media_${++mediaCounter}`;
    this.hs.media.set(mxcUrl, bytes);
    return { content_uri: mxcUrl };
  }

  private async authedRequest(
    _method: any,
    path: string,
    queryParams?: any,
    _body?: any,
    opts?: any
  ): Promise<any> {
    if (path === "/events") {
      return this.pollEvents(queryParams);
    }

    const authenticated = /^\/media\/download\/([^/]+)\/(.+)$/.exec(path);
    const legacy = /^\/download\/([^/]+)\/(.+)$/.exec(path);
    const isAuthenticatedPrefix = opts?.prefix === "/_matrix/client/v1";

    if (authenticated && isAuthenticatedPrefix) {
      if (!this.hs.authenticatedMediaSupported) {
        const err: any = new Error("unrecognized");
        err.errcode = "M_UNRECOGNIZED";
        err.httpStatus = 404;
        throw err;
      }
      return this.downloadMedia(authenticated[1], authenticated[2]);
    }
    if (legacy && !isAuthenticatedPrefix) {
      return this.downloadMedia(legacy[1], legacy[2]);
    }

    const err: any = new Error(`unexpected request ${path}`);
    err.errcode = "M_UNRECOGNIZED";
    err.httpStatus = 404;
    throw err;
  }

  private async downloadMedia(serverName: string, mediaId: string) {
    this.hs.downloadCount++;
    const mxcUrl = `mxc://${decodeURIComponent(
      serverName
    )}/${decodeURIComponent(mediaId)}`;
    if (this.hs.brokenMedia.has(mxcUrl)) {
      const err: any = new Error("media unavailable");
      err.httpStatus = 502;
      throw err;
    }
    const tampered = this.hs.tamperedMedia.get(mxcUrl);
    if (tampered) {
      return new Blob([tampered as any]);
    }
    const bytes = this.hs.media.get(mxcUrl);
    if (!bytes) {
      const err: any = new Error("not found");
      err.httpStatus = 404;
      err.errcode = "M_NOT_FOUND";
      throw err;
    }
    // matrix-js-sdk returns a Blob when `rawResponseBody` is set
    return new Blob([bytes as any]);
  }

  private async pollEvents(queryParams: any) {
    const roomId = queryParams?.room_id;
    const room = this.hs.getRoom(roomId);
    const from = parseInt(queryParams?.from ?? "0", 10);
    await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
    const chunk = room.events.slice(from);
    return { chunk, start: String(from), end: String(room.events.length) };
  }
}
