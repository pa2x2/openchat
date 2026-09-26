import type { OpenCodeClient } from "../client";
import { discardRegenerate, prepareRegenerate, regenerate, send } from "../prompt";

interface Call {
  name: string;
  input: unknown;
}

function stubClient(overrides: {
  prompt?: (input: unknown) => Promise<unknown>;
  stage?: (input: unknown) => Promise<unknown>;
  clear?: (input: unknown) => Promise<unknown>;
  calls?: Call[];
}): OpenCodeClient {
  const calls = overrides.calls ?? [];
  return {
    session: {
      prompt: (async (input: unknown) => {
        calls.push({ name: "prompt", input });
        if (overrides.prompt) return overrides.prompt(input);
        return { id: "msg_new" };
      }) as never,
      revert: {
        stage: (async (input: unknown) => {
          calls.push({ name: "stage", input });
          if (overrides.stage) return overrides.stage(input);
          return { messageID: "msg_1", files: [] };
        }) as never,
        clear: (async (input: unknown) => {
          calls.push({ name: "clear", input });
          if (overrides.clear) return overrides.clear(input);
          return undefined;
        }) as never,
      },
    },
  } as unknown as OpenCodeClient;
}

const attachment = {
  uri: "file:///cache/photo.jpg",
  mimeType: "image/jpeg",
  name: "photo.jpg",
  bytes: "QUJD",
  size: 3,
};

describe("send", () => {
  it("sends text only when there are no attachments", async () => {
    const calls: Call[] = [];
    await send(stubClient({ calls }), "ses_1", { id: "u1", text: "hello" });
    expect(calls).toEqual([{ name: "prompt", input: { sessionID: "ses_1", text: "hello" } }]);
  });

  it("inlines attachment bytes as data uris", async () => {
    const calls: Call[] = [];
    await send(stubClient({ calls }), "ses_1", {
      id: "u1",
      text: "look",
      attachments: [attachment],
    });
    expect(calls[0]?.input).toEqual({
      sessionID: "ses_1",
      text: "look",
      files: [{ uri: "data:image/jpeg;base64,QUJD", name: "photo.jpg" }],
    });
  });

  it("falls back to the attachment uri when it carries no bytes", async () => {
    const calls: Call[] = [];
    await send(stubClient({ calls }), "ses_1", {
      id: "u1",
      text: "",
      attachments: [
        { uri: "https://example.com/a.pdf", mimeType: "application/pdf", name: "a.pdf" },
      ],
    });
    expect(calls[0]?.input).toMatchObject({
      text: "",
      files: [{ uri: "https://example.com/a.pdf", name: "a.pdf" }],
    });
  });

  it("skips attachments that can be resolved to nothing", async () => {
    const calls: Call[] = [];
    await send(stubClient({ calls }), "ses_1", {
      id: "u1",
      text: "hi",
      attachments: [{ uri: "", mimeType: "image/png", name: "lost.png" }],
    });
    expect(calls[0]?.input).toEqual({ sessionID: "ses_1", text: "hi" });
  });
});

describe("regenerate", () => {
  it("stages a rollback at the message, without file changes", async () => {
    const calls: Call[] = [];
    await prepareRegenerate(stubClient({ calls }), "ses_1", { id: "msg_old", text: "again" });

    expect(calls).toEqual([
      { name: "stage", input: { sessionID: "ses_1", messageID: "msg_old", files: false } },
    ]);
  });

  it("re-sends the message with its attachments", async () => {
    const calls: Call[] = [];
    await regenerate(stubClient({ calls }), "ses_1", {
      id: "msg_old",
      text: "again",
      attachments: [attachment],
    });

    expect(calls).toEqual([
      {
        name: "prompt",
        input: {
          sessionID: "ses_1",
          text: "again",
          files: [{ uri: "data:image/jpeg;base64,QUJD", name: "photo.jpg" }],
        },
      },
    ]);
  });

  it("drops the prepared rollback when the rerun cannot be delivered", async () => {
    const calls: Call[] = [];
    const client = stubClient({
      calls,
      prompt: async () => {
        throw new Error("offline");
      },
    });

    await expect(regenerate(client, "ses_1", { id: "msg_old", text: "again" })).rejects.toThrow(
      "offline",
    );
    expect(calls.map((call) => call.name)).toEqual(["prompt", "clear"]);
  });

  it("leaves a failed preparation alone: nothing was delivered", async () => {
    const calls: Call[] = [];
    const client = stubClient({
      calls,
      stage: async () => {
        throw new Error("Session is busy");
      },
    });

    await expect(
      prepareRegenerate(client, "ses_1", { id: "msg_old", text: "again" }),
    ).rejects.toThrow("Session is busy");
    expect(calls.map((call) => call.name)).toEqual(["stage"]);
  });
});

describe("discardRegenerate", () => {
  it("clears the staged rollback for the chat", async () => {
    const calls: Call[] = [];
    await discardRegenerate(stubClient({ calls }), "ses_7");
    expect(calls).toEqual([{ name: "clear", input: { sessionID: "ses_7" } }]);
  });
});
