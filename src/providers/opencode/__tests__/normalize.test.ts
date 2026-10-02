import { normalizeV2Event, webSources, type V2EventShape } from "../normalize";

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

  // Only a call's first event names its tool, and a reconnect can lose it:
  // the later ones have to be told apart by what they carry.
  it("tells a question call's events from any other tool's", () => {
    const questions = [{ header: "Stay", question: "How long?", options: [] }];
    expect(
      normalizeV2Event(event("session.tool.called", { id: "t", input: { questions } })),
    ).toEqual({
      type: "form-result",
      id: "t",
      update: { status: "waiting", questions: ["How long?"] },
    });
    expect(
      normalizeV2Event(event("session.tool.success", { id: "t", metadata: { answers: [["1"]] } })),
    ).toEqual({ type: "form-result", id: "t", update: { status: "answered", answers: [["1"]] } });
    const dismissed = { type: "unknown", message: "The user dismissed this question" };
    expect(normalizeV2Event(event("session.tool.failed", { id: "t", error: dismissed }))).toEqual({
      type: "form-result",
      id: "t",
      update: { status: "dismissed" },
    });
    // Dismissing stops the run; that is not the reply failing.
    const aborted = { type: "aborted", message: "Step interrupted" };
    expect(normalizeV2Event(event("session.step.failed", { error: aborted }))).toBeNull();

    expect(
      normalizeV2Event(event("session.tool.called", { id: "t", input: { query: "expo" } })),
    ).toEqual({ type: "tool", id: "t", update: { subject: "expo" } });
    expect(normalizeV2Event(event("session.tool.failed", { id: "t", error: aborted }))).toEqual({
      type: "tool",
      id: "t",
      update: { status: "failed" },
    });
  });

  it("drops every event the chat UI must not see", () => {
    const dropped = [
      "server.connected",
      "session.inbox.enqueued",
      "session.text.ended",
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

describe("webSources", () => {
  it("lists the hits of a search result, not the links in their snippets", () => {
    // Trimmed from a real `websearch` result (provider: firecrawl, server 2.0.19).
    const text = [
      "## [React Native 0.82 - A New Era](https://reactnative.dev/blog/2025/10/08/react-native-0.82)",
      "",
      "Today we're excited to release React Native 0.82.",
      "",
      "## Other changes [\u200b](https://reactnative.dev/blog/2025/10/08/react-native-0.82#other-changes)",
      "- [High Resolution Time](https://www.w3.org/TR/hr-time-3/): defines `performance.now()`.",
      "## [Versions - React Native](https://reactnative.dev/versions)",
      "## [\u200eReact Native Release Notes | Sprinklr](https://www.sprinklr.com/help/rn)",
      "## [React Native 0.82 - A New Era](https://reactnative.dev/blog/2025/10/08/react-native-0.82)",
    ].join("\n");
    expect(webSources([{ type: "text", text }])).toEqual([
      {
        title: "React Native 0.82 - A New Era",
        url: "https://reactnative.dev/blog/2025/10/08/react-native-0.82",
      },
      { title: "Versions - React Native", url: "https://reactnative.dev/versions" },
      { title: "React Native Release Notes | Sprinklr", url: "https://www.sprinklr.com/help/rn" },
    ]);
  });
});
