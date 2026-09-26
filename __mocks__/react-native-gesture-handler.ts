// RNGH's ScrollView throws outside a GestureHandlerRootView, and its jestSetup
// only mocks the v2 components. Tests can't exercise gesture arbitration
// anyway, so a plain RN ScrollView stands in.
/* eslint-disable @typescript-eslint/no-require-imports */
module.exports = {
  ...jest.requireActual("react-native-gesture-handler"),
  ScrollView: require("react-native").ScrollView,
};
