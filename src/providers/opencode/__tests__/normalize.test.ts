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

  it("maps execution failure to a retryable error", () => {
    expect(normalizeV2Event(fixture("session.execution.failed", { sessionID: "ses_a" }))).toEqual({
      type: "error",
      message: "The server failed to complete the reply.",
      retryable: true,
    });
  });

  it("maps server errors with retryability by error type", () => {
    const generic = normalizeV2Event(
      fixture("session.error", {
        sessionID: "ses_a",
        error: { name: "ApiError", data: { message: "upstream 500" } },
      }),
    );
    expect(generic).toEqual({
      type: "error",
      message: "upstream 500",
      retryable: true,
    });

    const aborted = normalizeV2Event(
      fixture("session.error", {
        sessionID: "ses_a",
        error: { name: "MessageAbortedError", data: { message: "aborted" } },
      }),
    );
    expect(aborted).toMatchObject({ type: "error", retryable: false });

    const auth = normalizeV2Event(
      fixture("session.error", {
        sessionID: "ses_a",
        error: { name: "ProviderAuthError", data: { providerID: "p", message: "bad key" } },
      }),
    );
    expect(auth).toMatchObject({ type: "error", retryable: false });
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
