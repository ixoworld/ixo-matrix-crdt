import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import {
  RUN_EVENT_SCHEMA_VERSION,
  RUN_EVENT_TYPE,
} from "../RoomEventLog";
import { FakeHomeserver } from "../test-utils/fakeHomeserver";
import { ENCRYPTED_TIMELINE_EVENT_TYPE } from "../util/timelineFilter";
import { MatrixReader } from "./MatrixReader";

describe("filtered initial document catch-up (IXO-4117)", () => {
  it("derives the server filter from the translator's configured read types", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!filtered:fake");
    const client = hs.createClient("@alice:fake");
    const translator = new MatrixCRDTEventTranslator({
      updateEventType: "custom.doc_update",
      snapshotEventType: "custom.doc_snapshot",
      snapshotV2EventType: "custom.doc_snapshot_v2",
    });
    const source = new Y.Doc();
    const updates: Uint8Array[] = [];
    source.on("update", (update: Uint8Array) => updates.push(update));

    source.getText("body").insert(0, "one");
    await translator.sendUpdate(client as any, roomId, updates.shift()!);
    // A large timeline burst must not consume catch-up pages.
    for (let index = 0; index < 100; index++) {
      await client.sendEvent(
        roomId,
        RUN_EVENT_TYPE,
        {
          v: RUN_EVENT_SCHEMA_VERSION,
          runId: "r-1",
          kind: "log",
          payload: { level: "info", message: `log ${index}` },
          ts: index,
          idempotencyKey: `filter-log-${index}`,
        },
        `filter-log-${index}`
      );
    }
    source.getText("body").insert(3, "-two");
    await translator.sendUpdate(client as any, roomId, updates.shift()!);

    const reader = new MatrixReader(
      client as any,
      roomId,
      translator
    );
    try {
      const events = await reader.getInitialDocumentUpdateEvents();
      expect(events).toHaveLength(2);
      expect(events.every((event) => translator.isUpdateEvent(event))).toBe(
        true
      );
      expect(hs.messagesRequestCount).toBe(1);
      expect(hs.messagesRequestTypeFilters).toEqual([
        [
          "custom.doc_update",
          "custom.doc_snapshot",
          "custom.doc_snapshot_v2",
          ENCRYPTED_TIMELINE_EVENT_TYPE,
        ],
      ]);
    } finally {
      reader.dispose();
    }
  });

  it("uses an explicit type filter for the legacy generic-reader overload", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!type-filter:fake");
    const client = hs.createClient();
    await client.sendEvent(
      roomId,
      "m.room.message",
      { msgtype: "m.text", body: "hello" },
      "message"
    );
    await client.sendEvent(
      roomId,
      RUN_EVENT_TYPE,
      {
        v: RUN_EVENT_SCHEMA_VERSION,
        runId: "r-1",
        kind: "log",
        payload: { level: "info", message: "ignored" },
        ts: 1,
        idempotencyKey: "type-filter-log",
      },
      "log"
    );
    const reader = new MatrixReader(
      client as any,
      roomId,
      new MatrixCRDTEventTranslator()
    );
    try {
      const events = await reader.getInitialDocumentUpdateEvents(
        "m.room.message"
      );
      expect(events).toHaveLength(1);
      expect(events[0].content.body).toBe("hello");
      expect(hs.messagesRequestTypeFilters).toEqual([
        ["m.room.message", ENCRYPTED_TIMELINE_EVENT_TYPE],
      ]);
    } finally {
      reader.dispose();
    }
  });

  it("keeps encrypted envelopes in the filter and filters after decryption", async () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!encrypted-filter:fake", {
      encrypted: true,
    });
    const client: any = hs.createClient();
    const clearEvent = {
      type: "matrix-crdt.doc_update",
      content: { update: "AA==" },
    };
    await client.sendEvent(
      roomId,
      ENCRYPTED_TIMELINE_EVENT_TYPE,
      { algorithm: "fake.megolm" },
      "encrypted-update"
    );
    client.decryptEventIfNeeded = async (event: any) => {
      event.clearEvent = clearEvent;
    };

    const translator = new MatrixCRDTEventTranslator();
    const reader = new MatrixReader(client, roomId, translator);
    try {
      const events = await reader.getInitialDocumentUpdateEvents();
      expect(events).toHaveLength(1);
      expect(translator.isUpdateEvent(events[0])).toBe(true);
      expect(translator.getUpdateBytes(events[0])).toBeDefined();
      expect(hs.messagesRequestTypeFilters[0]).toContain(
        ENCRYPTED_TIMELINE_EVENT_TYPE
      );
    } finally {
      reader.dispose();
    }
  });

  it("does not let run-log bursts distort snapshot election cadence", () => {
    const hs = new FakeHomeserver();
    const roomId = hs.createRoom("!election:fake");
    const client = hs.createClient("@alice:fake");
    const translator = new MatrixCRDTEventTranslator();
    const reader = new MatrixReader(client as any, roomId, translator, {
      snapshotInterval: 2,
    });
    const update = {
      type: "matrix-crdt.doc_update",
      content: { update: "AA==" },
      room_id: roomId,
      user_id: "@alice:fake",
    };
    const logEvents = Array.from({ length: 29 }, (_, index) => ({
      type: RUN_EVENT_TYPE,
      room_id: roomId,
      user_id: "@alice:fake",
      content: { idempotencyKey: `election-${index}` },
    }));

    try {
      expect(
        (reader as any).processIncomingEventsForSnapshot([update])
      ).toBe(false);
      expect(
        (reader as any).processIncomingEventsForSnapshot(logEvents)
      ).toBe(false);
      expect(
        (reader as any).processIncomingEventsForSnapshot([update])
      ).toBe(true);
    } finally {
      reader.dispose();
    }
  });
});
