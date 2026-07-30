# ixo-matrix-crdt

ixo-matrix-crdt enables you to use Matrix as a backend for distributed, real-time collaborative web applications that sync automatically.

The MatrixProvider is a sync provider for Yjs, a proven, high performance CRDT implementation.

**TL;DR**  
Create collaborative applications and connect Matrix as transport + backend storage. Instead of chat messages (primary use-case of Matrix), we send an event stream of data model updates to Matrix.

## Motivation

CRDTs (Conflict-free Replicated Data Types) make it easy to build decentralized, fast, collaborative local-first applications.

Read more about the benefits of [Local-first software in this essay](https://www.inkandswitch.com/local-first/)

When building local-first software on top of CRDTs, you probably still need a backend so users can access their data across devices and collaborate with each other.

While Matrix is primarily designed for messaging (chat), it's versatile enough to use as a backend for collaborative applications. The idea is that by building on top of Matrix, developers can focus on building clients and get the following benefits from the Matrix ecosystem out-of-the-box:

- An open standard and active community
- Multiple server implementations (including hosted servers)
- Authentication (including support for SSO and 3rd party providers)
- Access control via Rooms and Spaces
- E2EE
- A decentralized architecture with support for federation

## Usage

ixo-matrix-crdt currently works with Yjs.

### Usage with Yjs

To setup ixo-matrix-crdt, 3 steps are needed:

1. Create a Yjs Y.Doc
2. Create and authenticate a client from matrix-js-sdk
3. Create and initialize your ixo-matrix-crdt MatrixProvider

```typescript
import { MatrixProvider } from "ixo-matrix-crdt";
import * as Y from "yjs";
import sdk from "matrix-js-sdk";

// See https://matrix.org/docs/guides/usage-of-the-matrix-js-sdk
// for login methods
const matrixClient = sdk.createClient({
  baseUrl: "https://matrix.org",
  accessToken: "....MDAxM2lkZW50aWZpZXIga2V5CjAwMTBjaWQgZ2Vu....",
  userId: "@USERID:matrix.org",
});

// Extra configuration needed for certain matrix-js-sdk
// calls to work without calling sync start functions
matrixClient.canSupportVoip = false;
matrixClient.clientOpts = {
  lazyLoadMembers: true,
};

// Create a new Y.Doc and connect the MatrixProvider
const ydoc = new Y.Doc();
const provider = new MatrixProvider(ydoc, matrixClient, {
  type: "alias",
  alias: "#matrix-room-alias:matrix.org",
});
provider.initialize();

// array of numbers which produce a sum
const yarray = ydoc.getArray("count");

// observe changes of the sum
yarray.observe((event) => {
  // print updates when the data changes
  console.log("new sum: " + yarray.toArray().reduce((a, b) => a + b));
});

// add 1 to the sum
yarray.push([1]); // => "new sum: 1"
```

## API

### `new MatrixProvider(doc, matrixClient, room, awareness?, opts?): MatrixProvider`

The MatrixProvider syncs a Matrix room with a Yjs document.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | `Y.Doc` | The Y.Doc to sync over the Matrix room. |
| `matrixClient` | `MatrixClient` | A matrix-js-sdk client with permissions to read (and/or write) from the room. |
| `room` | `{ type: "id"; id: string; }` or `{ type: "alias"; alias: string }` | The room ID or Alias to sync with. |
| `awareness` (optional) | `awarenessProtocol.Awareness` | A y-protocols Awareness instance that can be used to sync "awareness" data over the experimental webrtc bridge. |
| `opts` (optional) | `MatrixProviderOptions` | Configure advanced properties, see below. |

### MatrixProviderOptions

Additional configuration options that can be passed to the MatrixProvider constructor.

Defaults to:

```typescript
{
  // Options for `ThrottledMatrixWriter`
  writer: {
    // throttle flushing write events to matrix by 500ms
    flushInterval: number = 500,
    // if writing to the room fails, wait 30 seconds before retrying
    retryIfForbiddenInterval: number = 30000
  },
  // Options for `MatrixCRDTEventTranslator`
  translator: {
    // set to true to send everything encapsulated in a m.room.message,
    // so you can view and debug messages easily in element or other matrix clients
    updatesAsRegularMessages: false,
    // The event type to use for updates
    updateEventType: "matrix-crdt.doc_update",
    // The event type to use for snapshots
    snapshotEventType: "matrix-crdt.doc_snapshot",
    // The event type to use for media-backed snapshots (see "Media-backed snapshots")
    snapshotV2EventType: "matrix-crdt.doc_snapshot_v2",
    // WRITE media-backed snapshots. Default false: v2 read support must be
    // deployed everywhere before anything starts writing v2.
    enableMediaSnapshots: false,
    // While media snapshots are enabled, also publish a legacy inline snapshot
    // whenever the document still fits under the inline event ceiling.
    keepLegacyInlineSnapshots: true,
    // Override the inline ceiling in bytes of the Yjs update (0 = auto)
    inlineSnapshotMaxBytes: 0,
  }
  // Override how snapshot blobs are uploaded to / downloaded from the media repo
  mediaTransport: undefined,
  // Experimental; we can use WebRTC to sync updates instantly over WebRTC.
  // See SignedWebrtcProvider.ts for more details + motivation
  enableExperimentalWebrtcSync: boolean = false
  // Options for MatrixReader
  reader: {
    // How often to send a summary snapshot (defaults to once every 30 events)
    snapshotInterval: number = 30,
  },
}
```

## Architecture

CRDT updates (in our case, Yjs document updates) are very similar to (chat) Messages, that Matrix has been optimized for.

ixo-matrix-crdt bridges Yjs documents to Matrix Rooms and Yjs updates to Matrix events (regular chat messages are also a specific event type in Matrix). Yjs document updates are sent as base64-encoded events to the Matrix room.

When registering a MatrixProvider, we:

1. Listen to new `matrix-crdt.doc_update` events in the Matrix Room, and apply updates to the Yjs document.
2. Listen to Yjs document updates and send these to the Matrix room as `matrix-crdt.doc_update` events.

CRDTs are specifically designed to be eventually consistent. This means that the state of your data is eventually reconciled, regardless of the order of update events that reach each client or server (as long as you eventually get all updates).

This makes it possible to work offline, or for servers / clients to be out of sync for a while.

### Snapshots

To reconstruct your application state (that is, the Yjs document), we eventually need to access all previous events. When there have been a lot of updates, it would be inefficient to read the entire document / room history from Matrix.

ixo-matrix-crdt sends periodic snapshots that contain a summary of all previous events. When retrieving a snapshot (stored as a Matrix event with type `matrix-crdt.doc_snapshot`), clients can reconstruct application state from that snapshot and don't need to fetch events occurring before that snapshot's `last_event_id` (stored on the event).

### Media-backed snapshots

An inline snapshot is the **entire document**, base64-encoded, inside a single
Matrix event. Matrix caps an event at 65,536 bytes, which puts the effective
document ceiling at roughly **45 KB** — and roughly **32 KB in an encrypted
room**, because the megolm ciphertext is itself base64 and the 4/3 expansion is
applied twice.

With `translator.enableMediaSnapshots: true`, the document is instead uploaded to
the Matrix media repository and the event carries only a constant-size pointer:

```json
{
  "v": 2,
  "mxc_url": "mxc://…",
  "last_event_id": "$…",
  "state_vector": "…",
  "size": 132000,
  "sha256": "…"
}
```

Catch-up fetches the blob, applies it, then replays `matrix-crdt.doc_update`
events after `last_event_id`, exactly as with an inline snapshot. The ceiling
becomes the homeserver's media limit (~100 MB by default) instead of 64 KiB.

Things worth knowing before turning it on:

- **Media-backed snapshots use a different event type**
  (`matrix-crdt.doc_snapshot_v2`) and this is load-bearing, not cosmetic. Clients
  identify snapshots by event type alone and treat finding one as the signal to
  stop paginating backwards. A media pointer published under the legacy
  `matrix-crdt.doc_snapshot` type would halt an already-deployed client's
  backwards walk and then fail to decode an inline payload that isn't there — it
  would render an empty document and every document in that room would look
  wiped. Under a new type, older clients simply don't recognise the event, skip
  it, and keep paginating to a snapshot they can read.
- **Readers before writers.** `enableMediaSnapshots` is off by default. Deploy a
  version that can *read* v2 to every client (including headless ones) before
  enabling the write path anywhere.
- **Legacy inline snapshots keep being published in parallel** while the document
  still fits under the inline ceiling (`keepLegacyInlineSnapshots`), so older
  clients keep their catch-up shortcut. They lose it only once documents actually
  outgrow the inline ceiling.
- **Encrypted rooms**: `sendEvent` encrypts the pointer event, but the homeserver
  never encrypts media. Blobs are therefore encrypted client-side using the
  Matrix `m.encrypted_file` v2 scheme (AES-256-CTR plus a SHA-256 of the
  ciphertext) and the key material travels inside the end-to-end encrypted
  pointer event. Encryption detection fails closed: anything other than a
  definitive "this room is not encrypted" answer encrypts.
- **An unreadable snapshot never counts as a successful catch-up.** A bad
  pointer, a failed media fetch, a corrupt blob or a blob that doesn't match the
  advertised state vector is skipped: the backwards walk continues to an older
  readable snapshot, or to room genesis. Subscribe to
  `provider.onSnapshotDegraded` to surface that. If nothing readable is left at
  all, catch-up throws `SnapshotUnavailableError` rather than presenting an empty
  document as the room's state.

Note that `cloneDocument()` sends a full document state as a single *update*
event and is therefore still bound by the 64 KiB event ceiling.

### Filtered catch-up

Initial document catch-up uses a server-side `/messages` timeline filter. The
filter is derived from `MatrixCRDTEventTranslator.readEventTypes`, so custom
update/snapshot event types and `matrix-crdt.doc_snapshot_v2` cannot drift out of
the reader. Unrelated room traffic—including `ixo.flow.run.event` history—does
not consume document catch-up pages or affect snapshot-election counters.
The filter also includes the `m.room.encrypted` envelope: end-to-end encryption
hides the clear custom type from the homeserver, so encrypted events must be
decrypted and filtered client-side. This is unavoidable in E2EE rooms; clear
rooms retain full server-side filtering.

### Durable run history with `RoomEventLog`

`RoomEventLog` is a companion to `MatrixProvider` for append-only flow history.
It uses the same Matrix client and room, but history stays in the room timeline
instead of the Y.Doc:

```typescript
import {
  RoomEventLog,
  type IRoomEventLog,
} from "@ixo/matrix-crdt";

const history: IRoomEventLog = new RoomEventLog(matrixClient, roomId);

await history.append({
  runId: "r-0007",
  blockId: "block-abc",
  kind: "action.output",
  payload: {
    attempt: 1,
    output: { claimId: "claim-123" },
  },
  // Stable and unique within the room. Retries use the same Matrix
  // transaction id and converge on one event.
  idempotencyKey: "r-0007:block-abc:attempt-1:output",
});

const page = await history.read("r-0007", { limit: 50 });
const nextPage = page.nextToken
  ? await history.read("r-0007", {
      from: page.nextToken,
      limit: 50,
    })
  : undefined;

const subscription = history.subscribe(
  (entry) => {
    // Server-authenticated audit metadata:
    console.log(entry.sender, entry.originServerTs, entry.content);
  },
  { runId: "r-0007" }
);

subscription.dispose();
```

Events use the strict, versioned `ixo.flow.run.event` v1 schema. Supported kinds
are `run.started`, `run.closed`, `run.cancelled`, `action.started`,
`action.output`, `action.done`, `action.failed`, `definition.changed`, and
`log`. Action events require a `blockId` and positive `attempt`; lifecycle and
definition events are run-level. Payloads must be finite JSON values.

`read()` filters `/messages` to the run-event type, then filters by `runId`
client-side. It returns newest-first by default; pass `direction: "forward"` for
oldest-first. Pagination and subscriptions deduplicate both Matrix event ids and
persisted idempotency keys, including the immediate local echo of an append.
When `subscribe()` has no `from` token it starts at the live edge and does not
replay history.

### WebRTC (experimental)

ixo-matrix-crdt by default throttles sent events every 500ms (for example, to prevent sending an event every keystroke when building a rich text editor). It also does not support Yjs Awareness updates (for presence information, etc) over Matrix.

You can use the (experimental) WebRTC provider to connect to peers over WebRTC and send updates (regular and Awareness updates) instantly.

## Development

### Installation

```bash
npm install
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

Note: `npm test` runs `vitest run --coverage`, which needs `@vitest/coverage-v8`
(not currently a devDependency), and most suites
(`MatrixProvider.test.ts`, `MatrixReader.test.ts`, `MatrixMemberReader.test.ts`)
require a Synapse homeserver on `localhost:8888` started from a `test-server/`
docker-compose directory that is not part of this repository.

The snapshot, filtered catch-up, and room-event-log suites run anywhere against
an in-memory fake homeserver:

```bash
npx vitest run \
  src/snapshots \
  src/RoomEventLog.test.ts \
  src/reader/MatrixReader.filtered.test.ts
```

### Benchmarking

```bash
npm run bench
```

## License

Mozilla Public License 2.0 (MPL-2.0)
