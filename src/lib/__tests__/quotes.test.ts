import type { Quote } from "@/src/domain";
import { bodyAfterQuotes, quotedText } from "../quotes";

const quotes: Quote[] = [
  { messageId: "m1", text: "First line\n\nafter a blank one", comment: "Is that so?" },
  { messageId: "m1", text: "const fence = '```';", code: "ts" },
];

// The bubble shows a message's quotes apart from its text by cutting them off
// the front of the text. Code that holds a fence of its own must not end its
// block early, and a text another client changed must be shown whole rather
// than cut where the quotes used to end.
describe("quotes in a message's text", () => {
  it("cuts off exactly the quotes it wrote, and nothing from a text that changed", () => {
    const text = quotedText(quotes, "Explain both.");
    expect(text).toBe(
      "> First line\n>\n> after a blank one\n\nIs that so?\n\n````ts\nconst fence = '```';\n````\n\nExplain both.",
    );
    expect(bodyAfterQuotes(text, quotes)).toBe("Explain both.");
    expect(bodyAfterQuotes(quotedText(quotes, ""), quotes)).toBe("");
    expect(bodyAfterQuotes(text.replace("Is that so?", "Is it?"), quotes)).toBeNull();
    expect(bodyAfterQuotes(`${quotedText(quotes, "")}Explain both.`, quotes)).toBeNull();
  });
});
