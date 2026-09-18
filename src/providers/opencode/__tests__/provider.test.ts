import { ConnectionError } from "@/src/providers/types";
import type { OpenCodeClient } from "@opencode/client";
import { normalizeBaseUrl, timeoutSignal, toConnectionError } from "../client";
import { OpenCodeProvider } from "../provider";

function clientError(reason: string, cause?: unknown): Error {
  return Object.assign(new Error(reason, { cause }), { name: "ClientError", reason });
}

/** Minimal stub of the OpenCodeClient surface the provider uses. */
function stubClient(overrides: Partial<OpenCodeClient> = {}): OpenCodeClient {
  return {
    server: { info: async () => ({ version: "2.0.8" }) },
    session: {
      list: async () => ({ data: [], cursor: {} }),
      create: async () => ({ id: "ses_new" }),
      remove: async () => undefined,
      prompt: async () => ({ id: "msg_1", sessionID: "ses_1" }),
      interrupt: async () => ({ interrupted: true }),
    },
    message: { list: async () => ({ data: [], cursor: {} }) },
    model: { list: async () => ({ location: {}, data: [] }) },
    event: {
      subscribe: () => ({
        [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
      }),
    },
    ...overrides,
  } as unknown as OpenCodeClient;
}

const factoryOf = (client: OpenCodeClient) => () => client;

describe("normalizeBaseUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeBaseUrl(" https://srv.example.com/  ")).toBe("https://srv.example.com");
  });

  it("rejects empty, malformed and non-http URLs", () => {
    expect(() => normalizeBaseUrl("")).toThrow(ConnectionError);
    expect(() => normalizeBaseUrl("not a url")).toThrow(ConnectionError);
    expect(() => normalizeBaseUrl("ftp://srv")).toThrow(ConnectionError);
    try {
      normalizeBaseUrl("nope");
    } catch (error) {
      expect((error as ConnectionError).code).toBe("invalid-url");
    }
  });
});

describe("timeoutSignal", () => {
  it("aborts the signal after the timeout and cleans up", async () => {
    const { signal, done } = timeoutSignal(20);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(true);
    expect(() => done()).not.toThrow();
  });
});

describe("toConnectionError", () => {
  it("maps client transport failures to unreachable", () => {
    const error = clientError("Transport", new Error("fetch failed"));
    expect(toConnectionError(error)).toMatchObject({ code: "unreachable", retryable: true });
  });

  it("maps client aborts to timeout", () => {
    const abort = Object.assign(new Error("Aborted"), { name: "AbortError" });
    const error = clientError("Transport", abort);
    expect(toConnectionError(error).code).toBe("timeout");
  });

  it("maps unexpected statuses by code", () => {
    const unauthorized = toConnectionError(clientError("UnexpectedStatus", { status: 401 }));
    expect(unauthorized).toMatchObject({
      code: "unauthorized",
      message: "The server rejected the request.",
      retryable: false,
    });
    const serverError = toConnectionError(clientError("UnexpectedStatus", { status: 503 }));
    expect(serverError).toMatchObject({ code: "server-error", retryable: true });
    const badRequest = toConnectionError(clientError("UnexpectedStatus", { status: 400 }));
    expect(badRequest.code).toBe("unknown");
  });

  it("maps the client's declared-status empty-body case (401) to unauthorized", () => {
    // A stock v2.0.8 server answers unauthenticated /api/info with a bare
    // 401; the client's declared-status path then loses the status and
    // throws UnsupportedContentType without a cause.
    const error = clientError("UnsupportedContentType");
    expect(toConnectionError(error)).toMatchObject({
      code: "unauthorized",
      message: "The server rejected the request.",
      retryable: false,
    });
  });

  it("still maps network failures from injected fetch impls", () => {
    expect(toConnectionError(new TypeError("Network request failed"))).toMatchObject({
      code: "unreachable",
      retryable: true,
    });
    expect(
      toConnectionError(
        new Error("fetch failed: java.net.ConnectException: Failed to connect to /10.0.2.2:9999"),
      ),
    ).toMatchObject({ code: "unreachable", retryable: true });
  });
});

