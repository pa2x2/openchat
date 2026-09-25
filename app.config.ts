import type { ConfigContext, ExpoConfig } from "expo/config";

import { version, versionCode } from "./package.json";

// package.json is the single source of the app version and Android versionCode;
// app.json intentionally has neither.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "OpenChat",
  slug: config.slug ?? "openchat",
  version,
  android: { ...config.android, versionCode },
});
