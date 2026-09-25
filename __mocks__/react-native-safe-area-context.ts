// The library's own Jest mock: fixed zero insets and a pass-through provider,
// so components that read insets render without a native SafeAreaProvider.
// eslint-disable-next-line @typescript-eslint/no-require-imports
module.exports = require("react-native-safe-area-context/jest/mock").default;
