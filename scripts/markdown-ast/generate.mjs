// Regenerates the Jest fixtures for react-native-nitro-markdown from
// __mocks__/react-native-nitro-markdown/inputs.json, using the installed
// package's own parser sources. Needs gcc/g++ (or cc/c++ via CC/CXX).
//
//   node scripts/markdown-ast/generate.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const mocks = join(root, "__mocks__", "react-native-nitro-markdown");
// The package exports no package.json, so find its sources through the root link.
const cpp = join(root, "node_modules", "react-native-nitro-markdown", "cpp");

const build = mkdtempSync(join(tmpdir(), "markdown-ast-"));
const binary = join(build, "markdown-ast");
execFileSync(process.env.CC ?? "gcc", [
  "-c",
  "-O1",
  join(cpp, "nitromd", "nitromd.c"),
  "-o",
  join(build, "nitromd.o"),
]);
execFileSync(process.env.CXX ?? "g++", [
  "-std=c++20",
  "-O1",
  `-I${join(cpp, "core")}`,
  join(here, "main.cpp"),
  join(cpp, "core", "NitroMD4CParser.cpp"),
  join(build, "nitromd.o"),
  "-o",
  binary,
]);

const inputs = JSON.parse(readFileSync(join(mocks, "inputs.json"), "utf8"));
const fixtures = Object.fromEntries(
  Object.entries(inputs).map(([name, text]) => [
    name,
    { text, ast: JSON.parse(execFileSync(binary, { input: text }).toString()) },
  ]),
);
writeFileSync(join(mocks, "fixtures.json"), `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${Object.keys(fixtures).length} fixtures.`);
