import { MatrixClient, IContent } from "matrix-js-sdk";
import { MESSAGE_EVENT_TYPE } from "./util/matrixUtil";
import { encodeBase64 } from "./util/olmlib";

interface MatrixCRDTUpdateContent extends IContent {
  update: string;
}

interface MatrixCRDTSnapshotContent extends IContent {
  update: string;
  last_event_id: string;
}

interface MatrixMessageContent extends IContent {
  body: string;
  msgtype: string;
  [key: string]: any;
}

const DEFAULT_OPTIONS = {
  // set to true to send everything encapsulated in a m.room.message,
  // so you can debug rooms easily in element or other matrix clients
  updatesAsRegularMessages: false,
  updateEventType: "matrix-crdt.doc_update",
  snapshotEventType: "matrix-crdt.doc_snapshot",
};

export type MatrixCRDTEventTranslatorOptions = Partial<typeof DEFAULT_OPTIONS>;

/**
 * The MatrixCRDTEventTranslator is responsible for writing and reading
 * Yjs updates from / to Matrix events. The options determine how to serialize
 * Matrix-CRDT updates.
 */
export class MatrixCRDTEventTranslator {
  private readonly opts: typeof DEFAULT_OPTIONS;

  public constructor(opts: MatrixCRDTEventTranslatorOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  public async sendUpdate(
    client: MatrixClient,
    roomId: string,
    update: Uint8Array
  ) {
    const encoded = encodeBase64(update);
    const content: MatrixCRDTUpdateContent = {
      update: encoded,
    };
    if (this.opts.updatesAsRegularMessages) {
      const wrappedContent: MatrixMessageContent = {
        body: this.opts.updateEventType + ": " + encoded,
        msgtype: this.opts.updateEventType,
        ...content,
      };
      // Disable scheduler for immediate sending
      if ('scheduler' in client) {
        (client as any).scheduler = undefined;
      }
      await (client.sendEvent as any)(roomId, MESSAGE_EVENT_TYPE, wrappedContent, "");
    } else {
      await (client.sendEvent as any)(roomId, this.opts.updateEventType, content, "");
    }
  }

  public async sendSnapshot(
    client: MatrixClient,
    roomId: string,
    snapshot: Uint8Array,
    lastEventId: string
  ) {
    const encoded = encodeBase64(snapshot);
    const content: MatrixCRDTSnapshotContent = {
      update: encoded,
      last_event_id: lastEventId,
    };
    if (this.opts.updatesAsRegularMessages) {
      const wrappedContent: MatrixMessageContent = {
        body: this.opts.snapshotEventType + ": " + encoded,
        msgtype: this.opts.snapshotEventType,
        ...content,
      };
      // Disable scheduler for immediate sending
      if ('scheduler' in client) {
        (client as any).scheduler = undefined;
      }
      await (client.sendEvent as any)(roomId, MESSAGE_EVENT_TYPE, wrappedContent, "");
    } else {
      await (client.sendEvent as any)(roomId, this.opts.snapshotEventType, content, "");
    }
  }

  public isUpdateEvent(event: any) {
    if (this.opts.updatesAsRegularMessages) {
      return (
        event.type === MESSAGE_EVENT_TYPE &&
        event.content.msgtype === this.opts.updateEventType
      );
    }
    return event.type === this.opts.updateEventType;
  }

  public isSnapshotEvent(event: any) {
    if (this.opts.updatesAsRegularMessages) {
      return (
        event.type === MESSAGE_EVENT_TYPE &&
        event.content.msgtype === this.opts.snapshotEventType
      );
    }
    return event.type === this.opts.snapshotEventType;
  }

  public get WrappedEventType() {
    if (this.opts.updatesAsRegularMessages) {
      return MESSAGE_EVENT_TYPE;
    } else {
      return this.opts.updateEventType;
    }
  }
}
