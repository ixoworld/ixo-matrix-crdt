import {
  Direction,
  MatrixClient,
  MatrixEvent,
  Method,
} from "matrix-js-sdk";
import { createTimelineTypeFilter } from "./util/timelineFilter";

/** Durable room event type used for flow run history. */
export const RUN_EVENT_TYPE = "ixo.flow.run.event";
/** Current on-wire schema version for {@link RunEventContent}. */
export const RUN_EVENT_SCHEMA_VERSION = 1 as const;

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_POLL_TIMEOUT = 30_000;
const DEFAULT_POLL_RETRY_DELAY = 5_000;
const MAX_CURSOR_SESSIONS = 1_000;
const DEFAULT_SUCCESSFUL_APPEND_CACHE_SIZE = 1_000;
const MAX_SUCCESSFUL_APPEND_CACHE_SIZE = 10_000;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface RunStartedPayload {
  invocationCid?: string;
  definitionRevision?: string;
  label?: string;
}

export interface RunClosedPayload {
  invocationCid?: string;
  summary?: JsonObject;
}

export interface RunCancelledPayload {
  invocationCid?: string;
  reason?: string;
  summary?: JsonObject;
}

export interface ActionStartedPayload {
  attempt: number;
  executionId?: string;
  invocationCid?: string;
  input?: JsonValue;
}

export interface ActionOutputPayload {
  attempt: number;
  executionId?: string;
  output: JsonValue;
}

export interface ActionDonePayload {
  attempt: number;
  executionId?: string;
  durationMs?: number;
  output?: JsonValue;
}

export interface RunEventError {
  message: string;
  name?: string;
  code?: string;
  retryable?: boolean;
  details?: JsonValue;
}

export interface ActionFailedPayload {
  attempt: number;
  executionId?: string;
  durationMs?: number;
  error: RunEventError;
}

export interface DefinitionChangedPayload {
  revision: string;
  previousRevision?: string;
  changedBlockIds?: string[];
  summary?: string;
}

export type RunEventLogLevel = "debug" | "info" | "warn" | "error";

export interface RunLogPayload {
  level: RunEventLogLevel;
  message: string;
  data?: JsonValue;
}

interface RunEventBase<K extends string, P extends object> {
  v: typeof RUN_EVENT_SCHEMA_VERSION;
  runId: string;
  kind: K;
  payload: P;
  /**
   * Client-observed timestamp. Ordering and audit authorship always come from
   * `originServerTs` and `sender` on {@link RoomEventLogEntry}.
   */
  ts: number;
  /**
   * Stable, room-wide key. It is persisted in content and used as Matrix's
   * transaction id, so retries converge on one event.
   */
  idempotencyKey: string;
}

type RunLevelEvent<K extends string, P extends object> = RunEventBase<K, P> & {
  blockId?: never;
};

type ActionEvent<K extends string, P extends object> = RunEventBase<K, P> & {
  blockId: string;
};

export type RunEventContent =
  | RunLevelEvent<"run.started", RunStartedPayload>
  | RunLevelEvent<"run.closed", RunClosedPayload>
  | RunLevelEvent<"run.cancelled", RunCancelledPayload>
  | ActionEvent<"action.started", ActionStartedPayload>
  | ActionEvent<"action.output", ActionOutputPayload>
  | ActionEvent<"action.done", ActionDonePayload>
  | ActionEvent<"action.failed", ActionFailedPayload>
  | RunLevelEvent<"definition.changed", DefinitionChangedPayload>
  | (RunEventBase<"log", RunLogPayload> & { blockId?: string });

export type RunEventKind = RunEventContent["kind"];

type InputFor<T extends RunEventContent> = T extends RunEventContent
  ? Omit<T, "v" | "ts"> & { ts?: number }
  : never;

/**
 * Append input. The module assigns `v: 1` and defaults `ts` to the current
 * time; all other fields are validated before anything is sent.
 */
export type RunEventInput = InputFor<RunEventContent>;

export interface RoomEventLogEntry {
  eventId: string;
  roomId: string;
  sender: string;
  /** Server-assigned timestamp; use this for display ordering and audit. */
  originServerTs: number;
  eventType: typeof RUN_EVENT_TYPE;
  content: RunEventContent;
  /** Present only for the immediate echo emitted by this instance's append. */
  localEcho?: true;
}

export type RoomEventLogReadDirection = "backward" | "forward";

