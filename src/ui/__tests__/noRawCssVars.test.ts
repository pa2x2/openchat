import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guards the theming contract.
 *
 * `var(--oc-*)` resolves only inside styles NativeWind itself compiles. On
 * native it is a JS variable context, not a real CSS cascade, so a raw
 * `var()` handed to a React Navigation option or a native prop is silently
 * dropped at runtime — which is how the header and tab bar ended up stuck on
 * the light defaults while the screens below them were dark.
 *
 * Anything outside the theme module that needs a colour must read
 * `useAppTheme().colors` or `.navigationTheme` instead.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SEARCH_DIRS = ["app", "src"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const ALLOWED = new Set([
  join("src", "ui", "theme.ts"),
  join("src", "ui", "palette.ts"),
  // This file has to name the pattern in order to search for it.
  join("src", "ui", "__tests__", "noRawCssVars.test.ts"),
  "tailwind.config.js",
]);

/**
 * Matches the variable prefix, built from parts so that this file's own
 * source (and the comments explaining the rule) do not match.
 */
const PATTERN = new RegExp(["var", "\\(", "--oc-"].join(""));

/**
 * Blanks out comments while preserving line numbering, so prose about the rule
 * is never mistaken for a violation. Good enough for this codebase: it tracks
 * string literals, template literals and regular expressions, and the only
 * risk is a `var(`-shaped sequence inside a regex literal, which cannot occur.
 */
function stripComments(source: string): string {
  const out = source.split("");
  let i = 0;
  let quote: string | null = null;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < source.length) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      i++;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const offenders: string[] = [];

for (const dir of SEARCH_DIRS) {
  for (const file of collect(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (ALLOWED.has(rel)) continue;
    stripComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((line: string, index: number) => {
        if (PATTERN.test(line)) {
          offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
  }
}

describe("theming", () => {
  it("never passes a raw CSS variable outside the theme module", () => {
    expect(offenders).toEqual([]);
  });

  it("still flags a real violation, comments aside", () => {
    const sample = [
      'const ok = "bg-surface"; // var(--oc-text) in a comment',
      'const bad = { tint: "rgb(var(--oc-text))" };',
    ].join("\n");

    const flagged = stripComments(sample)
      .split("\n")
      .filter((line: string) => PATTERN.test(line))
      .map((line: string) => line.trim());

    expect(flagged).toEqual(['const bad = { tint: "rgb(var(--oc-text))" };']);
  });
});
