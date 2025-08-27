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
  }
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

### Benchmarking

```bash
npm run bench
```

## License

Mozilla Public License 2.0 (MPL-2.0)