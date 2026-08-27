import type { MatrixClient } from "matrix-js-sdk";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { applyUpdatesChronologically } from "../MatrixProvider";
import { encodeBase64 } from "../util/olmlib";
import { MatrixReader, SnapshotUnavailableError } from "./MatrixReader";

const ROOM_ID = "!room:example.org";
const WRITER = "@writer:example.org";

function yUpdate(mutate: (doc: Y.Doc) => void): Uint8Array {
  const doc = new Y.Doc();
  mutate(doc);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

function updateEvent(id: string, update: Uint8Array) {
  return {
    type: "matrix-crdt.doc_update",
    event_id: id,
    room_id: ROOM_ID,
    user_id: WRITER,
    content: { update: encodeBase64(update) },
  };
}

function snapshotEvent(id: string, update: Uint8Array, lastEventId: string) {
  return {
    type: "matrix-crdt.doc_snapshot",
    event_id: id,
    room_id: ROOM_ID,
    user_id: WRITER,
    content: { update: encodeBase64(update), last_event_id: lastEventId },
  };
}

/**
 * Backward pagination fake: each page is one /messages response, newest page
 * first, mirroring Direction.Backward. Tokens chain page-N → page-N+1 and the
 * final page repeats its token so `hasNextPage` terminates.
 */
function fakeClient(pages: any[][]): MatrixClient {
  let call = 0;
  return {
    credentials: { userId: WRITER },
    getUserId: () => WRITER,
    createMessagesRequest: vi.fn(async () => {
      const index = Math.min(call, pages.length - 1);
      const isLast = call >= pages.length - 1;
      call++;
      return {
        chunk: pages[index],
        start: `t${index}`,
        end: isLast ? `t${index}` : `t${index + 1}`,
      };
    }),
  } as unknown as MatrixClient;
}

function makeReader(client: MatrixClient): MatrixReader {
  return new MatrixReader(
    client,
    ROOM_ID,
    new MatrixCRDTEventTranslator()
  );
}

describe("streamInitialDocumentUpdateEvents", () => {
  it("delivers the same events as the accumulating variant, page by page", async () => {
    const updateA = yUpdate((doc) => doc.getMap("m").set("a", 1));
    const updateB = yUpdate((doc) => doc.getMap("m").set("b", 2));
    const pages = [
      [updateEvent("$u2", updateB)],
      [updateEvent("$u1", updateA)],
    ];

    const accumulated = await makeReader(
      fakeClient(pages)
    ).getInitialDocumentUpdateEvents();

    const streamedBatches: any[][] = [];
    await makeReader(fakeClient(pages)).streamInitialDocumentUpdateEvents(
      (events) => {
        streamedBatches.push(events);
      }
    );

    expect(streamedBatches.length).toBe(2);
    const streamedIds = streamedBatches.flat().map((event) => event.event_id);
    expect(new Set(streamedIds)).toEqual(
      new Set(accumulated.map((event: any) => event.event_id))
    );
  });

  it("produces the same document state as the accumulating variant", async () => {
    const updateA = yUpdate((doc) => doc.getMap("m").set("a", "alpha"));
    const updateB = yUpdate((doc) => doc.getMap("m").set("b", "beta"));
    const updateC = yUpdate((doc) => doc.getMap("m").set("c", "gamma"));
    const pages = [
      [updateEvent("$u3", updateC)],
      [updateEvent("$u2", updateB)],
      [updateEvent("$u1", updateA)],
    ];
    const translator = new MatrixCRDTEventTranslator();

    const accumulatedDoc = new Y.Doc();
    const accumulated = await makeReader(
      fakeClient(pages)
    ).getInitialDocumentUpdateEvents();
    for (const event of accumulated) {
      Y.applyUpdate(accumulatedDoc, translator.getUpdateBytes(event)!);
    }

    const streamedDoc = new Y.Doc();
    await makeReader(fakeClient(pages)).streamInitialDocumentUpdateEvents(
      (events) => {
        for (const event of events) {
          Y.applyUpdate(streamedDoc, translator.getUpdateBytes(event)!);
        }
      }
    );

    expect(streamedDoc.getMap("m").toJSON()).toEqual(
      accumulatedDoc.getMap("m").toJSON()
    );
    expect(Y.encodeStateVector(streamedDoc)).toEqual(
      Y.encodeStateVector(accumulatedDoc)
    );
  });

  it("stops at a readable snapshot boundary and never emits older history", async () => {
    const snapshotState = yUpdate((doc) => doc.getMap("m").set("s", "snap"));
    const newer = yUpdate((doc) => doc.getMap("m").set("n", "new"));
    const ancient = yUpdate((doc) => doc.getMap("m").set("z", "old"));
    const pages = [
      [
        updateEvent("$after", newer),
        snapshotEvent("$snap", snapshotState, "$boundary"),
        updateEvent("$boundary", yUpdate(() => undefined)),
        updateEvent("$ancient", ancient),
      ],
      [updateEvent("$never-fetched", ancient)],
    ];

    const client = fakeClient(pages);
    const emitted: string[] = [];
    await makeReader(client).streamInitialDocumentUpdateEvents((events) => {
      emitted.push(...events.map((event) => event.event_id));
    });

    expect(emitted).toEqual(["$after", "$snap"]);
    // The walk stopped at the boundary inside page 1: page 2 was never fetched.
    expect(
      (client.createMessagesRequest as ReturnType<typeof vi.fn>).mock.calls
        .length
    ).toBe(1);
  });

  it("rebuilds a causally-dependent history when collected and applied chronologically", async () => {
    // Sequential edits to ONE doc: each update depends on the previous one,
    // unlike the independent-doc fixtures above. This mirrors a real room
    // timeline and would catch a consumer applying the newest-first stream
    // order directly (the catch-up OOM regression).
    const sourceDoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    sourceDoc.on("update", (update: Uint8Array) => updates.push(update));
    const sourceMap = sourceDoc.getMap("m");
    for (let i = 0; i < 90; i++) {
      sourceMap.set(`k${i}`, i);
    }
    const expected = sourceMap.toJSON();
    sourceDoc.destroy();

    // Newest page first, newest event first within each page (Direction.Backward).
    const chronological = updates.map((update, i) =>
      updateEvent(`$u${i}`, update)
    );
    const newestFirst = [...chronological].reverse();
    const pages: any[][] = [];
    for (let i = 0; i < newestFirst.length; i += 30) {
      pages.push(newestFirst.slice(i, i + 30));
    }

    const translator = new MatrixCRDTEventTranslator();
    const collected: (Uint8Array | undefined)[] = [];
    await makeReader(fakeClient(pages)).streamInitialDocumentUpdateEvents(
      (events) => {
        for (const event of events) {
          collected.push(translator.getUpdateBytes(event));
        }
      }
    );

    const doc = new Y.Doc();
    doc.on("afterTransaction", () => {
      expect((doc.store as any).pendingStructs).toBeNull();
    });
    applyUpdatesChronologically(doc, collected);

    expect(doc.getMap("m").toJSON()).toEqual(expected);
    doc.destroy();
  });

  it("throws SnapshotUnavailableError when only unreadable snapshots exist", async () => {
    const pages = [
      [
        {
          type: "matrix-crdt.doc_snapshot_v2",
          event_id: "$broken",
          room_id: ROOM_ID,
          user_id: WRITER,
          content: { junk: true },
        },
      ],
    ];

    await expect(
      makeReader(fakeClient(pages)).streamInitialDocumentUpdateEvents(
        () => undefined
      )
    ).rejects.toBeInstanceOf(SnapshotUnavailableError);
  });

  it("does not throw on a degraded snapshot when readable updates exist", async () => {
    const update = yUpdate((doc) => doc.getMap("m").set("a", 1));
    const pages = [
      [
        updateEvent("$u1", update),
        {
          type: "matrix-crdt.doc_snapshot_v2",
          event_id: "$broken",
          room_id: ROOM_ID,
          user_id: WRITER,
          content: { junk: true },
        },
      ],
    ];

    const emitted: string[] = [];
    await makeReader(fakeClient(pages)).streamInitialDocumentUpdateEvents(
      (events) => {
        emitted.push(...events.map((event) => event.event_id));
      }
    );

    expect(emitted).toEqual(["$u1"]);
  });
});
