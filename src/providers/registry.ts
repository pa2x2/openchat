/**
 * Registry of chat backend providers.
 *
 * A `ProviderDescriptor` drives the connection form (its `fields`) and
 * constructs provider instances; screens and stores never reference a
 * concrete adapter directly.
 */

import { t } from "@/src/i18n";
import type { ConfigField, ConnectionConfig, ProviderDescriptor } from "./types";
import { OpenCodeProvider, openCodeCapabilities } from "./opencode/provider";

const openCodeDescriptor: ProviderDescriptor = {
  id: "opencode",
  label: "OpenCode",
  // A getter, so the labels are in the language of the moment, not the
  // one the app started in.
  get fields(): ConfigField[] {
    return [
      {
        key: "baseUrl",
        label: t("connection.opencode.url.label"),
        description: t("connection.opencode.url.description"),
        required: true,
        placeholder: "https://opencode.example.com",
        keyboardType: "url",
      },
      {
        key: "password",
        label: t("connection.opencode.password.label"),
        description: t("connection.opencode.password.description"),
        required: false,
        secure: true,
        placeholder: t("connection.opencode.password.placeholder"),
      },
    ];
  },
  capabilities: openCodeCapabilities,
  create(cfg: ConnectionConfig) {
    return new OpenCodeProvider(cfg);
  },
};

const descriptors: ProviderDescriptor[] = [openCodeDescriptor];

export function getProviderDescriptor(id: string): ProviderDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === id);
}

export function listProviderDescriptors(): ProviderDescriptor[] {
  return descriptors;
}
