/**
 * Registry of chat backend providers.
 *
 * A `ProviderDescriptor` drives the connection form (its `fields`) and
 * constructs provider instances; screens and stores never reference a
 * concrete adapter directly.
 */

import type { ConnectionConfig, ProviderDescriptor } from "./types";
import { OpenCodeProvider } from "./opencode/provider";

export const openCodeDescriptor: ProviderDescriptor = {
  id: "opencode",
  label: "OpenCode",
  fields: [
    {
      key: "baseUrl",
      label: "Server URL",
      description: "The address of your OpenCode server, e.g. http://192.168.1.10:4096.",
      required: true,
      placeholder: "https://opencode.example.com",
      keyboardType: "url",
    },
    {
      key: "password",
      label: "Password",
      description: "The server's password (opencode serve prints one on startup).",
      required: false,
      secure: true,
      placeholder: "Server password",
    },
  ],
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
