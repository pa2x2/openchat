const { withAppBuildGradle } = require("expo/config-plugins");

// Release signing and per-ABI APKs for android/app/build.gradle, which prebuild regenerates.
// Signing reads ANDROID_KEYSTORE_FILE / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS /
// ANDROID_KEY_PASSWORD; without them release builds keep the template's debug signing.

const MARKER = "// @generated openchat-android-release";

const SIGNING_CONFIG = `
        ${MARKER}
        if (System.getenv("ANDROID_KEYSTORE_FILE")) {
            release {
                storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;

// Only release tasks split, so `pnpm android` still produces a single debug APK.
const SPLITS = `    ${MARKER}
    splits {
        abi {
            enable gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
            universalApk true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }
    }
`;

function replaceOnce(contents, pattern, replacement, what) {
  if (!pattern.test(contents)) {
    throw new Error(`withAndroidRelease: could not find ${what} in android/app/build.gradle`);
  }
  return contents.replace(pattern, replacement);
}

function applyRelease(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }
  contents = replaceOnce(
    contents,
    /(signingConfigs \{\n\s*debug \{[^}]*\})/,
    `$1${SIGNING_CONFIG}`,
    "the debug signing config",
  );
  contents = replaceOnce(
    contents,
    /(\n\s*release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
    `$1signingConfig signingConfigs.findByName("release") ?: signingConfigs.debug`,
    "the release build type signing config",
  );
  contents = replaceOnce(
    contents,
    /(\n)(\s*packagingOptions \{)/,
    `$1${SPLITS}$2`,
    "packagingOptions",
  );
  return contents;
}

module.exports = function withAndroidRelease(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withAndroidRelease: expected a Groovy android/app/build.gradle");
    }
    config.modResults.contents = applyRelease(config.modResults.contents);
    return config;
  });
};
