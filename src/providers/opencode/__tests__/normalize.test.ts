import { normalizeV2Event, type V2EventShape } from "../normalize";

const event = (type: string, data: V2EventShape["data"] = {}): V2EventShape => ({
  type,
  data: { sessionID: "ses_a", ...data },
});

describe("normalizeV2Event", () => {
  it("maps step ends to message completion with usage", () => {
    const ended = event("session.step.ended", {
      tokens: { input: 6530, output: 2, reasoning: 0, cache: { read: 1, write: 3 } },
    });
    expect(normalizeV2Event(ended)).toEqual({
      type: "message-complete",
      usage: { input: 6530, output: 2, reasoning: 0, cacheRead: 1, cacheWrite: 3 },
    });
  });

  it("ends the turn on idle, success and interruption", () => {
    for (const type of [
      "session.idle",
      "session.execution.succeeded",
      "session.execution.interrupted",
    ]) {
      expect(normalizeV2Event(event(type))).toEqual({ type: "chat-idle" });
    }
  });

  it("reads the server's error message from either wire shape", () => {
    // v2.0.8 nests the message under `data`; v2.0.16 puts it on the error.
    const legacy = { name: "ProviderAuthError", data: { message: "bad key" } };
    const live = { type: "provider.quota", message: "Insufficient account funds", status: 402 };
    expect(normalizeV2Event(event("session.execution.failed", { error: legacy }))).toEqual({
      type: "error",
      message: "bad key",
      retryable: false,
    });
    for (const type of ["session.error", "session.step.failed"]) {
      expect(normalizeV2Event(event(type, { error: live }))).toMatchObject({
        message: "Insufficient account funds",
      });
    }
    expect(
      normalizeV2Event(event("session.execution.failed", { error: { type: "unknown" } })),
    ).toMatchObject({ message: "The server failed to complete the reply." });
  });

  it("drops every event the chat UI must not see", () => {
    const dropped = [
      "server.connected",
      "session.inbox.enqueued",
      "session.execution.started",
      "session.text.ended",
      "session.usage.updated",
      "session.renamed",
      "permission.asked",
      "question.asked",
    ];
    for (const type of dropped) {
      expect(normalizeV2Event(event(type))).toBeNull();
    }
    expect(normalizeV2Event(event("session.text.delta", { delta: "" }))).toBeNull();
  });
});
