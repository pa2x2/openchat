module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.(test|spec).[jt]s?(x)"],
  // The official @opencode/client package is ESM-only ("import" exports
  // condition); map to its entry file and let babel transpile it.
  moduleNameMapper: {
    "^@opencode/client$": "<rootDir>/node_modules/@opencode/client/dist/promise/index.js",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@opencode|@ronradtke))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
