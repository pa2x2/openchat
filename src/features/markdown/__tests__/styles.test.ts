import { resolvePalette } from "@/src/ui/theme";
import { getMarkdownTheme } from "../styles";

describe("getMarkdownTheme", () => {
  it.each(["light", "dark"] as const)(
    "keeps %s panels distinct from the card the notes sit on",
    (scheme) => {
      const palette = resolvePalette(scheme);
      const page = getMarkdownTheme("assistant", palette, scheme);
      const raised = getMarkdownTheme("assistant", palette, scheme, "raised");

      // On the page, panels are one step up from the canvas.
      expect(page.panel).toBe(palette.surface);
      // On a raised card, none of them may match the card itself.
      expect(raised.panel).not.toBe(palette.raised);
      expect(raised.inlineCodeBackground).not.toBe(palette.raised);
    },
  );
});