export interface RoomEventLogReadOptions {
  /** Opaque Matrix pagination token returned by a previous page. */
  from?: string;
  /** Number of matching, valid events to return. Defaults to 50, max 100. */
  limit?: number;
  /** Defaults to newest-first (`backward`). */
  direction?: RoomEventLogReadDirection;
}

export interface RoomEventLogPage {
  events: RoomEventLogEntry[];
  /** Token the request began at, when one was supplied. */
  fromToken?: string;
  /** Opaque token for the next page; absent at the end of history. */
  nextToken?: string;
  direction: RoomEventLogReadDirection;
}

export interface RoomEventLogSubscriptionOptions {
  /** Restrict delivery to one run while still using one room event type. */
  runId?: string;
  /**
   * Resume from an opaque Matrix token. When omitted, subscription starts at
   * the live edge and does not replay history.
   */
  from?: string;
  onError?: (error: unknown) => void;
}

export interface RoomEventLogDisposable {
  dispose(): void;
}

export type RoomEventLogListener = (event: RoomEventLogEntry) => void;

/**
 * Matrix-free structural API for editor and Portal adapters. Consumers can
 * depend on this interface without importing matrix-js-sdk.
 */
export interface IRoomEventLog {
  append(event: RunEventInput): Promise<string>;
  read(
    runId: string,
    options?: RoomEventLogReadOptions
  ): Promise<RoomEventLogPage>;
  subscribe(
    listener: RoomEventLogListener,
    options?: RoomEventLogSubscriptionOptions
  ): RoomEventLogDisposable;
}

export interface RoomEventLogOptions {
  pollTimeoutMs?: number;
  pollRetryDelayMs?: number;
  /**
   * Number of completed idempotency fingerprints/event ids retained for
   * same-instance replay and conflict detection. Defaults to 1,000 and is
   * capped at 10,000.
   */
  successfulAppendCacheSize?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

interface MatrixClientLike {
  credentials?: { userId?: string | null };
  getUserId?(): string | null;
  sendEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    transactionId?: string
  ): Promise<{ event_id?: string }>;
  createMessagesRequest(
    roomId: string,
    fromToken: string,
    limit: number,
    direction: any,
    filter?: any
  ): Promise<{ chunk: unknown[]; start?: string; end?: string }>;
  http: {
    authedRequest(
      method: any,
      path: string,
      queryParams?: Record<string, string>
    ): Promise<{ chunk: unknown[]; start?: string; end?: string }>;
  };
  decryptEventIfNeeded?(event: any): Promise<void>;
}

interface SubscriptionState {
  listener: RoomEventLogListener;
  options: RoomEventLogSubscriptionOptions;
  token: string | undefined;
  tokenInitialized: boolean;
  disposed: boolean;
  seen: Set<string>;
  retryTimer?: ReturnType<typeof setTimeout>;
  resolveRetry?: () => void;
}

interface PendingAppend {
  fingerprint: string;
  promise: Promise<string>;
}

interface SuccessfulAppend {
  fingerprint: string;
  eventId: string;
}

export class RunEventValidationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`invalid ${RUN_EVENT_TYPE} content: ${issues.join("; ")}`);
    this.name = "RunEventValidationError";
  }
}

export class RunEventIdempotencyConflictError extends Error {
  public constructor(public readonly idempotencyKey: string) {
    super(
      `idempotency key "${idempotencyKey}" was already used with different content`
    );
    this.name = "RunEventIdempotencyConflictError";
  }
}

/**
 * Parse an event content object using the strict v1 schema.
 *
 * Unknown versions, kinds, fields, and non-JSON payloads are rejected. This is
 * intentionally fail-closed: timeline history is durable, so accepting a typo
 * today would make that typo part of the public protocol forever.
 */
export function parseRunEventContent(value: unknown): RunEventContent | undefined {
  return validateRunEventContent(value).length
    ? undefined
    : (value as RunEventContent);
}

export function assertRunEventContent(
  value: unknown
): asserts value is RunEventContent {
  const issues = validateRunEventContent(value);
  if (issues.length) {
    throw new RunEventValidationError(issues);
  }
}

/**
 * Durable append/read/subscribe companion to MatrixProvider.
 *
 * The Y.Doc stays responsible for current collaborative state. This class
 * keeps append-only run history in Matrix's room timeline and never loads that
 * history into the document.
 */
