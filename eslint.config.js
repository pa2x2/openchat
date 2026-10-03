const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// Provider abstraction rule: nothing above src/providers/ may import OpenCode-specific code.
const OPENCODE_IMPORTS = {
  group: ["@opencode/client", "**/providers/opencode/**"],
  message: "OpenCode-specific code may only be imported inside src/providers/.",
};

// React Compiler keeps a call's result until its arguments change, so text
// made with the global `t` stays in the language it was made in. See
// src/i18n/index.ts.
const GLOBAL_T = [
  { name: "@/src/i18n", importNames: ["t"] },
  { name: "i18next", importNames: ["t"] },
].map((path) => ({
  ...path,
  message: "Take `t` as a parameter, and pass the one from useTranslation.",
}));

module.exports = defineConfig([
  expoConfig,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "scripts/**/*.js"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [OPENCODE_IMPORTS], paths: GLOBAL_T }],
    },
  },
  {
    // Code that never renders, so its text can be in the language of the moment.
    files: [
      "src/i18n/**",
      "src/stores/**",
      "src/stream/**",
      "src/providers/**",
      "src/features/notifications/**",
      "src/features/updates/installer.ts",
      "src/features/updates/releases.ts",
      "src/features/chat/pickAttachments.ts",
      "src/features/chat/conversationText.ts",
      "src/features/drawer/chatActions.ts",
      "**/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [OPENCODE_IMPORTS] }],
    },
  },
  {
    // Anything that draws itself (a switch, a spinner, a text field, a modal
    // window) takes the platform's colours unless it is told otherwise. So
    // outside src/ui, React Native and the libraries that re-export its
    // components are deny-by-default. A component not listed here must go
    // through a src/ui wrapper, and that wrapper is where its theming gets
    // decided. Only add a name here if it cannot put a platform colour on
    // screen. Types are always allowed.
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: ["src/ui/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              allowTypeImports: true,
              allowImportNames: [
                "View",
                "Image",
                "ScrollView",
                "FlatList",
                "SectionList",
                "StyleSheet",
                "Animated",
                "Easing",
                "useWindowDimensions",
                "Platform",
                "AppState",
                "AppRegistry",
                "BackHandler",
                "Keyboard",
                "Linking",
                "PermissionsAndroid",
              ],
              message:
                "Not on the theme-neutral allowlist. Import it from @/src/ui, wrapping it there first if it isn't yet.",
            },
            {
              name: "react-native-gesture-handler",
              allowTypeImports: true,
              allowImportNames: ["GestureHandlerRootView", "ScrollView", "FlatList"],
              message:
                "Not on the theme-neutral allowlist. Import it from @/src/ui, wrapping it there first if it isn't yet.",
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
