const { withGradleProperties } = require("expo/config-plugins");

// android/gradle.properties is regenerated from the Expo template by every prebuild run, so these
// settings live in this config plugin instead of in the gitignored android/ directory. The build
// cache is what stops CI from recompiling every module from scratch each run: setup-gradle persists
// ~/.gradle/caches across runs, so the cache survives even though android/ does not.

const PROPERTIES = {
  // More headroom than the template's 2 GB, which is tight for the Kotlin compiles on CI runners.
  "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
  "org.gradle.caching": "true",
};

module.exports = function withAndroidGradlePerformance(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => item.type !== "property" || !(item.key in PROPERTIES),
    );
    for (const [key, value] of Object.entries(PROPERTIES)) {
      config.modResults.push({ type: "property", key, value });
    }
    return config;
  });
};
