import { Filter, MatrixClient } from "matrix-js-sdk";

export const ENCRYPTED_TIMELINE_EVENT_TYPE = "m.room.encrypted";

/**
 * Build the SDK wrapper required by `MatrixClient.createMessagesRequest`.
 *
 * `/rooms/{roomId}/messages` accepts a room-event filter, while the SDK method
 * accepts a `Filter` and extracts its timeline component. Keeping that detail
 * here prevents readers from falling back to unfiltered pagination when event
 * types are added.
 *
 * E2EE replaces the clear custom type with `m.room.encrypted` before the event
 * reaches the homeserver. The envelope therefore has to be included as well:
 * omitting it makes filtered catch-up return an empty document in encrypted
 * rooms. In an unencrypted room it matches nothing. In an encrypted room the
 * server cannot distinguish CRDT events from other encrypted events; the
 * client filters the decrypted events, which is the strongest possible filter
 * without exposing the clear event type to the server.
 */
export function createTimelineTypeFilter(
  client: MatrixClient,
  eventTypes: readonly string[]
): Filter {
  const filter = new Filter(
    client.getUserId?.() ?? client.credentials?.userId ?? undefined
  );
  filter.setDefinition({
    room: {
      timeline: {
        types: [
          ...new Set([...eventTypes, ENCRYPTED_TIMELINE_EVENT_TYPE]),
        ],
      },
    },
  });
  return filter;
}
