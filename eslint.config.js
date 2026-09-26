const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "scripts/**/*.js"],
    rules: {
      // Provider abstraction rule: nothing above src/providers/ may import OpenCode-specific code.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@opencode/client", "**/providers/opencode/**"],
              message: "OpenCode-specific code may only be imported inside src/providers/.",
            },
          ],
        },
      ],
    },
  },
  {
    // The adapter itself owns OpenCode API knowledge.
    files: ["src/providers/opencode/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // `var(--oc-*)` only resolves inside styles NativeWind compiles. Handed to
    // a navigation option or a native prop it is silently dropped, which is
    // how the header once stayed light over a dark screen.
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: ["src/ui/theme.ts", "src/ui/palette.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["Literal[value=/var\\(--oc-/]", "TemplateElement[value.raw=/var\\(--oc-/]"].map(
          (selector) => ({
            selector,
            message: "Raw CSS variables don't reach native props. Use useAppTheme().colors.",
          }),
        ),
      ],
    },
  },
  {
    ignores: [".expo/**", "node_modules/**", "dist/**", ".agents-workspaces/**"],
  },
]);
