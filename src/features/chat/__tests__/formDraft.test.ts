import type { ChatForm } from "@/src/domain";
import { buildAnswer, canSubmit, initialDraft } from "../formDraft";

// A field whose condition fails is off screen: requiring or sending it would
// block the form or answer a question the user never saw.
it("skips fields whose conditions fail and sends hidden defaults", () => {
  const form: ChatForm = {
    id: "frm",
    title: "Web Search",
    fields: [
      { key: "mode", type: "text", required: true, options: [], default: "allow" },
      {
        key: "provider",
        type: "text",
        required: true,
        when: [{ key: "mode", op: "eq", value: "choose" }],
      },
      { key: "source", type: "text", required: false, hidden: true, default: "app" },
    ],
  };
  const draft = initialDraft(form);

  expect(canSubmit(form, draft)).toBe(true);
  expect(buildAnswer(form, draft)).toEqual({ mode: "allow", source: "app" });

  const choosing = { ...draft, mode: "choose" };
  expect(canSubmit(form, choosing)).toBe(false);
  expect(buildAnswer(form, { ...choosing, provider: "exa" })).toEqual({
    mode: "choose",
    provider: "exa",
    source: "app",
  });
});