describe("OpenCodeProvider", () => {
  it("returns the server version on connect", async () => {
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(stubClient()));
    await expect(provider.connect()).resolves.toEqual({ serverVersion: "2.0.8" });
  });

  it("maps a 401 to unauthorized with a user-facing message", async () => {
    const failing = stubClient({
      server: {
        info: (async () => {
          throw clientError("UnexpectedStatus", { status: 401 });
        }) as never,
      },
    });
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(failing));
    await expect(provider.connect()).rejects.toMatchObject({
      code: "unauthorized",
      message: "The server rejected the request.",
      retryable: false,
    });
  });

  it("maps network failures to unreachable", async () => {
    const failing = stubClient({
      server: {
        info: (async () => {
          throw clientError("Transport", new Error("fetch failed"));
        }) as never,
      },
    });
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(failing));
    await expect(provider.connect()).rejects.toMatchObject({
      code: "unreachable",
      retryable: true,
    });
  });

  it("maps invalid URLs to invalid-url without retry", async () => {
    const provider = new OpenCodeProvider({ baseUrl: "not-a-url" });
    await expect(provider.connect()).rejects.toMatchObject({
      code: "invalid-url",
      retryable: false,
    });
  });

  it("lists chats through the client and maps titles/models", async () => {
    const listing = stubClient({
      session: {
        ...stubClient().session,
        list: (async () => ({
          data: [
            {
              id: "ses_a",
              title: "Greeting request",
              model: { id: "glm-5.3-flash", providerID: "opencode-go" },
              time: { created: 1, updated: 42 },
            },
            { id: "ses_archived", time: { created: 1, updated: 5, archived: 6 } },
          ],
          cursor: {},
        })) as never,
      },
    } as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(listing));
    const chats = await provider.listChats();
    expect(chats).toEqual([
      {
        id: "ses_a",
        title: "Greeting request",
        updatedAt: 42,
        model: { provider: "opencode-go", id: "glm-5.3-flash" },
      },
    ]);
  });

  it("maps assistant/user message history and skips non-chat entries", async () => {
    const history = stubClient({
      message: {
        list: (async () => ({
          data: [
            { type: "user", id: "msg_u", time: { created: 1 }, text: "hi" },
            {
              type: "assistant",
              id: "msg_a",
              time: { created: 2, completed: 3 },
              agent: "chat",
              model: { id: "m", providerID: "p" },
              content: [
                { type: "reasoning", text: "thinking" },
                { type: "text", text: "hello" },
              ],
              finish: "stop",
              tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } },
            },
            { type: "idle", id: "msg_i" },
          ],
          cursor: {},
        })) as never,
      },
    } as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(history));
    const messages = await provider.fetchMessages("ses_x");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", text: "hi" });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      text: "hello",
      reasoning: "thinking",
      status: "complete",
      usage: { input: 1, output: 2, reasoning: 3, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("streams normalized events for one session only", async () => {
    const events = [
      { type: "server.connected", data: {} },
      {
        type: "session.text.delta",
        data: { sessionID: "ses_a", assistantMessageID: "msg_a", delta: "hi" },
      },
      { type: "session.text.delta", data: { sessionID: "ses_other", delta: "nope" } },
      {
        type: "session.step.ended",
        data: {
          sessionID: "ses_a",
          tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      },
      { type: "session.execution.succeeded", data: { sessionID: "ses_a" } },
    ];
    const subscribing = stubClient({
      event: {
        subscribe: () =>
          (async function* () {
            for (const event of events) yield event;
          })(),
      },
    } as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(subscribing));
    const collected = [];
    for await (const event of provider.events("ses_a", new AbortController().signal)) {
      collected.push(event);
    }
    expect(collected).toEqual([
      { type: "text-delta", text: "hi" },
      {
        type: "message-complete",
        usage: { input: 1, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      },
      { type: "chat-idle" },
    ]);
  });

  it("yields a retryable error event when the subscription fails", async () => {
    const failing = stubClient({
      event: {
        subscribe: () =>
          (async function* () {
            throw clientError("Transport", new Error("boom"));
          })(),
      },
    } as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(failing));
    const collected = [];
    for await (const event of provider.events("ses_a", new AbortController().signal)) {
      collected.push(event);
    }
    expect(collected).toEqual([
      { type: "error", message: "Could not reach the server.", retryable: true },
    ]);
  });
});
