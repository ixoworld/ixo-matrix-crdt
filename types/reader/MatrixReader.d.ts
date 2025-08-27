import { MatrixClient } from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
declare const DEFAULT_OPTIONS: {
    snapshotInterval: number;
};
export type MatrixReaderOptions = Partial<typeof DEFAULT_OPTIONS>;
/**
 * A helper class to read messages from Matrix using a MatrixClient,
 * without relying on the sync protocol.
 */
export declare class MatrixReader extends lifecycle.Disposable {
    private matrixClient;
    readonly roomId: string;
    private readonly translator;
    latestToken: string | undefined;
    private disposed;
    private polling;
    private pendingPollRequest;
    private pollRetryTimeout;
    private messagesSinceSnapshot;
    private readonly _onEvents;
    readonly onEvents: event.Event<{
        events: any[];
        shouldSendSnapshot: boolean;
    }>;
    private readonly opts;
    constructor(matrixClient: MatrixClient, roomId: string, translator: MatrixCRDTEventTranslator, opts?: MatrixReaderOptions);
    /**
     * Only receives messages from rooms the user has joined, and after startClient() has been called
     * (i.e.: they're received via the sync API).
     *
     * At this moment, we only poll for events using the /events endpoint.
     * I.e. the Sync API should not be used (and startClient() should not be called).
     *
     * We do this because we don't want the MatrixClient to keep all events in memory.
     * For yjs, this is not necessary, as events are document updates which are accumulated in the yjs
     * document, so already stored there.
     *
     * In a later version, it might be more efficient to call the /sync API manually
     * (without relying on the Timeline / sync system in the matrix-js-sdk),
     * because it allows us to retrieve events for multiple rooms simultaneously, instead of
     * a seperate /events poll per room
     */
    private matrixRoomListener;
    /**
     * Handle incoming events to determine whether a snapshot message needs to be sent
     *
     * MatrixReader keeps an internal counter of messages received.
     * every opts.snapshotInterval messages, we send a snapshot of the entire document state.
     */
    private processIncomingEventsForSnapshot;
    private decryptRawEventsIfNecessary;
    /**
     * Peek for new room events using the Matrix /events API (long-polling)
     * This function automatically keeps polling until MatrixReader.dispose() is called
     */
    private peekPoll;
    /**
     * Before starting polling, call getInitialDocumentUpdateEvents to get the history of events
     * when coming online.
     *
     * This methods paginates back until
     * - (a) all events in the room have been received. In that case we return all events.
     * - (b) it encounters a snapshot. In this case we return the snapshot event and all update events
     *        that occur after that latest snapshot
     *
     * (if typeFilter is set we retrieve all events of that type. TODO: can we deprecate this param?)
     */
    getInitialDocumentUpdateEvents(typeFilter?: string): Promise<any[]>;
    /**
     * Start polling the room for messages
     */
    startPolling(): void;
    get isStarted(): boolean;
    dispose(): void;
}
export {};
