import type { OpenCodeClient } from "@opencode/client";
import type { StreamEvent } from "@/src/domain";
import { createOpenCodeClient, toConnectionError } from "../client";
import { OpenCodeProvider } from "../provider";

function clientError(reason: string, cause?: unknown): Error {
  return Object.assign(new Error(reason, { cause }), { name: "ClientError", reason });
}

async function collectEvents(subscribe: () => AsyncIterable<unknown>): Promise<StreamEvent[]> {
  const client = { event: { subscribe } } as unknown as OpenCodeClient;
  const provider = new OpenCodeProvider({ baseUrl: "http://srv" }, () => client);
  const collected: StreamEvent[] = [];
  for await (const event of provider.events("ses_a", new AbortController().signal)) {
    collected.push(event);
  }
  return collected;
}

it("sends basic auth only when a password is configured", async () => {
  const authHeader = async (password?: string) => {
    let captured: RequestInit | undefined;
    const spyFetch = (async (_input: string | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ version: "2.0.8" }), {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = createOpenCodeClient(
      { baseUrl: "http://srv", credentials: password ? { password } : undefined },
      spyFetch,
    );
    await client.server.info();
    return new Headers(captured?.headers).get("authorization");
  };

  await expect(authHeader("secret")).resolves.toBe("Basic b3BlbmNvZGU6c2VjcmV0"); // opencode:secret
  await expect(authHeader(undefined)).resolves.toBeNull();
});

describe("toConnectionError", () => {
  it("maps client transport failures to unreachable", () => {
    const error = clientError("Transport", new Error("fetch failed"));
    expect(toConnectionError(error)).toMatchObject({ code: "unreachable", retryable: true });
  });

  it("maps the client's declared-status empty-body case (401) to unauthorized", () => {
    // A stock v2.0.8 server answers unauthenticated /api/info with a bare
    // 401; the client's declared-status path then loses the status and
    // throws UnsupportedContentType without a cause.
    expect(toConnectionError(clientError("UnsupportedContentType"))).toMatchObject({
      code: "unauthorized",
      retryable: false,
    });
  });
});

describe("OpenCodeProvider.events", () => {
  it("streams normalized events for one session only", async () => {
    const wire = [
      { type: "server.connected", data: {} },
      { type: "session.text.delta", data: { sessionID: "ses_a", delta: "hi" } },
      { type: "session.text.delta", data: { sessionID: "ses_other", delta: "nope" } },
      { type: "session.execution.succeeded", data: { sessionID: "ses_a" } },
    ];
    const events = await collectEvents(async function* () {
      yield* wire;
    });
    expect(events).toEqual([{ type: "text-delta", text: "hi" }, { type: "chat-idle" }]);
  });

  it("yields a retryable error when the subscription fails", async () => {
    const events = await collectEvents(async function* () {
      throw clientError("Transport", new Error("boom"));
    });
    expect(events).toEqual([
      { type: "error", message: "Could not reach the server.", retryable: true },
    ]);
  });
});