export class RoomEventLog implements IRoomEventLog, RoomEventLogDisposable {
  private readonly pollTimeoutMs: number;
  private readonly pollRetryDelayMs: number;
  private readonly now: () => number;
  private readonly successfulAppendCacheSize: number;
  private readonly subscriptions = new Set<SubscriptionState>();
  private readonly pendingAppends = new Map<string, PendingAppend>();
  private readonly successfulAppends = new Map<string, SuccessfulAppend>();
  private readonly paginationSeen = new Map<string, Set<string>>();
  private disposed = false;

  public constructor(
    private readonly client: MatrixClientLike,
    public readonly roomId: string,
    options: RoomEventLogOptions = {}
  ) {
    if (!isIdentifier(roomId, 512)) {
      throw new RunEventValidationError(["roomId must be a non-empty string"]);
    }
    this.pollTimeoutMs = positiveInteger(
      options.pollTimeoutMs,
      DEFAULT_POLL_TIMEOUT
    );
    this.pollRetryDelayMs = positiveInteger(
      options.pollRetryDelayMs,
      DEFAULT_POLL_RETRY_DELAY
    );
    this.successfulAppendCacheSize = boundedPositiveInteger(
      options.successfulAppendCacheSize,
      DEFAULT_SUCCESSFUL_APPEND_CACHE_SIZE,
      MAX_SUCCESSFUL_APPEND_CACHE_SIZE
    );
    this.now = options.now ?? Date.now;
  }

  public append(input: RunEventInput): Promise<string> {
    if (this.disposed) {
      return Promise.reject(new Error("RoomEventLog is disposed"));
    }
    if (!isRecord(input)) {
      return Promise.reject(
        new RunEventValidationError(["event input must be an object"])
      );
    }
    if ("v" in input) {
      return Promise.reject(
        new RunEventValidationError(["v is assigned by RoomEventLog"])
      );
    }

    const content = {
      ...input,
      v: RUN_EVENT_SCHEMA_VERSION,
      ts: input.ts ?? this.now(),
    } as RunEventContent;
    try {
      assertRunEventContent(content);
    } catch (error) {
      return Promise.reject(error);
    }

    const fingerprint = canonicalJson(input);
    const existing = this.pendingAppends.get(content.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(
          new RunEventIdempotencyConflictError(content.idempotencyKey)
        );
      }
      return existing.promise;
    }

    const successful = this.successfulAppends.get(content.idempotencyKey);
    if (successful) {
      if (successful.fingerprint !== fingerprint) {
        return Promise.reject(
          new RunEventIdempotencyConflictError(content.idempotencyKey)
        );
      }
      // Refresh recency so frequently replayed keys remain protected from
      // conflicting reuse without allowing the cache to grow.
      this.successfulAppends.delete(content.idempotencyKey);
      this.successfulAppends.set(content.idempotencyKey, successful);
      return Promise.resolve(successful.eventId);
    }

