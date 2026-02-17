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
  const translator = new MatrixCRDTEventTranslator(translatorOpts);
  const fullState = Y.encodeStateAsUpdate(sourceDoc);
  await translator.sendUpdate(matrixClient, targetRoomId, fullState);
  return { status: "ok", targetRoomId };
}
