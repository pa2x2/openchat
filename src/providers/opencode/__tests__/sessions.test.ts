import type { SessionInfo } from "@opencode/client";
import { toChatSummary } from "../sessions";

describe("toChatSummary", () => {
  it("maps session fields, including the model ref", () => {
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
      model: { provider: "opencode-go", id: "glm-5.3-flash" },
    });
  });

  it("falls back to a placeholder title for untitled sessions", () => {
    const session = { id: "ses_b", time: { created: 1, updated: 2 } } as SessionInfo;
    expect(toChatSummary(session)).toMatchObject({ title: "Untitled chat", model: undefined });
  });
});