    const promise = this.appendOnce(content).then(
      (eventId) => {
        const current = this.pendingAppends.get(content.idempotencyKey);
        if (current?.promise === promise) {
          this.pendingAppends.delete(content.idempotencyKey);
          if (!this.disposed) {
            this.rememberSuccessfulAppend(
              content.idempotencyKey,
              fingerprint,
              eventId
            );
          }
        }
        return eventId;
      },
      (error) => {
        const current = this.pendingAppends.get(content.idempotencyKey);
        if (current?.promise === promise) {
          this.pendingAppends.delete(content.idempotencyKey);
        }
        throw error;
      }
    );
    this.pendingAppends.set(content.idempotencyKey, {
      fingerprint,
      promise,
    });
    return promise;
  }

  private rememberSuccessfulAppend(
    idempotencyKey: string,
    fingerprint: string,
    eventId: string
  ) {
    this.successfulAppends.set(idempotencyKey, { fingerprint, eventId });
    while (
      this.successfulAppends.size > this.successfulAppendCacheSize
    ) {
      const oldest = this.successfulAppends.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.successfulAppends.delete(oldest);
    }
  }

  private async appendOnce(content: RunEventContent): Promise<string> {
    // Matrix transaction ids are scoped to user + room + event endpoint. The
    // validated key is safe as a path segment and remains stable across retries
    // and process restarts.
    const transactionId = `ixo.flow.run.${content.idempotencyKey}`;
    const response = await this.client.sendEvent(
      this.roomId,
      RUN_EVENT_TYPE,
      content as unknown as Record<string, unknown>,
      transactionId
    );
    if (!response || !isIdentifier(response.event_id, 512)) {
      throw new Error(
        `Matrix did not return an event_id for ${RUN_EVENT_TYPE} append`
      );
    }

    const entry: RoomEventLogEntry = {
      eventId: response.event_id,
      roomId: this.roomId,
      sender:
        this.client.getUserId?.() ??
        this.client.credentials?.userId ??
        "unknown",
      originServerTs: this.now(),
      eventType: RUN_EVENT_TYPE,
      content,
      localEcho: true,
    };
    for (const subscription of this.subscriptions) {
      this.deliver(subscription, entry);
    }
    return response.event_id;
  }

  public async read(
    runId: string,
    options: RoomEventLogReadOptions = {}
  ): Promise<RoomEventLogPage> {
    if (this.disposed) {
      throw new Error("RoomEventLog is disposed");
    }
    if (!isIdentifier(runId, 256)) {
      throw new RunEventValidationError([
        "runId must be a non-empty string up to 256 characters",
      ]);
    }
    const limit = boundedLimit(options.limit);
    const direction = options.direction ?? "backward";
    if (direction !== "backward" && direction !== "forward") {
      throw new RunEventValidationError([
        'direction must be "backward" or "forward"',
      ]);
    }

    const sdkDirection =
      direction === "backward" ? Direction.Backward : Direction.Forward;
    const filter = createTimelineTypeFilter(
      this.client as unknown as MatrixClient,
      [RUN_EVENT_TYPE]
    );
    let token = options.from ?? "";
    let nextToken: string | undefined;
    const inherited =
      options.from === undefined
        ? undefined
        : this.paginationSeen.get(
            this.paginationKey(runId, direction, options.from)
          );
    const seen = new Set(inherited);
    const entries: RoomEventLogEntry[] = [];

    while (entries.length < limit) {
      const previousToken = token;
      const response = await this.client.createMessagesRequest(
        this.roomId,
        token,
        limit - entries.length,
        sdkDirection,
        filter
      );
      const rawEvents = Array.isArray(response.chunk) ? response.chunk : [];
      const events = await this.decryptRawEventsIfNecessary(rawEvents);

      for (const event of events) {
        const entry = this.toEntry(event);
        if (
          !entry ||
          entry.content.runId !== runId ||
          !rememberEntry(seen, entry)
        ) {
          continue;
        }
        entries.push(entry);
      }

      nextToken =
        typeof response.end === "string" && response.end.length
          ? response.end
          : undefined;
      if (!nextToken || nextToken === previousToken) {
        nextToken = undefined;
        break;
      }
      token = nextToken;
    }

    if (nextToken) {
      this.rememberPagination(
        this.paginationKey(runId, direction, nextToken),
        seen
      );
    }

    return {
      events: entries,
      fromToken: options.from,
      nextToken,
      direction,
    };
  }

  public subscribe(
    listener: RoomEventLogListener,
    options: RoomEventLogSubscriptionOptions = {}
  ): RoomEventLogDisposable {
    if (this.disposed) {
      throw new Error("RoomEventLog is disposed");
    }
    if (typeof listener !== "function") {
      throw new TypeError("RoomEventLog listener must be a function");
    }
    if (options.runId !== undefined && !isIdentifier(options.runId, 256)) {
      throw new RunEventValidationError([
        "subscription runId must be a non-empty string",
      ]);
    }

    const state: SubscriptionState = {
      listener,
      options,
      token: options.from,
      tokenInitialized: options.from !== undefined,
      disposed: false,
      seen: new Set(),
    };
    this.subscriptions.add(state);
    void this.runSubscription(state);

    return {
      dispose: () => {
        if (state.disposed) {
          return;
        }
        state.disposed = true;
        this.subscriptions.delete(state);
        if (state.retryTimer) {
          clearTimeout(state.retryTimer);
        }
        state.resolveRetry?.();
      },
    };
  }

  private async runSubscription(state: SubscriptionState) {
    while (!this.disposed && !state.disposed) {
      try {
        if (!state.tokenInitialized) {
          state.token = await this.getLiveEdgeToken();
          state.tokenInitialized = true;
          if (this.disposed || state.disposed) {
            return;
          }
        }

        const response = await this.client.http.authedRequest(
          Method.Get,
          "/events",
          {
            room_id: this.roomId,
            timeout: this.pollTimeoutMs.toString(),
            from: state.token ?? "",
          }
        );
        if (this.disposed || state.disposed) {
          return;
        }
        const rawEvents = Array.isArray(response.chunk) ? response.chunk : [];
        const events = await this.decryptRawEventsIfNecessary(rawEvents);
        for (const event of events) {
          const entry = this.toEntry(event);
          if (entry) {
            this.deliver(state, entry);
          }
        }
        if (typeof response.end === "string") {
          state.token = response.end;
        }
      } catch (error) {
        if (this.disposed || state.disposed) {
          return;
        }
        try {
          state.options.onError?.(error);
        } catch (listenerError) {
          console.error("RoomEventLog subscription error handler failed", listenerError);
        }
        await this.waitBeforeRetry(state);
      }
    }
  }

  private async getLiveEdgeToken(): Promise<string> {
    const filter = createTimelineTypeFilter(
      this.client as unknown as MatrixClient,
      [RUN_EVENT_TYPE]
    );
    const response = await this.client.createMessagesRequest(
      this.roomId,
      "",
      1,
      Direction.Backward,
      filter
    );
    return response.start ?? response.end ?? "";
  }

  private waitBeforeRetry(state: SubscriptionState): Promise<void> {
    return new Promise((resolve) => {
      state.resolveRetry = resolve;
      state.retryTimer = setTimeout(() => {
        state.retryTimer = undefined;
        state.resolveRetry = undefined;
        resolve();
      }, this.pollRetryDelayMs);
    });
  }

  private deliver(state: SubscriptionState, entry: RoomEventLogEntry) {
    if (
      state.disposed ||
      (state.options.runId &&
        state.options.runId !== entry.content.runId) ||
      !rememberEntry(state.seen, entry)
    ) {
      return;
    }
    try {
      state.listener(entry);
    } catch (error) {
      console.error("RoomEventLog listener failed", error);
    }
  }

  private async decryptRawEventsIfNecessary(
    rawEvents: readonly unknown[]
  ): Promise<unknown[]> {
    return Promise.all(
      rawEvents.map(async (rawEvent) => {
        if (
          isRecord(rawEvent) &&
          rawEvent.type === "m.room.encrypted" &&
          this.client.decryptEventIfNeeded
        ) {
          const matrixEvent = new MatrixEvent(rawEvent as any);
          await this.client.decryptEventIfNeeded(matrixEvent);
          return matrixEvent.getEffectiveEvent();
        }
        return rawEvent;
      })
    );
  }

  private toEntry(value: unknown): RoomEventLogEntry | undefined {
    if (!isRecord(value) || value.type !== RUN_EVENT_TYPE) {
      return undefined;
    }
    const content = parseRunEventContent(value.content);
    if (!content) {
      return undefined;
    }
    const eventId = value.event_id;
    const sender = value.sender ?? value.user_id;
    const originServerTs = value.origin_server_ts;
    if (
      !isIdentifier(eventId, 512) ||
      !isIdentifier(sender, 512) ||
      !isFiniteNonNegativeInteger(originServerTs)
    ) {
      return undefined;
    }
    const eventRoomId =
      isIdentifier(value.room_id, 512) ? value.room_id : this.roomId;
    if (eventRoomId !== this.roomId) {
      return undefined;
    }
    return {
      eventId,
      roomId: eventRoomId,
      sender,
      originServerTs,
      eventType: RUN_EVENT_TYPE,
      content,
    };
  }

  private paginationKey(
    runId: string,
    direction: RoomEventLogReadDirection,
    token: string
  ) {
    return `${runId}\u0000${direction}\u0000${token}`;
  }

  private rememberPagination(key: string, seen: Set<string>) {
    this.paginationSeen.set(key, new Set(seen));
    if (this.paginationSeen.size > MAX_CURSOR_SESSIONS) {
      const oldest = this.paginationSeen.keys().next().value;
      if (oldest !== undefined) {
        this.paginationSeen.delete(oldest);
      }
    }
  }

  public dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const subscription of [...this.subscriptions]) {
      subscription.disposed = true;
      if (subscription.retryTimer) {
        clearTimeout(subscription.retryTimer);
      }
      subscription.resolveRetry?.();
    }
    this.subscriptions.clear();
    this.pendingAppends.clear();
    this.successfulAppends.clear();
    this.paginationSeen.clear();
  }
}

