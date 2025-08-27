import { MatrixClient } from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
declare const DEFAULT_OPTIONS: {
    flushInterval: number;
    retryIfForbiddenInterval: number;
};
export type ThrottledMatrixWriterOptions = Partial<typeof DEFAULT_OPTIONS>;
/**
 * A class that writes updates in the form of Uint8Array to Matrix.
 */
export declare class ThrottledMatrixWriter extends lifecycle.Disposable {
    private readonly matrixClient;
    private readonly translator;
    private pendingUpdates;
    private isSendingUpdates;
    private _canWrite;
    private retryTimeoutHandler;
    private roomId;
    private readonly _onCanWriteChanged;
    readonly onCanWriteChanged: event.Event<void>;
    private readonly _onSentAllEvents;
    private readonly onSentAllEvents;
    private readonly throttledFlushUpdatesToMatrix;
    private readonly opts;
    constructor(matrixClient: MatrixClient, translator: MatrixCRDTEventTranslator, opts?: ThrottledMatrixWriterOptions);
    private setCanWrite;
    private flushUpdatesToMatrix;
    initialize(roomId: string): Promise<void>;
    get canWrite(): boolean;
    writeUpdate(update: Uint8Array): void;
    waitForFlush(): Promise<void>;
    dispose(): void;
}
export {};
