/**
 * Connection card: provider config form, connect flow, and status display.
 *
 * The form is driven by the provider descriptor's field list, so a future
 * second backend renders without changing this component.
 *
 * Once a server is saved, the card shows whether the app can reach it
 * (judged by the last chat-list refresh, as the sidebar does, since a live
 * status would reset on every launch). Editing a field offers to save and
 * reconnect; otherwise the only action is forgetting the server.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Button } from "@/src/ui/Button";
import { Icon } from "@/src/ui/Icon";
import { Input } from "@/src/ui/Input";
import { showDialog } from "@/src/ui/Dialog";
import { cn } from "@/src/lib/cn";
import { clearPassword, loadPassword, savePassword } from "@/src/lib/secrets";
import { useProviderDescriptor } from "@/src/lib/providerFactory";
import { listProviderDescriptors } from "@/src/providers/registry";
import type { ConnectionConfig } from "@/src/providers/types";
import { useChatsStore } from "@/src/stores/chats";
import { useConnectionStore } from "@/src/stores/connection";
import { useMessagesStore } from "@/src/stores/messages";
import { useModelsStore } from "@/src/stores/models";
import { useUsageStore } from "@/src/stores/usage";

export function ConnectionCard() {
  // Only one backend ships, so an unconnected app offers the first one
  // rather than a picker.
  const descriptor = useProviderDescriptor() ?? listProviderDescriptors()[0];
  const profile = useConnectionStore((state) => state.profile);
  const connectionState = useConnectionStore((state) => state.state);
  const markConnecting = useConnectionStore((state) => state.markConnecting);
  const saveProfile = useConnectionStore((state) => state.saveProfile);
  const markDisconnected = useConnectionStore((state) => state.markDisconnected);
  const chatsError = useChatsStore((state) => state.error);

  const savedUrl = profile?.baseUrl ?? "";
  const [values, setValues] = useState<Record<string, string>>(() => ({ baseUrl: savedUrl }));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void loadPassword(profile.providerId)
      .then((password) => {
        if (!cancelled) setPasswordSaved(Boolean(password));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const typedPassword = values.password?.trim() ?? "";
  const edited = profile !== null && (values.baseUrl.trim() !== savedUrl || typedPassword !== "");

  const status: { label: string; tone: "ok" | "busy" | "bad" | "none" } =
    connectionState === "connecting"
      ? { label: "Connecting…", tone: "busy" }
      : !profile
        ? { label: "Not connected", tone: "none" }
        : chatsError
          ? { label: "Can’t reach the server", tone: "bad" }
          : {
              label: profile.serverVersion
                ? `Connected — ${descriptor.label} v${profile.serverVersion}`
                : "Connected",
              tone: "ok",
            };

  async function handleConnect() {
    setBusy(true);
    setLocalError(null);
    markConnecting();
    try {
      const storedPassword = typedPassword ? undefined : await loadPassword(descriptor.id);
      const password = typedPassword || storedPassword;
      const cfg: ConnectionConfig = {
        baseUrl: values.baseUrl.trim(),
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
      setValues({ baseUrl: cfg.baseUrl });
      // The chat list may be another server's, or stale from before the reconnect.
      void useChatsStore.getState().refresh();
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

  function handleCancel() {
    setValues({ baseUrl: savedUrl });
    setLocalError(null);
  }

  function handleForget() {
    if (!profile) return;
    const { providerId, baseUrl } = profile;
    showDialog({
      title: "Forget this server?",
      message: "The app forgets its address and password. Your chats stay on the server.",
      actions: [
        { label: "Cancel", style: "cancel" },
        {
          label: "Forget",
          style: "destructive",
          onPress: () => {
            void clearPassword(providerId).catch(() => undefined);
            useConnectionStore.getState().forget();
            useChatsStore.getState().clear();
            useModelsStore.getState().clear();
            useUsageStore.getState().forgetServer(baseUrl);
            const messages = useMessagesStore.getState();
            for (const chatId of Object.keys(messages.byChat)) messages.removeChat(chatId);
            setValues({ baseUrl: "" });
            setPasswordSaved(false);
            setLocalError(null);
          },
        },
      ],
    });
  }

  return (
    <View className="gap-3 rounded-[20px] bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <View
          className={cn(
            "h-2 w-2 rounded-full",
            status.tone === "ok"
              ? "bg-success"
              : status.tone === "busy"
                ? "bg-primary"
                : status.tone === "bad"
                  ? "bg-danger"
                  : "bg-text-faint",
          )}
        />
        <Text
          testID="connection-status"
          accessibilityLiveRegion="polite"
          className={cn(
            "flex-1 text-sm font-medium",
            status.tone === "ok"
              ? "text-success"
              : status.tone === "bad"
                ? "text-danger"
                : "text-text-muted",
          )}
        >
          {status.label}
        </Text>
      </View>

      {descriptor.fields.map((field) => {
        // A saved password is never read back into the field; it shows as
        // saved until the user types a new one.
        const showSaved = field.key === "password" && passwordSaved && !values[field.key];
        return (
          <Input
            key={field.key}
            label={field.label}
            value={values[field.key] ?? ""}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
            placeholder={showSaved ? "••••••••" : field.placeholder}
            secureTextEntry={field.secure}
            autoCapitalize="none"
            autoCorrect={false}
            error={field.key === "baseUrl" ? (localError ?? undefined) : undefined}
            trailing={
              showSaved ? (
                <View className="flex-row items-center gap-1">
                  <Icon name="lock-outline" size={15} tone="textMuted" />
                  <Text className="text-[13px] text-text-muted">Saved</Text>
                </View>
              ) : undefined
            }
            testID={`connection-${field.key}`}
          />
        );
      })}

      {!profile ? (
        <Button
          label="Connect"
          onPress={handleConnect}
          loading={busy}
          testID="connection-connect"
        />
      ) : edited ? (
        <View className="flex-row gap-2">
          <Button
            label="Cancel"
            variant="ghost"
            onPress={handleCancel}
            disabled={busy}
            testID="connection-cancel"
          />
          <Button
            label="Save & reconnect"
            onPress={handleConnect}
            loading={busy}
            className="flex-1"
            testID="connection-save"
          />
        </View>
      ) : (
        <Button
          label="Forget server"
          variant="dangerGhost"
          onPress={handleForget}
          disabled={busy}
          testID="connection-forget"
        />
      )}
    </View>
  );
}
