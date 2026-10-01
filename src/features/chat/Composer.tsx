/**
 * Message composer: a floating card with the text input on top and a toolbar
 * below. Each optional control (stop, attach, model chip, context meter)
 * renders only when the caller passes its prop, so capability gating stays at
 * the call site.
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import type { Attachment } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Spinner } from "@/src/ui/Spinner";
import { TextInput, type TextInputHandle } from "@/src/ui/TextInput";
import { useAppTheme } from "@/src/ui/theme";
import { AttachmentChips } from "./AttachmentChips";
import { ContextMeter, type ContextUse } from "./ContextMeter";

export interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  /**
   * The field clears as soon as the user sends. Resolve to `false` when the
   * message did not go out, and the text comes back.
   */
  onSend: (text: string, attachments: Attachment[]) => void | boolean | Promise<void | boolean>;
  /** Present while a turn is live; replaces the send button. */
  onStop?: () => void;
  /** Present when the backend accepts attachments; shows the attach button. */
  onAttach?: () => void;
  /** Files staged for the next message. */
  attachments?: Attachment[];
  onRemoveAttachment?: (attachment: Attachment) => void;
  /** Present when the backend lets the user pick the model; opens the picker. */
  model?: {
    label: string;
    /** The reasoning level the model runs with, when it offers any. */
    level?: string;
    /**
     * "placeholder" stands in for a label still loading; "busy" keeps the
     * label but shows a request for it is in flight.
     */
    status?: "placeholder" | "busy";
    onPress: () => void;
  };
  /** Present once a reply has said how full the model's context is; stays while a reply streams. */
  context?: ContextUse & { onPress: () => void };
  /** Present while the field holds a sent message being edited; shows a bar to cancel it. */
  editing?: { onCancel: () => void };
  autoFocus?: boolean;
  placeholder?: string;
  /**
   * Set while nothing typed here could be sent (no server, or the backend
   * waits on a form): the field takes no input and shows this instead of the
   * placeholder. A draft already typed stays.
   */
  lockedReason?: string;
}

const NO_ATTACHMENTS: Attachment[] = [];

export interface ComposerHandle {
  /** Replaces the draft with `text`, and focuses the field unless told not to. */
  insert: (text: string, focus?: boolean) => void;
  read: () => string;
  focus: () => void;
}

