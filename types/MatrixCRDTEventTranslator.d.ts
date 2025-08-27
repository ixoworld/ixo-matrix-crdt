import { MatrixClient } from "matrix-js-sdk";
declare const DEFAULT_OPTIONS: {
    updatesAsRegularMessages: boolean;
    updateEventType: string;
    snapshotEventType: string;
};
export type MatrixCRDTEventTranslatorOptions = Partial<typeof DEFAULT_OPTIONS>;
/**
 * The MatrixCRDTEventTranslator is responsible for writing and reading
 * Yjs updates from / to Matrix events. The options determine how to serialize
 * Matrix-CRDT updates.
 */
export declare class MatrixCRDTEventTranslator {
    private readonly opts;
    constructor(opts?: MatrixCRDTEventTranslatorOptions);
    sendUpdate(client: MatrixClient, roomId: string, update: Uint8Array): Promise<void>;
    sendSnapshot(client: MatrixClient, roomId: string, snapshot: Uint8Array, lastEventId: string): Promise<void>;
    isUpdateEvent(event: any): boolean;
    isSnapshotEvent(event: any): boolean;
    get WrappedEventType(): string;
}
export {};
