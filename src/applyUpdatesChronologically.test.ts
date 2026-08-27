import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyUpdatesChronologically } from "./MatrixProvider";

/**
 * Build a doc through sequential edits and capture the incremental update
 * for each one, mirroring how a room's timeline accumulates causally
 * dependent doc_update events.
 */
function incrementalUpdates(edits: number): {
  updates: Uint8Array[];
  expected: Record<string, unknown>;
} {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on("update", (update: Uint8Array) => updates.push(update));
  const map = doc.getMap("m");
  for (let i = 0; i < edits; i++) {
    map.set(`k${i}`, i);
  }
  const expected = map.toJSON();
  doc.destroy();
  return { updates, expected };
}

describe("applyUpdatesChronologically", () => {
  it("reproduces the document from a newest-first catch-up list", () => {
    const { updates, expected } = incrementalUpdates(100);
    const newestFirst: (Uint8Array | undefined)[] = [...updates].reverse();

    const doc = new Y.Doc();
    applyUpdatesChronologically(doc, newestFirst);

    expect(doc.getMap("m").toJSON()).toEqual(expected);
    expect((doc.store as any).pendingStructs).toBeNull();
    doc.destroy();
  });

  it("never parks an update in the pending-structs buffer", () => {
    // This is the regression assertion for the catch-up OOM: applying the
    // walk's newest-first order directly makes every transaction leave
    // pendingStructs non-null, and Yjs re-encodes that whole buffer on each
    // subsequent apply (quadratic). Chronological application must keep the
    // buffer empty after every single transaction.
    const { updates } = incrementalUpdates(50);
    const newestFirst: (Uint8Array | undefined)[] = [...updates].reverse();

    const doc = new Y.Doc();
    let transactions = 0;
    doc.on("afterTransaction", () => {
      transactions++;
      expect((doc.store as any).pendingStructs).toBeNull();
    });
    applyUpdatesChronologically(doc, newestFirst);

    expect(transactions).toBe(50);
    doc.destroy();
  });

  it("releases each entry of the input array as it is applied", () => {
    const { updates } = incrementalUpdates(10);
    const newestFirst: (Uint8Array | undefined)[] = [...updates].reverse();

    const doc = new Y.Doc();
    applyUpdatesChronologically(doc, newestFirst);

    expect(newestFirst.every((entry) => entry === undefined)).toBe(true);
    doc.destroy();
  });

  it("skips entries that are already undefined", () => {
    const { updates, expected } = incrementalUpdates(5);
    const newestFirst: (Uint8Array | undefined)[] = [...updates].reverse();
    // A caller may have filtered an unreadable event; the helper must not
    // choke on the hole.
    newestFirst.splice(2, 0, undefined);

    const doc = new Y.Doc();
    applyUpdatesChronologically(doc, newestFirst);

    expect(doc.getMap("m").toJSON()).toEqual(expected);
    doc.destroy();
  });
});
