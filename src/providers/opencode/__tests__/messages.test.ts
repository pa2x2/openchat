import type { SessionMessageInfo } from "@opencode/client";
import { toMessage } from "../messages";

const wire = (message: Record<string, unknown>) => message as unknown as SessionMessageInfo;

describe("toMessage", () => {
  it("maps a completed assistant message with text, reasoning and usage", () => {
    const message = wire({
      type: "assistant",
      id: "msg_a",
      time: { created: 1, completed: 2 },
      content: [
        { type: "reasoning", text: "Let me think" },
        { type: "text", text: "part one" },
        { type: "tool", tool: "read" },
        { type: "text", text: "part two" },
      ],
      tokens: { input: 10, output: 2, reasoning: 5, cache: { read: 1, write: 2 } },
    });
    expect(toMessage(message)).toEqual({
      id: "msg_a",
      role: "assistant",
      text: "part one\n\npart two",
      reasoning: "Let me think",
      status: "complete",
      usage: { input: 10, output: 2, reasoning: 5, cacheRead: 1, cacheWrite: 2 },
      createdAt: 1,
    });
  });

  it("tells an unfinished reply from a failed one", () => {
    const unfinished = { type: "assistant", id: "a", time: { created: 1 }, content: [] };
    expect(toMessage(wire(unfinished))).toMatchObject({ status: "interrupted", text: "" });
    expect(toMessage(wire({ ...unfinished, error: { message: "boom" } }))).toMatchObject({
      status: "error",
    });
  });

  it("drops entries the transcript must not show", () => {
    // A message steered into a still-busy session leaves an empty finished reply.
    const empty = { type: "assistant", id: "a", time: { created: 1, completed: 2 }, content: [] };
    expect(toMessage(wire(empty))).toBeNull();
    expect(toMessage(wire({ type: "idle", id: "i" }))).toBeNull();
  });

  it("carries the stored attachment payload back into the transcript", () => {
    const message = wire({
      type: "user",
      id: "msg_u",
      time: { created: 1 },
      text: "look",
      files: [
        { data: "QUJD", mime: "image/png", source: { type: "inline" }, name: "photo.png" },
        { data: "", mime: "", source: { type: "uri", uri: "https://x/a.bin" } },
      ],
    });
    expect(toMessage(message)?.attachments).toEqual([
      { uri: "", mimeType: "image/png", name: "photo.png", bytes: "QUJD", size: 3 },
      expect.objectContaining({ mimeType: "application/octet-stream", name: "attachment" }),
    ]);
  });
});
