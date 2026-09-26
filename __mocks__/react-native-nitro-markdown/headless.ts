/**
 * Jest mock for react-native-nitro-markdown's headless parser. The real one is
 * a native module, so tests read ASTs the real parser produced for known
 * inputs (fixtures.json). To add one, put the text in inputs.json and run
 * `node scripts/markdown-ast/generate.mjs`.
 *
 * Unknown text throws like an unavailable native parser does, which the app
 * handles by showing the text unformatted.
 */
import fixtures from "./fixtures.json";

const byText = new Map<string, unknown>(
  Object.values(fixtures).map((fixture) => [fixture.text, fixture.ast]),
);

export function parseMarkdownWithOptions(text: string): unknown {
  if (!byText.has(text)) throw new Error("No markdown fixture for this text");
  // A fresh copy per parse, as the native parser returns.
  return structuredClone(byText.get(text));
}
