/**
 * Secret storage for server credentials.
 *
 * Passwords never touch plain app storage; they live in the OS-backed
 * secure store, namespaced per provider.
 */

import * as SecureStore from "expo-secure-store";
import type { ProviderId } from "@/src/domain";

function key(providerId: ProviderId): string {
  return `connection.password.${providerId}`;
}

export async function loadPassword(providerId: ProviderId): Promise<string | undefined> {
  const value = await SecureStore.getItemAsync(key(providerId));
  return value ?? undefined;
}

export async function savePassword(providerId: ProviderId, password: string): Promise<void> {
  await SecureStore.setItemAsync(key(providerId), password);
}

export async function clearPassword(providerId: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(key(providerId));
}
