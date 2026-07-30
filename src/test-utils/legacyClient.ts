/**
 * FROZEN copy of the pre-IXO-4116 ("old build") read path.
 *
 * Source: matrix-crdt @ 4dfc2f6 —
 *   `MatrixCRDTEventTranslator.isUpdateEvent` / `isSnapshotEvent`
 *   `MatrixReader.getInitialDocumentUpdateEvents`
 *   `MatrixProvider.processIncomingEvents`
 *
 * DO NOT UPDATE THIS FILE when the real implementation changes. Its whole
 * purpose is to model a client that is already deployed in the wild and cannot
 * be told to stand down. If it is kept in sync with `src/`, it stops testing
 * anything.
 *
 * The only adaptations are mechanical: instance fields become locals/params,
 * and `decryptRawEventsIfNecessary` is dropped (the fake homeserver never
 * produces `m.room.encrypted` events).
 */
import * as Y from "yjs";
import { decodeBase64 } from "../util/olmlib";

const LEGACY_UPDATE_EVENT_TYPE = "matrix-crdt.doc_update";
const LEGACY_SNAPSHOT_EVENT_TYPE = "matrix-crdt.doc_snapshot";

export const legacyTranslator = {
  isUpdateEvent(event: any) {
    return event.type === LEGACY_UPDATE_EVENT_TYPE;
  },
  isSnapshotEvent(event: any) {
    return event.type === LEGACY_SNAPSHOT_EVENT_TYPE;
  },
};

export async function legacyGetInitialDocumentUpdateEvents(
  matrixClient: any,
  roomId: string,
  typeFilter?: string
) {
  const translator = legacyTranslator;
  let latestToken: string | undefined;
  let messagesSinceSnapshot = 0;
  let ret: any[] = [];
  let token = "";
  let hasNextPage = true;
  let lastEventInSnapshot: string | undefined;
  while (hasNextPage) {
    const res = await matrixClient.createMessagesRequest(
      roomId,
      token,
      30,
      "b"
    );

    const events = res.chunk;

    for (let event of events) {
      if (typeFilter) {
        if (event.type === typeFilter) {
          ret.push(event);
        }
      } else if (translator.isSnapshotEvent(event)) {
        ret.push(event);
        lastEventInSnapshot = event.content.last_event_id;
      } else if (translator.isUpdateEvent(event)) {
        if (lastEventInSnapshot && lastEventInSnapshot === event.event_id) {
          if (!latestToken) {
            latestToken = res.start;
          }
          return ret.reverse();
        }
        messagesSinceSnapshot++;
        ret.push(event);
      }
    }

    token = res.end || "";
    if (!latestToken) {
      latestToken = res.start;
    }
    hasNextPage = !!(res.start !== res.end && res.end);
  }
  return ret.reverse();
}

export function legacyProcessIncomingEvents(doc: Y.Doc, events: any[]) {
  const translator = legacyTranslator;
  events = events.filter((e) => {
    if (!translator.isUpdateEvent(e) && !translator.isSnapshotEvent(e)) {
      return false; // only use messages / snapshots
    }
    return true;
  });

  const updates = events.map(
    (e) => new Uint8Array(decodeBase64(e.content.update))
  );

  const update = Y.mergeUpdates(updates);

  if (!updates.length) {
    return update;
  }

  Y.applyUpdate(doc, update, "legacy-provider");

  return update;
}

/**
 * What an old-build client ends up with after joining/reloading a room.
 * Returns the resulting document, or the error it blew up with.
 */
export async function legacyCatchUp(
  client: any,
  roomId: string
): Promise<{ doc: Y.Doc; error?: any; eventsUsed: number }> {
  const doc = new Y.Doc();
  try {
    const events = await legacyGetInitialDocumentUpdateEvents(client, roomId);
    legacyProcessIncomingEvents(doc, events);
    return { doc, eventsUsed: events.length };
  } catch (error) {
    return { doc, error, eventsUsed: 0 };
  }
}
