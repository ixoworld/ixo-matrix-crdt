import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import * as logging from "lib0/logging";
import { MatrixWebrtcProvider } from "./webrtc/MatrixWebrtcProvider";
import { decodeBase64, encodeBase64 } from "./util/olmlib";
import { BlockNoteAwareness } from "./awareness/BlockNoteAwareness";

const log = logging.createModuleLogger("signed-webrtc");
export const messageSync = 0;
export const messageAwareness = 1;

export class SignedWebrtcProvider extends MatrixWebrtcProvider {
  private awareness?: BlockNoteAwareness;
  public onCustomMessage = (
    buf: Uint8Array,
    reply: (message: Uint8Array) => void
  ): void => {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();

    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync:
        const strMessage = decoding.readAny(decoder);

        this.verify(strMessage).then(
          () => {
            const update = decodeBase64(strMessage.message);
            const decoder2 = decoding.createDecoder(update);
            const syncMessageType = syncProtocol.readSyncMessage(
              decoder2,
              encoder,
              this.doc,
              this
            );

            if (syncMessageType !== syncProtocol.messageYjsUpdate) {
              log("error: expect only updates");
              throw new Error("error: only update messages expected");
            }
          },
          (err) => {
            console.error("couldn't verify message", err);
          }
        );
        break;

      case messageAwareness:
        // Handle awareness updates (only if awareness is enabled)
        if (this.awareness) {
          const awarenessUpdate = decoding.readVarUint8Array(decoder);
          this.awareness.applyAwarenessUpdateFromBytes(awarenessUpdate);
        }
        break;
    }
  };

  public onPeerConnected = (reply: (message: Uint8Array) => void): void => {
    console.log("WebRTC peer connected for real-time document sync");

    // Send current awareness state to new peer (if awareness enabled)
    if (this.awareness) {
      const localState = this.awareness.getLocalState();
      if (localState) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(encoder, this.awareness.encodeAwarenessUpdate());
        reply(encoding.toUint8Array(encoder));
      }
    }
  };

  private _docUpdateHandler = async (update: Uint8Array, origin: any) => {
    if (!this.room || origin === this) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);

    const syncEncoder = encoding.createEncoder();
    syncProtocol.writeUpdate(syncEncoder, update);

    const obj = {
      message: encodeBase64(encoding.toUint8Array(syncEncoder)),
    };

    await this.sign(obj);

    encoding.writeAny(encoder, obj);
    this.room.broadcastRoomMessage(encoding.toUint8Array(encoder));
  };

  // Add awareness update handler
  private _awarenessUpdateHandler = (
    { added, updated, removed }: any,
    origin: any
  ) => {
    // Access room from parent class
    const room = this.room;

    if (!room || !this.awareness) {
      console.log('[SignedWebrtcProvider] No room or awareness available');
      return;
    }

    const changedClients = added.concat(updated).concat(removed);
    console.log('[SignedWebrtcProvider] Awareness change:', { added, updated, removed });

    // Broadcast awareness update to WebRTC peers
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, this.awareness.encodeAwarenessUpdate());

    const message = encoding.toUint8Array(encoder);
    console.log('[SignedWebrtcProvider] Broadcasting awareness update, size:', message.length);

    room.broadcastRoomMessage(message);
  };
  public constructor(
    doc: Y.Doc,
    matrixClient: any,
    roomId: string,
    private sign: (obj: any) => Promise<void>,
    private verify: (obj: any) => Promise<void>,
    awareness?: BlockNoteAwareness,
    opts?: any
  ) {
    super(doc, matrixClient, roomId, opts);

    this.awareness = awareness;

    doc.on("update", this._docUpdateHandler);
    doc.on("destroy", this.destroy.bind(this));

    // Set up awareness listeners (only if awareness provided)
    if (this.awareness) {
      this.awareness.on("update", this._awarenessUpdateHandler);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener("beforeunload", () => {
        // Clear awareness on page unload
        if (this.awareness) {
          this.awareness.setLocalState(null);
        }
        this.destroy();
      });
    }
  }

  destroy() {
    if (this.awareness) {
      this.awareness.off("update", this._awarenessUpdateHandler);
    }
    this.doc.off("update", this._docUpdateHandler);
    this.doc.off("destroy", this.destroy);
    super.destroy();
  }
}
