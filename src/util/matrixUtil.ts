import { MatrixClient, IContent } from "matrix-js-sdk";

export const MESSAGE_EVENT_TYPE = "m.room.message" as const;

interface TextMessageContent extends IContent {
  body: string;
  msgtype: "m.text";
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  message: string,
  eventType = MESSAGE_EVENT_TYPE
) {
  const content: TextMessageContent = {
    body: message,
    msgtype: "m.text",
  };
  // Disable scheduler for immediate sending
  if ('scheduler' in client) {
    (client as any).scheduler = undefined;
  }
  await (client.sendEvent as any)(roomId, eventType, content, "");
}
