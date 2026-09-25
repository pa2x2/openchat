import type { SessionMessageInfo } from "@opencode/client";
import { toMessage } from "../messages";

describe("toMessage", () => {
  it("maps user messages", () => {
    const wire = {
      type: "user",
      id: "msg_u",
      time: { created: 1789741908302 },
      text: "Reply with exactly: hi",
    } as SessionMessageInfo;
    expect(toMessage(wire)).toEqual({
      id: "msg_u",
      role: "user",
      text: "Reply with exactly: hi",
      status: "complete",
      createdAt: 1789741908302,
      attachments: undefined,
    });
  });

  it("maps completed assistant messages with text, reasoning and usage", () => {
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1789741908342, completed: 1789741910276 },
      agent: "chat",
      model: { id: "glm-5.3-flash", providerID: "opencode-go" },
      content: [
        { type: "reasoning", text: "Let me think" },
        { type: "text", text: "hi" },
        { type: "tool", tool: "read" },
      ],
      finish: "stop",
      tokens: { input: 10, output: 2, reasoning: 5, cache: { read: 1, write: 2 } },
    } as SessionMessageInfo;
    expect(toMessage(wire)).toEqual({
      id: "msg_a",
      role: "assistant",
      text: "hi",
      reasoning: "Let me think",
      status: "complete",
      usage: { input: 10, output: 2, reasoning: 5, cacheRead: 1, cacheWrite: 2 },
      createdAt: 1789741908342,
    });
  });

  it("joins multiple text blocks", () => {
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1, completed: 2 },
      content: [
        { type: "text", text: "part one" },
        { type: "text", text: "part two" },
      ],
    } as SessionMessageInfo;
    expect(toMessage(wire)).toMatchObject({ text: "part one\n\npart two" });
  });

  it("marks unfinished assistant messages without errors as interrupted", () => {
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1 },
      content: [{ type: "text", text: "partial" }],
    } as SessionMessageInfo;
    expect(toMessage(wire)).toMatchObject({ status: "interrupted" });
  });

  it("marks assistant messages carrying errors as error", () => {
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1 },
      agent: "chat",
      model: { id: "m", providerID: "p" },
      content: [],
      error: { type: "ApiError", message: "boom" },
    } as unknown as SessionMessageInfo;
    expect(toMessage(wire)).toMatchObject({ status: "error" });
  });

  it("returns null for non-chat entries (idle, synthetic, system, …)", () => {
    expect(toMessage({ type: "idle", id: "msg_x" } as SessionMessageInfo)).toBeNull();
    expect(
      toMessage({ type: "agent-switched", id: "msg_y" } as unknown as SessionMessageInfo),
    ).toBeNull();
  });

  it("carries the stored attachment payload back into the transcript", () => {
    const wire = {
      type: "user",
      id: "msg_u",
      time: { created: 1 },
      text: "look",
      files: [
        {
          // "ABC" — a one-shot base64 payload the server keeps for us.
          data: "QUJD",
          mime: "image/png",
          source: { type: "inline" },
          name: "photo.png",
        },
      ],
    } as unknown as SessionMessageInfo;

    expect(toMessage(wire)).toMatchObject({
      attachments: [{ uri: "", mimeType: "image/png", name: "photo.png", bytes: "QUJD", size: 3 }],
    });
  });

  it("names and types an attachment the server sent without them", () => {
    const wire = {
      type: "user",
      id: "msg_u",
      time: { created: 1 },
      text: "",
      files: [{ data: "", mime: "", source: { type: "uri", uri: "https://x/a.bin" } }],
    } as unknown as SessionMessageInfo;

    expect(toMessage(wire)).toMatchObject({
      attachments: [{ uri: "", mimeType: "application/octet-stream", name: "attachment" }],
    });
  });

  it("drops a finished assistant entry that carries no text or reasoning", () => {
    // A message steered into a still-busy session leaves one of these behind.
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1, completed: 2 },
      content: [],
    } as unknown as SessionMessageInfo;
    expect(toMessage(wire)).toBeNull();
  });

  it("keeps an unfinished assistant entry that carries no text yet", () => {
    const wire = {
      type: "assistant",
      id: "msg_a",
      time: { created: 1 },
      content: [],
    } as unknown as SessionMessageInfo;
    expect(toMessage(wire)).toMatchObject({ status: "interrupted", text: "" });
  });
});
