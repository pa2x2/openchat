import { ConnectionError } from "@/src/providers/types";
import type { OpenCodeClient } from "@opencode/client";
import {
  createOpenCodeClient,
  normalizeBaseUrl,
  timeoutSignal,
  toConnectionError,
} from "../client";
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
      switchModel: async () => undefined,
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

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const captureAuthHeader = async (password?: string): Promise<string | null> => {
  let captured: RequestInit | undefined;
  const spyFetch = (async (input: string | URL, init?: RequestInit) => {
    captured = init;
    return ok({ version: "2.0.8" });
  }) as unknown as typeof fetch;
  const client = createOpenCodeClient(
    { baseUrl: "http://srv", credentials: password ? { password } : undefined },
    spyFetch,
  );
  await client.server.info();
  return new Headers(captured?.headers ?? undefined).get("authorization");
};

describe("createOpenCodeClient auth", () => {
  it("sends basic auth only when a password is configured", async () => {
    await expect(captureAuthHeader("secret")).resolves.toBe(
      "Basic b3BlbmNvZGU6c2VjcmV0", // base64("opencode:secret")
    );
  });

  it("omits the header without credentials", async () => {
    await expect(captureAuthHeader(undefined)).resolves.toBeNull();
  });
});

describe("normalizeBaseUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeBaseUrl(" https://srv.example.com/  ")).toBe("https://srv.example.com");
  });

  it("rejects empty, malformed and non-http URLs", () => {
    expect(() => normalizeBaseUrl("")).toThrow(ConnectionError);
    expect(() => normalizeBaseUrl("not a url")).toThrow(ConnectionError);
    expect(() => normalizeBaseUrl("ftp://srv")).toThrow(ConnectionError);
    let thrown: unknown;
    try {
      normalizeBaseUrl("nope");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid-url" });
  });
});

describe("timeoutSignal", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("aborts the signal once the timeout elapses", () => {
    const { signal } = timeoutSignal(20);
    jest.advanceTimersByTime(19);
    expect(signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  it("never aborts once the request is done", () => {
    const { signal, done } = timeoutSignal(20);
    done();
    jest.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(false);
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

  it("yields a terminal error event when the server reports a run failure", async () => {
    const events = [
      {
        type: "session.execution.failed",
        data: {
          sessionID: "ses_a",
          error: {
            type: "provider.auth",
            message: "OpenCode's free tier can only be used from within OpenCode",
            status: 403,
          },
        },
      },
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
    // Non-retryable: the state machine must not reconnect onto the same failure.
    expect(collected).toEqual([
      {
        type: "error",
        message: "OpenCode's free tier can only be used from within OpenCode",
        retryable: false,
      },
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

  it("switches the chat model and its variant through the client", async () => {
    const captured: unknown[] = [];
    const client = stubClient({
      session: {
        ...stubClient().session,
        switchModel: (async (input: unknown) => {
          captured.push(input);
        }) as never,
      },
    } as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(client));
    await provider.setChatModel("ses_a", {
      provider: "opencode",
      id: "claude-sonnet-5",
      variant: "high",
    });
    // No variant resets the chat to the model's default.
    await provider.setChatModel("ses_a", { provider: "opencode", id: "big-pickle" });
    expect(captured).toEqual([
      {
        sessionID: "ses_a",
        model: { providerID: "opencode", id: "claude-sonnet-5", variant: "high" },
      },
      { sessionID: "ses_a", model: { providerID: "opencode", id: "big-pickle" } },
    ]);
  });

  it("lists models with their variants in the server's order", async () => {
    // Trimmed from a real /api/model response.
    const client = stubClient({
      model: {
        list: async () => ({
          location: {},
          data: [
            {
              id: "gpt-6-sol",
              providerID: "opencode",
              name: "GPT-6 Sol",
              enabled: true,
              capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
              limit: { context: 1050000, output: 128000 },
              variants: [
                { id: "none", settings: { reasoningEffort: "none" } },
                { id: "xhigh", settings: { reasoningEffort: "xhigh" } },
                { id: "max", settings: { reasoningEffort: "max" } },
              ],
            },
            {
              id: "big-pickle",
              providerID: "opencode",
              name: "Big Pickle",
              enabled: true,
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              limit: { context: 200000, output: 32000 },
              variants: [],
            },
          ],
        }),
      },
    } as unknown as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(client));
    const models = await provider.listModels();
    expect(models.map((model) => model.variants)).toEqual([
      [
        { id: "none", label: "Off" },
        { id: "xhigh", label: "Extra high" },
        { id: "max", label: "Max" },
      ],
      [],
    ]);
  });

  const oneModel = {
    list: async () => ({
      location: {},
      data: [
        {
          id: "glm-5.3",
          providerID: "opencode-go",
          name: "GLM 5.3",
          enabled: true,
          capabilities: { input: ["text"], output: ["text"] },
          limit: { context: 200000, output: 32000 },
          variants: [],
        },
      ],
    }),
  };

  it("names each model's provider from the provider list", async () => {
    const client = stubClient({
      model: oneModel,
      provider: {
        list: async () => ({
          location: {},
          data: [
            { id: "opencode", name: "OpenCode Zen" },
            { id: "opencode-go", name: "OpenCode Go" },
          ],
        }),
      },
    } as unknown as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(client));
    const [model] = await provider.listModels();
    expect(model.providerLabel).toBe("OpenCode Go");
  });

  it("still lists models when the provider list fails", async () => {
    const client = stubClient({
      model: oneModel,
      provider: {
        list: async () => {
          throw new Error("404");
        },
      },
    } as unknown as Partial<OpenCodeClient>);
    const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, factoryOf(client));
    const models = await provider.listModels();
    expect(models.map((model) => [model.ref.id, model.providerLabel])).toEqual([
      ["glm-5.3", undefined],
    ]);
  });
});
