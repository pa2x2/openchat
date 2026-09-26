import type { SessionMessageInfo } from "@opencode/client";
import { toMessages } from "../messages";

const wire = (message: Record<string, unknown>) => message as unknown as SessionMessageInfo;

describe("toMessages", () => {
  it("merges a run's steps into one reply, in order, with its tool calls", () => {
    // Shape and order as the server lists them: newest first, one assistant
    // entry per model step, closed by an idle entry.
    const listed = [
      { type: "idle", id: "i", time: { created: 90 }, outcome: "succeeded" },
      {
        type: "assistant",
        id: "msg_3",
        time: { created: 60, completed: 89 },
        finish: "stop",
        content: [{ type: "text", text: "Expo SDK 57 is out." }],
        tokens: { input: 900, output: 40, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      {
        type: "assistant",
        id: "msg_2",
        time: { created: 30, completed: 59 },
        finish: "tool-calls",
        content: [
          { type: "reasoning", text: "Fetch the changelog." },
          { type: "text", text: "Reading the changelog." },
          {
            type: "tool",
            id: "call_2",
            name: "webfetch",
            state: { status: "completed", input: { url: "https://expo.dev/changelog" } },
            time: { created: 31 },
          },
        ],
      },
      {
        type: "assistant",
        id: "msg_1",
        time: { created: 11, completed: 29 },
        finish: "tool-calls",
        content: [
          { type: "text", text: "" },
          {
            type: "tool",
            id: "call_1",
            name: "websearch",
            state: { status: "error", input: { query: "expo sdk" }, error: { message: "503" } },
            time: { created: 12 },
          },
        ],
      },
      { type: "user", id: "msg_u", time: { created: 10 }, text: "Latest Expo SDK?" },
    ].map(wire);

    const messages = toMessages(listed);

    expect(messages.map((message) => message.id)).toEqual(["msg_u", "msg_1"]);
    expect(messages[1]).toEqual({
      id: "msg_1",
      role: "assistant",
      text: "Reading the changelog.\n\nExpo SDK 57 is out.",
      parts: [
        {
          type: "tool",
          tool: {
            id: "call_1",
            name: "websearch",
            category: "web-search",
            subject: "expo sdk",
            status: "failed",
          },
        },
        { type: "reasoning", text: "Fetch the changelog." },
        { type: "text", text: "Reading the changelog." },
        {
          type: "tool",
          tool: {
            id: "call_2",
            name: "webfetch",
            category: "web-fetch",
            subject: "https://expo.dev/changelog",
            status: "done",
          },
        },
        { type: "text", text: "Expo SDK 57 is out." },
      ],
      status: "complete",
      usage: { input: 900, output: 40, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      createdAt: 11,
      completedAt: 90,
    });
  });

  it("tells an unfinished reply from a failed or stopped one", () => {
    const unfinished = { type: "assistant", id: "a", time: { created: 1 }, content: [] };
    expect(toMessages([wire(unfinished)])[0]).toMatchObject({ status: "interrupted", text: "" });
    expect(toMessages([wire({ ...unfinished, error: { message: "boom" } })])[0]).toMatchObject({
      status: "error",
    });
    // The server may close a stopped run's last step as completed.
    const stopped = [
      {
        type: "assistant",
        id: "a",
        time: { created: 1, completed: 2 },
        content: [{ type: "text", text: "Half" }],
      },
      { type: "idle", id: "i", time: { created: 5 }, outcome: "interrupted" },
    ].map(wire);
    expect(toMessages(stopped)[0]).toMatchObject({ status: "interrupted", completedAt: 5 });
  });

  it("drops entries the transcript must not show", () => {
    // A message steered into a still-busy session leaves an empty finished reply.
    const empty = { type: "assistant", id: "a", time: { created: 1, completed: 2 }, content: [] };
    expect(
      toMessages([wire(empty), wire({ type: "idle", id: "i", time: { created: 3 } })]),
    ).toEqual([]);
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
    expect(toMessages([message])[0].attachments).toEqual([
      { uri: "", mimeType: "image/png", name: "photo.png", bytes: "QUJD", size: 3 },
      expect.objectContaining({ mimeType: "application/octet-stream", name: "attachment" }),
    ]);
  });
});
