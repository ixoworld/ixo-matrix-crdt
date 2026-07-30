import { afterEach, describe, expect, it } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import {
  parseRunEventContent,
  RoomEventLog,
  RUN_EVENT_SCHEMA_VERSION,
  RUN_EVENT_TYPE,
  RunEventContent,
  RunEventIdempotencyConflictError,
  RunEventInput,
  RunEventValidationError,
} from "./RoomEventLog";
import { FakeHomeserver } from "./test-utils/fakeHomeserver";
import { ENCRYPTED_TIMELINE_EVENT_TYPE } from "./util/timelineFilter";

const logs: RoomEventLog[] = [];

// Compile-time contract: consumers can pass their SDK client directly even
// though IRoomEventLog and its entries do not expose matrix-js-sdk types.
function acceptsMatrixClient(client: MatrixClient) {
  if (false) {
    return new RoomEventLog(client, "!compile-contract:example.org");
  }
}
void acceptsMatrixClient;

afterEach(() => {
  while (logs.length) {
    logs.pop()!.dispose();
  }
});

function createLog(
  hs: FakeHomeserver,
  roomId: string,
  userId = "@alice:fake",
  successfulAppendCacheSize?: number
) {
  const log = new RoomEventLog(hs.createClient(userId) as any, roomId, {
    pollTimeoutMs: 25,
    pollRetryDelayMs: 5,
    now: () => 1_785_302_400_000,
    successfulAppendCacheSize,
  });
  logs.push(log);
  return log;
}

function logInput(
  runId: string,
  idempotencyKey: string,
  message: string
): RunEventInput {
  return {
    runId,
    kind: "log",
    idempotencyKey,
    payload: { level: "info", message },
  };
}

