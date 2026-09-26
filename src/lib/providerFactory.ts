/**
 * Construction of provider instances from the persisted connection profile.
 *
 * Screens and stores consume `ChatProvider` only; the concrete adapter is
 * chosen by the registry from the profile's provider id. Instances are
 * memoized per connection profile so a screen re-render never rebuilds the
 * underlying client (the adapter holds sockets and auth headers).
 */

import type { Capabilities } from "@/src/domain";
import type { ChatProvider, ConnectionConfig } from "@/src/providers/types";
import { getProviderDescriptor } from "@/src/providers/registry";
import { useConnectionStore, type ConnectionProfile } from "@/src/stores/connection";
import { loadPassword } from "./secrets";

let cached: { profile: ConnectionProfile; provider: ChatProvider } | null = null;

async function resolveConfig(profile: ConnectionProfile): Promise<ConnectionConfig> {
  const password = await loadPassword(profile.providerId);
  return {
    baseUrl: profile.baseUrl,
    ...(password ? { credentials: { password } } : {}),
  };
}

/**
 * Returns a provider for the current profile, or null when unconnected.
 * A cached instance is reused until the stored profile object is replaced
 * (any successful reconnect saves a fresh profile, which also refreshes
 * credentials).
 */
export async function getProvider(): Promise<ChatProvider | null> {
  const profile = useConnectionStore.getState().profile;
  if (!profile) return null;
  if (cached?.profile === profile) return cached.provider;
  const descriptor = getProviderDescriptor(profile.providerId);
  if (!descriptor) return null;
  const provider = descriptor.create(await resolveConfig(profile));
  cached = { profile, provider };
  return provider;
}

/** Test hook: forget the memoized instance. */
export function resetProviderCache(): void {
  cached = null;
}

/** The capabilities of the active provider, for capabilities-driven UI. */
export function useProviderCapabilities(): Capabilities | null {
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  return providerId ? (getProviderDescriptor(providerId)?.capabilities ?? null) : null;
}
