const { withGradleProperties } = require("expo/config-plugins");

const PROPERTIES = {
  // More headroom than the template's 2 GB, which is tight for the Kotlin compiles on CI runners.
  "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
  "org.gradle.caching": "true",
  "android.enableBundleCompression": "true",
  "expo.useLegacyPackaging": "true",
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

module.exports = function withAndroidGradleProperties(config) {
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