function validateRunEventContent(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return ["content must be an object"];
  }
  if (!isJsonValue(value)) {
    issues.push("content must contain only finite JSON values");
  }
  allowedKeys(
    value,
    ["v", "runId", "blockId", "kind", "payload", "ts", "idempotencyKey"],
    "content",
    issues
  );
  if (value.v !== RUN_EVENT_SCHEMA_VERSION) {
    issues.push(`v must be ${RUN_EVENT_SCHEMA_VERSION}`);
  }
  if (!isIdentifier(value.runId, 256)) {
    issues.push("runId must be a non-empty string up to 256 characters");
  }
  if (
    value.blockId !== undefined &&
    !isIdentifier(value.blockId, 256)
  ) {
    issues.push("blockId must be a non-empty string up to 256 characters");
  }
  if (!isFiniteNonNegativeInteger(value.ts)) {
    issues.push("ts must be a non-negative integer");
  }
  if (
    typeof value.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/.test(value.idempotencyKey)
  ) {
    issues.push(
      "idempotencyKey must be 1-128 safe ASCII characters and start alphanumeric"
    );
  }
  if (!isRecord(value.payload)) {
    issues.push("payload must be an object");
    return issues;
  }
  if (!isJsonValue(value.payload)) {
    issues.push("payload must contain only finite JSON values");
    return issues;
  }

  switch (value.kind) {
    case "run.started":
      rejectBlockId(value, issues);
      validateRunStarted(value.payload, issues);
      break;
    case "run.closed":
      rejectBlockId(value, issues);
      validateRunClosed(value.payload, issues);
      break;
    case "run.cancelled":
      rejectBlockId(value, issues);
      validateRunCancelled(value.payload, issues);
      break;
    case "action.started":
      requireBlockId(value, issues);
      validateActionStarted(value.payload, issues);
      break;
    case "action.output":
      requireBlockId(value, issues);
      validateActionOutput(value.payload, issues);
      break;
    case "action.done":
      requireBlockId(value, issues);
      validateActionDone(value.payload, issues);
      break;
    case "action.failed":
      requireBlockId(value, issues);
      validateActionFailed(value.payload, issues);
      break;
    case "definition.changed":
      rejectBlockId(value, issues);
      validateDefinitionChanged(value.payload, issues);
      break;
    case "log":
      validateLog(value.payload, issues);
      break;
    default:
      issues.push(`unsupported kind: ${String(value.kind)}`);
  }
  return issues;
}

