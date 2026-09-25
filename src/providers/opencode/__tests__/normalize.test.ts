import { normalizeV2Event, type V2EventShape } from "../normalize";

/** Event payloads captured from an OpenCode v2.0.8 server. */
const fixture = (type: string, data: V2EventShape["data"]): V2EventShape => ({
  type,
  data,
});

describe("normalizeV2Event", () => {
  it("maps text deltas", () => {
    expect(
      normalizeV2Event(
        fixture("session.text.delta", {
          sessionID: "ses_a",
          assistantMessageID: "msg_a",
          ordinal: 0,
          delta: "hi",
        }),
      ),
    ).toEqual({ type: "text-delta", text: "hi" });
  });

  it("drops empty text deltas", () => {
    expect(
      normalizeV2Event(fixture("session.text.delta", { sessionID: "ses_a", delta: "" })),
    ).toBeNull();
  });

  it("maps reasoning deltas", () => {
    expect(
      normalizeV2Event(
        fixture("session.reasoning.delta", {
          sessionID: "ses_a",
          assistantMessageID: "msg_a",
          delta: "thinking",
        }),
      ),
    ).toEqual({ type: "reasoning-delta", text: "thinking" });
  });

  it("maps step ends to message completion with usage", () => {
    const event = normalizeV2Event(
      fixture("session.step.ended", {
        sessionID: "ses_a",
        assistantMessageID: "msg_a",
        finish: "stop",
        cost: 0.0009,
        tokens: { input: 6530, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
    );
    expect(event).toEqual({
      type: "message-complete",
      usage: { input: 6530, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("maps idle and execution success/interruption to chat-idle", () => {
    expect(normalizeV2Event(fixture("session.idle", { sessionID: "ses_a" }))).toEqual({
      type: "chat-idle",
    });
    expect(
      normalizeV2Event(fixture("session.execution.succeeded", { sessionID: "ses_a" })),
    ).toEqual({ type: "chat-idle" });
    expect(
      normalizeV2Event(fixture("session.execution.interrupted", { sessionID: "ses_a" })),
    ).toEqual({ type: "chat-idle" });
  });

  it("maps execution failure to a terminal error", () => {
    expect(normalizeV2Event(fixture("session.execution.failed", { sessionID: "ses_a" }))).toEqual({
      type: "error",
      message: "The server failed to complete the reply.",
      retryable: false,
    });
  });

  it("preserves a server execution error message", () => {
    expect(
      normalizeV2Event(
        fixture("session.execution.failed", {
          sessionID: "ses_a",
          error: { name: "ProviderAuthError", data: { message: "bad key" } },
        }),
      ),
    ).toEqual({ type: "error", message: "bad key", retryable: false });
  });

  it("reads the error message from the live wire shape", () => {
    // Captured from a v2.0.16 server: the message sits directly on the error
    // object alongside a machine-readable type and status.
    const event = fixture("session.execution.failed", {
      sessionID: "ses_a",
      error: {
        type: "provider.auth",
        message: "OpenCode's free tier can only be used from within OpenCode",
        status: 403,
      },
    });
    expect(normalizeV2Event(event)).toEqual({
      type: "error",
      message: "OpenCode's free tier can only be used from within OpenCode",
      retryable: false,
    });
    expect(normalizeV2Event(fixture("session.error", event.data))).toEqual({
      type: "error",
      message: "OpenCode's free tier can only be used from within OpenCode",
      retryable: false,
    });
  });

  it("falls back when a server error carries no readable message", () => {
    expect(
      normalizeV2Event(
        fixture("session.execution.failed", { sessionID: "ses_a", error: { type: "unknown" } }),
      ),
    ).toEqual({
      type: "error",
      message: "The server failed to complete the reply.",
      retryable: false,
    });
  });

  it("maps server-reported errors to terminal errors", () => {
    const generic = normalizeV2Event(
      fixture("session.error", {
        sessionID: "ses_a",
        error: { name: "ApiError", data: { message: "upstream 500" } },
      }),
    );
    expect(generic).toEqual({
      type: "error",
      message: "upstream 500",
      retryable: false,
    });

    const auth = normalizeV2Event(
      fixture("session.error", {
        sessionID: "ses_a",
        error: { type: "provider.auth", data: { message: "bad key" } },
      }),
    );
    expect(auth).toEqual({ type: "error", message: "bad key", retryable: false });
  });

  it("maps a failed step to a terminal error", () => {
    expect(
      normalizeV2Event(
        fixture("session.step.failed", {
          sessionID: "ses_a",
          assistantMessageID: "msg_a",
          error: {
            type: "provider.quota",
            message: "Upstream request failed: Insufficient account funds",
            status: 402,
          },
        }),
      ),
    ).toEqual({
      type: "error",
      message: "Upstream request failed: Insufficient account funds",
      retryable: false,
    });
  });

  it("drops every event the chat UI must not see", () => {
    const dropped = [
      "server.connected",
      "session.inbox.enqueued",
      "session.inbox.delivered",
      "session.execution.started",
      "session.instructions.updated",
      "session.step.started",
      "session.step.streamed",
      "session.text.started",
      "session.text.ended",
      "session.usage.updated",
      "session.renamed",
      "permission.asked",
      "question.asked",
      "file.watcher.updated",
    ];
    for (const type of dropped) {
      expect(normalizeV2Event(fixture(type, { sessionID: "ses_a" }))).toBeNull();
    }
  });
});
