import type { SessionInfo } from "@opencode/client";
import { toChatSummary } from "../sessions";

describe("toChatSummary", () => {
  it("maps session fields, including the model ref and its variant", () => {
    const session: SessionInfo = {
      id: "ses_a",
      title: "Greeting request",
      model: { id: "glm-5.3-flash", providerID: "opencode-go", variant: "max" },
      time: { created: 1, updated: 42 },
    } as SessionInfo;
    expect(toChatSummary(session)).toEqual({
      id: "ses_a",
      title: "Greeting request",
      updatedAt: 42,
      model: { provider: "opencode-go", id: "glm-5.3-flash", variant: "max" },
    });
  });

  it('reads the server\'s "default" variant as no variant', () => {
    // What the server reports after switching to a model without a variant.
    const session = {
      id: "ses_c",
      model: { id: "claude-sonnet-5", providerID: "opencode", variant: "default" },
      time: { created: 1, updated: 2 },
    } as SessionInfo;
    expect(toChatSummary(session).model).toEqual({ provider: "opencode", id: "claude-sonnet-5" });
  });

  it("falls back to a placeholder title for untitled sessions", () => {
    const session = { id: "ses_b", time: { created: 1, updated: 2 } } as SessionInfo;
    expect(toChatSummary(session)).toMatchObject({ title: "Untitled chat", model: undefined });
  });
});