function wireLog(
  runId: string,
  idempotencyKey: string,
  message: string
): RunEventContent {
  return {
    ...logInput(runId, idempotencyKey, message),
    v: RUN_EVENT_SCHEMA_VERSION,
    ts: 1_785_302_400_000,
  } as RunEventContent;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("run event v1 schema", () => {
  it("accepts every lifecycle, action, definition, and log variant", () => {
    const common = {
      v: RUN_EVENT_SCHEMA_VERSION,
      runId: "r-0007",
      ts: 1_785_302_400_000,
    } as const;
    const variants: RunEventContent[] = [
      {
        ...common,
        kind: "run.started",
        idempotencyKey: "run-started-7",
        payload: {
          invocationCid: "bafy-start",
          definitionRevision: "rev-12",
        },
      },
      {
        ...common,
        kind: "run.closed",
        idempotencyKey: "run-closed-7",
        payload: {
          invocationCid: "bafy-close",
          summary: { completed: 4 },
        },
      },
      {
        ...common,
        kind: "run.cancelled",
        idempotencyKey: "run-cancelled-7",
        payload: { reason: "operator request" },
      },
      {
        ...common,
        blockId: "block-a",
        kind: "action.started",
        idempotencyKey: "action-started-7-a-1",
        payload: { attempt: 1, executionId: "execution-1" },
      },
      {
        ...common,
        blockId: "block-a",
        kind: "action.output",
        idempotencyKey: "action-output-7-a-1",
        payload: { attempt: 1, output: { claimId: "claim-1" } },
      },
      {
        ...common,
        blockId: "block-a",
        kind: "action.done",
        idempotencyKey: "action-done-7-a-1",
        payload: { attempt: 1, durationMs: 42 },
      },
      {
        ...common,
        blockId: "block-b",
        kind: "action.failed",
        idempotencyKey: "action-failed-7-b-1",
        payload: {
          attempt: 1,
          error: {
            message: "proof missing",
            code: "PROOF_MISSING",
            retryable: true,
          },
        },
      },
      {
        ...common,
        kind: "definition.changed",
        idempotencyKey: "definition-changed-7-13",
        payload: {
          revision: "rev-13",
          previousRevision: "rev-12",
          changedBlockIds: ["block-a"],
        },
      },
      {
        ...common,
        blockId: "block-a",
        kind: "log",
        idempotencyKey: "log-7-a-1",
        payload: {
          level: "warn",
          message: "retrying",
          data: { inMs: 500 },
        },
      },
    ];

    for (const variant of variants) {
      expect(parseRunEventContent(variant)).toBe(variant);
    }
  });

  it("rejects unknown versions, fields, kinds, non-JSON data, and misplaced block ids", () => {
    const valid = wireLog("r-1", "log-r1-1", "hello");
    expect(parseRunEventContent({ ...valid, v: 2 })).toBeUndefined();
    expect(
      parseRunEventContent({ ...valid, surprise: true })
    ).toBeUndefined();
    expect(
      parseRunEventContent({ ...valid, kind: "action.exploded" })
    ).toBeUndefined();
    expect(
      parseRunEventContent({
        ...valid,
        kind: "action.done",
        payload: { attempt: 1 },
      })
    ).toBeUndefined();
    expect(
      parseRunEventContent({
        ...valid,
        kind: "run.closed",
        blockId: "block-a",
        payload: {},
      })
    ).toBeUndefined();

    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(
      parseRunEventContent({
        ...valid,
        payload: { level: "info", message: "bad", data: cyclic },
      })
    ).toBeUndefined();
  });
});

describe("append idempotency", () => {
  it("keeps only in-flight promises and moves completed keys into the success cache", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!append-cleanup:fake");
    const client: any = hs.createClient();
    let releaseSend: (() => void) | undefined;
    const sendEvent = client.sendEvent.bind(client);
    client.sendEvent = async (...args: any[]) => {
      await new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      return sendEvent(...args);
    };
    const log = new RoomEventLog(client, roomId, {
      now: () => 1_785_302_400_000,
    });
    logs.push(log);

    const first = log.append(logInput("r-1", "in-flight-once", "one"));
    const second = log.append(logInput("r-1", "in-flight-once", "one"));

    expect(first).toBe(second);
    expect((log as any).pendingAppends.size).toBe(1);
    releaseSend?.();
    const eventId = await first;

    expect((log as any).pendingAppends.size).toBe(0);
    expect((log as any).successfulAppends.get("in-flight-once")).toEqual({
      eventId,
      fingerprint: expect.any(String),
    });
  });

  it("bounds the successful fingerprint and event-id cache", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!append-cache-bound:fake");
    const log = createLog(hs, roomId, "@alice:fake", 2);

    await log.append(logInput("r-1", "cache-a", "A"));
    await log.append(logInput("r-1", "cache-b", "B"));
    await log.append(logInput("r-1", "cache-c", "C"));

    expect([...((log as any).successfulAppends as Map<string, unknown>).keys()])
      .toEqual(["cache-b", "cache-c"]);
    expect((log as any).pendingAppends.size).toBe(0);
  });

  it("clears in-flight and successful dedupe state on dispose", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!append-dispose:fake");
    const client: any = hs.createClient();
    const originalSendEvent = client.sendEvent.bind(client);
    let releaseSend: (() => void) | undefined;
    client.sendEvent = async (...args: any[]) => {
      await new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      return originalSendEvent(...args);
    };
    const log = new RoomEventLog(client, roomId, {
      now: () => 1_785_302_400_000,
    });
    logs.push(log);

    const completedInput = logInput("r-1", "before-dispose", "completed");
    client.sendEvent = originalSendEvent;
    await log.append(completedInput);
    client.sendEvent = async (...args: any[]) => {
      await new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      return originalSendEvent(...args);
    };
    const inFlight = log.append(
      logInput("r-1", "during-dispose", "in flight")
    );

    expect((log as any).successfulAppends.size).toBe(1);
    expect((log as any).pendingAppends.size).toBe(1);
    log.dispose();

    expect((log as any).successfulAppends.size).toBe(0);
    expect((log as any).pendingAppends.size).toBe(0);
    releaseSend?.();
    await inFlight;
    expect((log as any).successfulAppends.size).toBe(0);
    expect((log as any).pendingAppends.size).toBe(0);
  });

  it("persists a v1 key, reuses the Matrix transaction, and emits one local echo", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!append:fake");
    const log = createLog(hs, roomId);
    const delivered: string[] = [];
    const subscription = log.subscribe((entry) => {
      delivered.push(entry.eventId);
      expect(entry.localEcho).toBe(true);
    });

    const input = logInput("r-1", "log-r1-once", "only once");
    const first = await log.append(input);
    const second = await log.append({
      payload: { message: "only once", level: "info" },
      idempotencyKey: "log-r1-once",
      kind: "log",
      runId: "r-1",
    });

    expect(second).toBe(first);
    expect(hs.eventsOfType(roomId, RUN_EVENT_TYPE)).toHaveLength(1);
    expect(hs.eventsOfType(roomId, RUN_EVENT_TYPE)[0].content).toMatchObject({
      v: RUN_EVENT_SCHEMA_VERSION,
      idempotencyKey: "log-r1-once",
      ts: 1_785_302_400_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(delivered).toEqual([first]);
    subscription.dispose();
  });

  it("deduplicates the same key after a new RoomEventLog instance", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!restart:fake");
    const firstLog = createLog(hs, roomId);
    const first = await firstLog.append(
      logInput("r-1", "log-r1-restart", "survives restart")
    );
    firstLog.dispose();

    const secondLog = createLog(hs, roomId);
    const second = await secondLog.append(
      logInput("r-1", "log-r1-restart", "survives restart")
    );

    expect(second).toBe(first);
    expect(hs.eventsOfType(roomId, RUN_EVENT_TYPE)).toHaveLength(1);
  });

  it("rejects key reuse with different content in one instance", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!conflict:fake");
    const log = createLog(hs, roomId);
    await log.append(logInput("r-1", "log-r1-conflict", "first"));

    await expect(
      log.append(logInput("r-1", "log-r1-conflict", "different"))
    ).rejects.toBeInstanceOf(RunEventIdempotencyConflictError);
    expect(hs.eventsOfType(roomId, RUN_EVENT_TYPE)).toHaveLength(1);
  });

  it("validates before sending", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!invalid:fake");
    const log = createLog(hs, roomId);

    await expect(
      log.append({
        runId: "r-1",
        kind: "action.done",
        idempotencyKey: "missing-block",
        payload: { attempt: 1 },
      } as any)
    ).rejects.toBeInstanceOf(RunEventValidationError);
    expect(hs.eventsOfType(roomId, RUN_EVENT_TYPE)).toHaveLength(0);
  });
});