export function Composer({
  ref,
  onSend,
  onStop,
  onAttach,
  attachments = NO_ATTACHMENTS,
  onRemoveAttachment,
  model,
  context,
  editing,
  autoFocus,
  placeholder,
  lockedReason,
}: ComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const input = useRef<TextInputHandle>(null);
  const streaming = Boolean(onStop);
  const { floatingShadow } = useAppTheme();

  useImperativeHandle(
    ref,
    () => ({
      insert: (next, focus = true) => {
        setText(next);
        if (focus) input.current?.focus();
      },
      read: () => text,
      focus: () => input.current?.focus(),
    }),
    [text],
  );

  const locked = lockedReason !== undefined;
  useEffect(() => {
    if (locked) input.current?.blur();
  }, [locked]);

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || streaming || locked) return;
    setText("");
    Keyboard.dismiss();
    const sent = await onSend(trimmed, attachments);
    if (sent === false) setText((current) => current || text);
  }

  const sendDisabled = (text.trim().length === 0 && attachments.length === 0) || locked;
  // Attach and the model chip step aside while a reply streams.
  const showAttach = Boolean(onAttach) && !streaming;
  const showModel = Boolean(model) && !streaming;

  return (
    <View className="rounded-[28px] bg-elevated p-1.5" style={{ boxShadow: floatingShadow }}>
      {editing ? (
        <View
          className="mx-1.5 mt-0.5 flex-row items-center gap-2 rounded-[20px] bg-raised py-1 pl-3 pr-1"
          testID="composer-editing"
        >
          <Icon name="pencil-outline" size={17} tone="textMuted" />
          <Text className="flex-1 text-sm text-text-muted">{t("composer.editing")}</Text>
          <Pressable
            accessibilityLabel={t("composer.cancelEditing")}
            accessibilityRole="button"
            className="h-8 w-8 items-center justify-center rounded-full active:bg-raised-hover"
            onPress={editing.onCancel}
            testID="composer-cancel-edit"
          >
            <Icon name="close" size={18} />
          </Pressable>
        </View>
      ) : null}
      {attachments.length > 0 ? (
        <AttachmentChips
          attachments={attachments}
          onRemove={onRemoveAttachment}
          testID="composer-attachments"
        />
      ) : null}
      <TextInput
        ref={input}
        autoFocus={autoFocus}
        value={text}
        onChangeText={setText}
        placeholder={lockedReason ?? placeholder ?? t("composer.placeholder")}
        editable={!locked}
        multiline
        accessibilityLabel={t("composer.message")}
        className="max-h-36 min-h-11 px-3 py-2.5 text-base leading-[22px] text-text"
        testID="composer-input"
      />
      <View className="mx-2 mb-1 flex-row items-center gap-1">
        {showAttach ? (
          <Pressable
            accessibilityHint={t("composer.attachHint")}
            accessibilityLabel={t("composer.attach")}
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-raised"
            onPress={onAttach}
            testID="composer-attach"
          >
            <Icon name="plus" size={26} />
          </Pressable>
        ) : null}
        {showModel && model ? (
          <Pressable
            accessibilityHint={t("composer.modelHint")}
            accessibilityLabel={[
              t("composer.modelLabel", { model: model.label }),
              model.level && t("composer.reasoningLabel", { level: model.level }),
            ]
              .filter(Boolean)
              .join(". ")}
            accessibilityRole="button"
            className={cn(
              "h-9 shrink flex-row items-center gap-1 rounded-full pl-2 pr-1.5 active:bg-raised",
              !showAttach && "ml-1",
            )}
            onPress={model.onPress}
            testID="model-button"
          >
            {model.status === "placeholder" ? (
              <SkeletonGroup label={t("models.loadingOne")} testID="model-button-skeleton">
                <Skeleton className="h-4 w-28 bg-raised" />
              </SkeletonGroup>
            ) : (
              <>
                <Text className="shrink text-[15px] font-medium text-text" numberOfLines={1}>
                  {model.label}
                </Text>
                {model.level ? (
                  // Outside the label, so a long model name is what gets cut short.
                  <Text className="text-[15px] font-medium text-text-muted">· {model.level}</Text>
                ) : null}
              </>
            )}
            {model.status === "busy" ? (
              <Spinner size="small" />
            ) : (
              <Icon name="chevron-down" size={16} tone="textMuted" />
            )}
          </Pressable>
        ) : null}
        <View className="flex-1" />
        {context ? <ContextMeter context={context} onPress={context.onPress} /> : null}
        {streaming ? (
          <Pressable
            accessibilityHint={t("composer.stopHint")}
            accessibilityLabel={t("composer.stop")}
            accessibilityRole="button"
            accessibilityState={{ busy: true }}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
            onPress={onStop}
            testID="composer-stop"
          >
            <View className="h-3 w-3 rounded-[2px] bg-primary-foreground" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityHint={t("composer.sendHint")}
            accessibilityLabel={t("composer.send")}
            accessibilityRole="button"
            accessibilityState={{ disabled: sendDisabled }}
            className={cn(
              "h-10 w-10 items-center justify-center rounded-full",
              sendDisabled ? "bg-raised-hover" : "bg-primary active:opacity-80",
            )}
            disabled={sendDisabled}
            onPress={() => void handleSend()}
            testID="composer-send"
          >
            <Icon
              name="arrow-up"
              size={22}
              tone={sendDisabled ? "textFaint" : "primaryForeground"}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