function validateRunStarted(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["invocationCid", "definitionRevision", "label"],
    "run.started payload",
    issues
  );
  optionalString(payload, "invocationCid", 512, issues);
  optionalString(payload, "definitionRevision", 512, issues);
  optionalString(payload, "label", 512, issues);
}

function validateRunClosed(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["invocationCid", "summary"],
    "run.closed payload",
    issues
  );
  optionalString(payload, "invocationCid", 512, issues);
  optionalRecord(payload, "summary", issues);
}

function validateRunCancelled(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["invocationCid", "reason", "summary"],
    "run.cancelled payload",
    issues
  );
  optionalString(payload, "invocationCid", 512, issues);
  optionalString(payload, "reason", 4_096, issues);
  optionalRecord(payload, "summary", issues);
}

function validateActionStarted(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["attempt", "executionId", "invocationCid", "input"],
    "action.started payload",
    issues
  );
  requiredAttempt(payload, issues);
  optionalString(payload, "executionId", 512, issues);
  optionalString(payload, "invocationCid", 512, issues);
}

function validateActionOutput(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["attempt", "executionId", "output"],
    "action.output payload",
    issues
  );
  requiredAttempt(payload, issues);
  optionalString(payload, "executionId", 512, issues);
  if (!Object.prototype.hasOwnProperty.call(payload, "output")) {
    issues.push("action.output payload.output is required");
  }
}

function validateActionDone(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["attempt", "executionId", "durationMs", "output"],
    "action.done payload",
    issues
  );
  requiredAttempt(payload, issues);
  optionalString(payload, "executionId", 512, issues);
  optionalDuration(payload, issues);
}

