import { resolvePalette } from "@/src/ui/theme";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { getMarkdownStyles } from "../styles";

function background(style: unknown): unknown {
  return StyleSheet.flatten(style as StyleProp<ViewStyle>)?.backgroundColor;
}

describe("getMarkdownStyles", () => {
  it.each(["light", "dark"] as const)(
    "keeps %s panels distinct from the card the notes sit on",
    (scheme) => {
      const palette = resolvePalette(scheme);
      const page = getMarkdownStyles("assistant", palette);
      const raised = getMarkdownStyles("assistant", palette, "raised");

      // On the page, panels are one step up from the canvas.
      expect(background(page.code_inline)).toBe(palette.surface);
      // On a raised card, none of them may match the card itself.
      for (const style of [raised.code_inline, raised.blockquote, raised.thead]) {
        expect(background(style)).not.toBe(palette.raised);
      }
    },
  );
});
