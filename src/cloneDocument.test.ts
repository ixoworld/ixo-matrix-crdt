import type { MatrixClient } from "matrix-js-sdk";
import { describe, expect, it, vi } from "vitest";
import { cloneDocumentUpdate } from "./cloneDocument";
import { decodeBase64 } from "./util/olmlib";

describe("cloneDocumentUpdate", () => {
  it("sends the caller-owned encoded state without coupling Y.Doc types", async () => {
    const sendEvent = vi.fn().mockResolvedValue({ event_id: "$clone" });
    const matrixClient = { sendEvent } as unknown as MatrixClient;
    const update = new Uint8Array([0, 1, 2, 127, 255]);

    const result = await cloneDocumentUpdate(
      update,
      matrixClient,
      "!destination:example.org"
    );

    expect(result).toEqual({
      status: "ok",
      targetRoomId: "!destination:example.org",
    });
    expect(sendEvent).toHaveBeenCalledOnce();
    const [roomId, , content] = sendEvent.mock.calls[0];
    expect(roomId).toBe("!destination:example.org");
    expect(Array.from(decodeBase64(content.update))).toEqual(
      Array.from(update)
    );
  });
});
