const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const TOOLCHAIN_VERSION = "21";

module.exports = function withAndroidDaemonJvm(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "gradle-daemon-jvm.properties",
      );
      fs.writeFileSync(file, `toolchainVersion=${TOOLCHAIN_VERSION}\n`);
      return config;
    },
  ]);
};
