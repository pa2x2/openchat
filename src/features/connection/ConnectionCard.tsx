/**
 * Connection card: provider config form, connect flow, and status display.
 *
 * The form is driven by the provider descriptor's field list, so a future
 * second backend renders without changing this component.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/src/ui/Button";
import { Input } from "@/src/ui/Input";
import { loadPassword, savePassword } from "@/src/lib/secrets";
import { openCodeDescriptor } from "@/src/providers/registry";
import type { ConnectionConfig } from "@/src/providers/types";
import { useConnectionStore } from "@/src/stores/connection";

const descriptor = openCodeDescriptor;

export function ConnectionCard() {
  const profile = useConnectionStore((state) => state.profile);
  const connectionState = useConnectionStore((state) => state.state);
  const markConnecting = useConnectionStore((state) => state.markConnecting);
  const saveProfile = useConnectionStore((state) => state.saveProfile);
  const markDisconnected = useConnectionStore((state) => state.markDisconnected);

  const [values, setValues] = useState<Record<string, string>>(() => ({
    baseUrl: profile?.baseUrl ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const statusLabel =
    connectionState === "connected"
      ? profile?.serverVersion
        ? `Connected ✓ — OpenCode server v${profile.serverVersion}`
        : "Connected ✓"
      : connectionState === "connecting"
        ? "Connecting…"
        : "Not connected";

  async function handleConnect() {
    setBusy(true);
    setLocalError(null);
    markConnecting();
    try {
      const typedPassword = values.password?.trim() ?? "";
      const storedPassword = typedPassword ? undefined : await loadPassword(descriptor.id);
      const password = typedPassword || storedPassword;
      const cfg: ConnectionConfig = {
        baseUrl: values.baseUrl ?? "",
        credentials: password ? { password } : undefined,
      };
      const provider = descriptor.create(cfg);
      const info = await provider.connect(cfg);
      if (typedPassword) {
        await savePassword(descriptor.id, typedPassword);
      }
      saveProfile({
        providerId: descriptor.id,
        baseUrl: cfg.baseUrl,
        serverVersion: info.serverVersion,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Could not connect to the server.";
      setLocalError(message);
      markDisconnected(message);
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    markDisconnected();
  }

  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-text">Connection</Text>
        <Text
          testID="connection-status"
          accessibilityLabel="Connection status"
          className={
            connectionState === "connected"
              ? "text-sm font-medium text-success"
              : "text-sm font-medium text-text-muted"
          }
        >
          {statusLabel}
        </Text>
      </View>

      {descriptor.fields.map((field) => (
        <Input
          key={field.key}
          label={field.label}
          value={values[field.key] ?? ""}
          onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
          placeholder={field.placeholder}
          secureTextEntry={field.secure}
          autoCapitalize="none"
          autoCorrect={false}
          error={field.key === "baseUrl" ? (localError ?? undefined) : undefined}
          testID={`connection-${field.key}`}
        />
      ))}

      {connectionState === "connected" ? (
        <Button
          label="Disconnect"
          variant="secondary"
          onPress={handleDisconnect}
          disabled={busy}
          testID="connection-disconnect"
        />
      ) : (
        <Button
          label="Connect"
          onPress={handleConnect}
          disabled={busy}
          testID="connection-connect"
        />
      )}

      <Text className="text-xs text-text-muted">
        Run a server with the config in docker/opencode, then enter its URL here.
      </Text>
    </View>
  );
}
