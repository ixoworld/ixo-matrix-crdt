import { MatrixClient } from "matrix-js-sdk";
import * as Y from "yjs";
import {
  MatrixCRDTEventTranslator,
  MatrixCRDTEventTranslatorOptions,
} from "./MatrixCRDTEventTranslator";

export interface CloneDocumentResult {
  status: "ok";
  targetRoomId: string;
}

/**
 * Clones an already-encoded Yjs document update into a Matrix room.
 *
 * This is the package boundary-safe form for applications that own their
 * Y.Doc. Passing bytes avoids coupling consumers to this package's installed
 * Yjs type identity while preserving the exact document state.
 */
export async function cloneDocumentUpdate(
  sourceUpdate: Uint8Array,
  matrixClient: MatrixClient,
  targetRoomId: string,
  translatorOpts?: MatrixCRDTEventTranslatorOptions
): Promise<CloneDocumentResult> {
  const translator = new MatrixCRDTEventTranslator(translatorOpts);
  await translator.sendUpdate(matrixClient, targetRoomId, sourceUpdate);
  return { status: "ok", targetRoomId };
}

/**
 * Clones a Yjs document into a new Matrix room by sending the full document
 * state as a single event. This avoids replaying individual changes and makes
 * the cloned page appear instantly when opened.
 *
 * @param sourceDoc The live Y.Doc to clone (must be synced / up-to-date)
 * @param matrixClient A matrix-js-sdk client with write access to the target room
 * @param targetRoomId The room ID of the newly created target room
 * @param translatorOpts Optional translator options (event types, message wrapping).
 *                       Defaults match MatrixCRDTEventTranslator defaults.
 * @returns A promise that resolves once the snapshot event has been sent
 */
export async function cloneDocument(
  sourceDoc: Y.Doc,
  matrixClient: MatrixClient,
  targetRoomId: string,
  translatorOpts?: MatrixCRDTEventTranslatorOptions
): Promise<CloneDocumentResult> {
  return cloneDocumentUpdate(
    Y.encodeStateAsUpdate(sourceDoc),
    matrixClient,
    targetRoomId,
    translatorOpts
  );
}
