import { MatrixClient } from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import * as Y from "yjs";
import { MatrixReader, MatrixReaderOptions } from "./reader/MatrixReader";
import { BlockNoteAwareness } from "./awareness/BlockNoteAwareness";
import { ThrottledMatrixWriterOptions } from "./writer/ThrottledMatrixWriter";
import { MatrixCRDTEventTranslatorOptions } from "./MatrixCRDTEventTranslator";
declare const DEFAULT_OPTIONS: {
    enableExperimentalWebrtcSync: boolean;
    enableAwareness: boolean;
    reader: MatrixReaderOptions;
    writer: ThrottledMatrixWriterOptions;
    translator: MatrixCRDTEventTranslatorOptions;
};
/**
 * {
 *  // Options for `ThrottledMatrixWriter`
 *  writer: {
 *    // throttle flushing write events to matrix by 500ms
 *    flushInterval: number = 500,
 *    // if writing to the room fails, wait 30 seconds before retrying
 *    retryIfForbiddenInterval: number = 30000
 *  },
 *  // Options for `MatrixCRDTEventTranslator`
 *  translator: {
 *    // set to true to send everything encapsulated in a m.room.message,
 *    // so you can view and debug messages easily in element or other matrix clients
 *    updatesAsRegularMessages: false,
 *    // The event type to use for updates
 *    updateEventType: "matrix-crdt.doc_update",
 *    // The event type to use for snapshots
 *    snapshotEventType: "matrix-crdt.doc_snapshot",
 *  }
 *  // Experimental; we can use WebRTC to sync updates instantly over WebRTC.
 *  // See SignedWebrtcProvider.ts for more details + motivation
 *  enableExperimentalWebrtcSync: boolean = false
 *  // Enable real-time awareness (cursors, selections, user presence)
 *  enableAwareness: boolean = false
 *  // Options for MatrixReader
 *  reader: {
 *    // How often to send a summary snapshot (defaults to once every 30 events)
 *    snapshotInterval: number = 30,
 *  },
 * }
 */
export type MatrixProviderOptions = Partial<typeof DEFAULT_OPTIONS>;
/**
 * Syncs a Matrix room with a Yjs document.
 */
export declare class MatrixProvider extends lifecycle.Disposable {
    private doc;
    private matrixClient;
    private room;
    private disposed;
    private _roomId;
    private initializeTimeoutHandler;
    private initializedResolve;
    private readonly initializedPromise;
    private webrtcProvider;
    private reader;
    private readonly throttledWriter;
    private readonly translator;
    private awareness?;
    private readonly _onDocumentAvailable;
    private readonly _onDocumentUnavailable;
    private readonly _onReceivedEvents;
    private readonly opts;
    readonly onDocumentAvailable: event.Event<void>;
    readonly onReceivedEvents: event.Event<void>;
    readonly onDocumentUnavailable: event.Event<void>;
    get onCanWriteChanged(): event.Event<void>;
    get canWrite(): boolean;
    get roomId(): string | undefined;
    get matrixReader(): MatrixReader | undefined;
    get awarenessInstance(): BlockNoteAwareness | undefined;
    totalEventsReceived: number;
    /**
     * Creates an instance of MatrixProvider.
     * @param {Y.Doc} doc The `Y.Doc` to sync over the Matrix Room
     * @param {MatrixClient} matrixClient A `matrix-js-sdk` client with
     * permissions to read (and/or write) from the room
     * @param {{
     *           type: "id";
     *           id: string;
     *         }
     *       | { type: "alias"; alias: string }}
     *          A room alias (e.g.: #room_alias:domain) or
     *          room id (e.g.: !qporfwt:matrix.org)
     *          to sync the document with.
     * @param {MatrixProviderOptions} [opts={}] Additional configuration, all optional. See {@link MatrixProviderOptions}
     * @memberof MatrixProvider
     */
    constructor(doc: Y.Doc, matrixClient: MatrixClient, room: {
        type: "id";
        id: string;
    } | {
        type: "alias";
        alias: string;
    }, opts?: MatrixProviderOptions);
    /**
     * Listener for changes to the Yjs document.
     * Forwards changes to the Matrix Room if applicable
     */
    private documentUpdateListener;
    /**
     * Handles incoming events from MatrixReader
     */
    private processIncomingEvents;
    /**
     * Experimental; we can use WebRTC to sync updates instantly over WebRTC.
     *
     * The default Matrix-writer only flushes events every 500ms.
     * WebRTC can also sync awareness updates which is not available via Matrix yet.
     * See SignedWebrtcProvider.ts for more details + motivation
     *
     * TODO: we should probably extract this from MatrixProvider so that
     * API consumers can instantiate / configure this seperately
     */
    private initializeWebrtc;
    private initializeNoCatch;
    /**
     * Get all initial events from the room + start polling
     */
    private initializeReader;
    /**
     * For testing purposes; make sure pending events have been flushed to Matrix
     */
    waitForFlush(): Promise<void>;
    initialize(): Promise<void>;
    dispose(): void;
}
export {};