describe("filtered run history pagination", () => {
  it("filters by event type and run, preserves order, and dedupes keys across pages", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!pages:fake");
    const client = hs.createClient("@writer:fake");

    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "key-a", "oldest A"),
      "raw-a-old"
    );
    // Duplicate idempotency key under a different transaction simulates two
    // actors racing the same logical append.
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "key-a", "duplicate A"),
      "raw-a-new"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-2", "key-other", "other run"),
      "raw-other"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "key-b", "middle B"),
      "raw-b"
    );
    await client.sendEvent(
      roomId,
      "matrix-crdt.doc_update",
      { update: "not relevant" },
      "raw-update"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "key-c", "newest C"),
      "raw-c"
    );

    const log = createLog(hs, roomId, "@reader:fake");
    const first = await log.read("r-1", { limit: 1 });
    const second = await log.read("r-1", {
      limit: 1,
      from: first.nextToken,
    });
    const third = await log.read("r-1", {
      limit: 1,
      from: second.nextToken,
    });
    const fourth = await log.read("r-1", {
      limit: 1,
      from: third.nextToken,
    });

    expect(first.events[0].content.payload).toMatchObject({
      message: "newest C",
    });
    expect(second.events[0].content.payload).toMatchObject({
      message: "middle B",
    });
    // Backward pagination keeps the newest physical event for a duplicated
    // logical key and carries the key-set into the next page.
    expect(third.events[0].content.payload).toMatchObject({
      message: "duplicate A",
    });
    expect(fourth.events).toHaveLength(0);
    expect(fourth.nextToken).toBeUndefined();
    expect(
      hs.messagesRequestTypeFilters.every(
        (types) =>
          types?.length === 2 &&
          types[0] === RUN_EVENT_TYPE &&
          types[1] === ENCRYPTED_TIMELINE_EVENT_TYPE
      )
    ).toBe(true);
  });

  it("supports oldest-first reads and retains authoritative Matrix metadata", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!forward:fake");
    const client = hs.createClient("@writer:fake");
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "forward-a", "A"),
      "forward-a"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "forward-b", "B"),
      "forward-b"
    );

    const log = createLog(hs, roomId);
    const page = await log.read("r-1", {
      direction: "forward",
      limit: 10,
    });

    expect(
      page.events.map((entry) => (entry.content.payload as any).message)
    ).toEqual(["A", "B"]);
    expect(page.events[0]).toMatchObject({
      roomId,
      sender: "@writer:fake",
      eventType: RUN_EVENT_TYPE,
    });
    expect(page.events[0].originServerTs).toEqual(expect.any(Number));
  });

  it("skips redacted, malformed, and unknown-version events", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!malformed:fake");
    const client = hs.createClient();
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      { ...wireLog("r-1", "bad-version", "bad"), v: 99 },
      "bad-version"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      {},
      "redacted-shape"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "valid-after-bad", "valid"),
      "valid"
    );

    const log = createLog(hs, roomId);
    const page = await log.read("r-1");
    expect(page.events).toHaveLength(1);
    expect(page.events[0].content.idempotencyKey).toBe("valid-after-bad");
  });

  it("reads encrypted envelopes after client-side decryption", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!encrypted-log:fake", { encrypted: true });
    const client: any = hs.createClient("@reader:fake");
    const clearEvent = {
      type: RUN_EVENT_TYPE,
      content: wireLog("r-1", "encrypted-log", "secret"),
    };
    await client.sendEvent(
      roomId,
      ENCRYPTED_TIMELINE_EVENT_TYPE,
      { algorithm: "fake.megolm" },
      "encrypted-log"
    );
    client.decryptEventIfNeeded = async (event: any) => {
      event.clearEvent = clearEvent;
    };

    const log = new RoomEventLog(client, roomId);
    logs.push(log);
    const page = await log.read("r-1");
    expect(page.events).toHaveLength(1);
    expect(page.events[0].content.idempotencyKey).toBe("encrypted-log");
  });
});

