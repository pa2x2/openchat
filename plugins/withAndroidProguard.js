const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @generated openchat-android-proguard";

const PROGUARD_FILES =
  '            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro", "$rootDir/../plugins/proguard-rules.pro"';

function applyProguard(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }
  const pattern =
    /^(\s*)proguardFiles getDefaultProguardFile\("proguard-android\.txt"\), "proguard-rules\.pro"$/m;
  if (!pattern.test(contents)) {
    throw new Error(
      "withAndroidProguard: could not find the proguardFiles line in android/app/build.gradle",
    );
  }
  return contents.replace(
    pattern,
    (match, indent) => `${indent}${MARKER}\n${indent}${PROGUARD_FILES.trim()}`,
  );
}

module.exports = function withAndroidProguard(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withAndroidProguard: expected a Groovy android/app/build.gradle");
    }
    config.modResults.contents = applyProguard(config.modResults.contents);
    return config;
  });
};