function validateActionFailed(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["attempt", "executionId", "durationMs", "error"],
    "action.failed payload",
    issues
  );
  requiredAttempt(payload, issues);
  optionalString(payload, "executionId", 512, issues);
  optionalDuration(payload, issues);
  if (!isRecord(payload.error)) {
    issues.push("action.failed payload.error must be an object");
    return;
  }
  allowedKeys(
    payload.error,
    ["message", "name", "code", "retryable", "details"],
    "action.failed payload.error",
    issues
  );
  if (!isIdentifier(payload.error.message, 16_384)) {
    issues.push("action.failed payload.error.message is required");
  }
  optionalString(payload.error, "name", 512, issues);
  optionalString(payload.error, "code", 512, issues);
  if (
    payload.error.retryable !== undefined &&
    typeof payload.error.retryable !== "boolean"
  ) {
    issues.push("action.failed payload.error.retryable must be boolean");
  }
}

function validateDefinitionChanged(payload: JsonObject, issues: string[]) {
  allowedKeys(
    payload,
    ["revision", "previousRevision", "changedBlockIds", "summary"],
    "definition.changed payload",
    issues
  );
  if (!isIdentifier(payload.revision, 512)) {
    issues.push("definition.changed payload.revision is required");
  }
  optionalString(payload, "previousRevision", 512, issues);
  optionalString(payload, "summary", 4_096, issues);
  if (payload.changedBlockIds !== undefined) {
    if (
      !Array.isArray(payload.changedBlockIds) ||
      payload.changedBlockIds.some((id) => !isIdentifier(id, 256))
    ) {
      issues.push(
        "definition.changed payload.changedBlockIds must be an array of block ids"
      );
    }
  }
}

function validateLog(payload: JsonObject, issues: string[]) {
  allowedKeys(payload, ["level", "message", "data"], "log payload", issues);
  if (!["debug", "info", "warn", "error"].includes(String(payload.level))) {
    issues.push("log payload.level must be debug, info, warn, or error");
  }
  if (!isIdentifier(payload.message, 16_384)) {
    issues.push("log payload.message is required");
  }
}

function rejectBlockId(value: JsonObject, issues: string[]) {
  if (value.blockId !== undefined) {
    issues.push(`${String(value.kind)} must not include blockId`);
  }
}

function requireBlockId(value: JsonObject, issues: string[]) {
  if (!isIdentifier(value.blockId, 256)) {
    issues.push(`${String(value.kind)} requires blockId`);
  }
}

function requiredAttempt(payload: JsonObject, issues: string[]) {
  if (
    !Number.isInteger(payload.attempt) ||
    typeof payload.attempt !== "number" ||
    payload.attempt < 1
  ) {
    issues.push("action payload.attempt must be an integer >= 1");
  }
}

function optionalDuration(payload: JsonObject, issues: string[]) {
  if (
    payload.durationMs !== undefined &&
    !isFiniteNonNegativeNumber(payload.durationMs)
  ) {
    issues.push("action payload.durationMs must be a finite non-negative number");
  }
}

function optionalString(
  value: JsonObject,
  key: string,
  maxLength: number,
  issues: string[]
) {
  if (value[key] !== undefined && !isIdentifier(value[key], maxLength)) {
    issues.push(`${key} must be a non-empty string up to ${maxLength} characters`);
  }
}

function optionalRecord(
  value: JsonObject,
  key: string,
  issues: string[]
) {
  if (value[key] !== undefined && !isRecord(value[key])) {
    issues.push(`${key} must be an object`);
  }
}

function allowedKeys(
  value: JsonObject,
  keys: readonly string[],
  label: string,
  issues: string[]
) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(`${label} contains unknown field "${key}"`);
    }
  }
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : isRecord(value) &&
      Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function isRecord(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0
  );
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : fallback;
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number
) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function boundedLimit(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_LIMIT) {
    throw new RunEventValidationError([
      `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
    ]);
  }
  return value;
}

function entryIdentities(entry: RoomEventLogEntry) {
  return [
    `event:${entry.eventId}`,
    `key:${entry.content.runId}\u0000${entry.content.idempotencyKey}`,
  ];
}

function rememberEntry(seen: Set<string>, entry: RoomEventLogEntry) {
  const identities = entryIdentities(entry);
  const duplicate = identities.some((identity) => seen.has(identity));
  for (const identity of identities) {
    seen.add(identity);
  }
  return !duplicate;
}

function canonicalJson(value: JsonValue | RunEventInput): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(
          (value as unknown as Record<string, JsonValue>)[key]
        )}`
    )
    .join(",")}}`;
}