describe("live subscriptions", () => {
  it("starts at the live edge, filters a run, and dedupes external and local echoes", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!subscribe:fake");
    const external = hs.createClient("@external:fake");
    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "before-subscribe", "not replayed"),
      "before"
    );

    const log = createLog(hs, roomId);
    const delivered: string[] = [];
    const subscription = log.subscribe(
      (entry) => delivered.push(entry.content.idempotencyKey),
      { runId: "r-1" }
    );
    await new Promise((resolve) => setTimeout(resolve, 40));

    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-2", "wrong-run", "ignored"),
      "wrong-run"
    );
    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "external-once", "external"),
      "external-1"
    );
    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "external-once", "duplicate"),
      "external-2"
    );
    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      { ...wireLog("r-1", "invalid-live", "bad"), kind: "unknown" },
      "invalid"
    );
    await log.append(logInput("r-1", "local-once", "local"));

    await waitFor(
      () =>
        delivered.includes("external-once") &&
        delivered.includes("local-once")
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(delivered).toEqual(
      expect.arrayContaining(["external-once", "local-once"])
    );
    expect(delivered).not.toContain("before-subscribe");
    expect(delivered).not.toContain("wrong-run");
    expect(delivered).not.toContain("invalid-live");
    expect(delivered.filter((key) => key === "external-once")).toHaveLength(1);
    expect(delivered.filter((key) => key === "local-once")).toHaveLength(1);

    subscription.dispose();
    await external.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      wireLog("r-1", "after-dispose", "ignored"),
      "after-dispose"
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(delivered).not.toContain("after-dispose");
  });
});
