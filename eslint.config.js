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
    ignores: [".expo/**", "node_modules/**", "dist/**", ".agents-workspaces/**"],
  },
]);
