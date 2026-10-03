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
import type { Attachment, Quote } from "@/src/domain";
import { useDraftsStore } from "@/src/stores/drafts";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Spinner } from "@/src/ui/Spinner";
import { TextInput, type TextInputHandle } from "@/src/ui/TextInput";
import { useAppTheme } from "@/src/ui/theme";
import { AttachmentChips } from "./AttachmentChips";
import { ContextMeter, type ContextUse } from "./ContextMeter";
import { QuoteCards } from "./QuoteCards";

export interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  /**
   * The field clears as soon as the user sends. Resolve to `false` when the
   * message did not go out, and the text comes back.
   */
  onSend: (text: string, attachments: Attachment[]) => void | boolean | Promise<void | boolean>;
  /** Present while a turn is live; replaces the send button. */
  onStop?: () => void;
  /**
   * Present while a turn is live and the backend can hold a message until the
   * reply is done. The send button then comes back beside stop once there is
   * something to send, and sends here instead of `onSend`.
   */
  onQueue?: (text: string, attachments: Attachment[]) => boolean | Promise<boolean>;
  /** Present when the backend accepts attachments; shows the attach button. */
  onAttach?: () => void;
  /** Files staged for the next message. */
  attachments?: Attachment[];
  onRemoveAttachment?: (attachment: Attachment) => void;
  /** Quotes staged for the next message; with one, the message can go without text. */
  quotes?: readonly Quote[];
  /** The index of the quote whose comment has the cursor. */
  commenting?: number | null;
  onCommenting?: (index: number) => void;
  onCommentingEnd?: (index: number) => void;
  onCommentQuote?: (index: number, comment: string) => void;
  onRemoveQuote?: (index: number) => void;
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
  /**
   * Present while the field holds a sent message being edited; shows a bar
   * to cancel it, with a switch between sending the edit here and to a new
   * chat when `target` is set.
   */
  editing?: {
    label: string;
    onCancel: () => void;
    target?: { value: EditTarget; onChange: (target: EditTarget) => void };
  };
  /**
   * The chat the typed text is saved as a draft for, restored when the
   * composer mounts again. Unset while the field holds something that is not
   * a draft, such as a message being edited; the saved draft stays as it was.
   */
  draftKey?: string;
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
const NO_QUOTES: readonly Quote[] = [];

/** Where an edit goes: in place of the message, or to a branch cut just before it. */
export type EditTarget = "here" | "new";

const EDIT_TARGETS: EditTarget[] = ["here", "new"];

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
  onQueue,
  onAttach,
  attachments = NO_ATTACHMENTS,
  onRemoveAttachment,
  quotes = NO_QUOTES,
  commenting = null,
  onCommenting,
  onCommentingEnd,
  onCommentQuote,
  onRemoveQuote,
  model,
  context,
  editing,
  draftKey,
  autoFocus,
  placeholder,
  lockedReason,
}: ComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(() =>
    draftKey === undefined ? "" : (useDraftsStore.getState().byChat[draftKey] ?? ""),
  );
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

  useEffect(() => {
    if (draftKey !== undefined) useDraftsStore.getState().setDraft(draftKey, text);
  }, [draftKey, text]);

  const locked = lockedReason !== undefined;
  useEffect(() => {
    if (locked) input.current?.blur();
  }, [locked]);

  const empty = text.trim().length === 0 && attachments.length === 0 && quotes.length === 0;
  const queueing = streaming && Boolean(onQueue);

  async function handleSend() {
    const trimmed = text.trim();
    if (empty || (streaming && !onQueue) || locked) return;
    setText("");
    Keyboard.dismiss();
    const sent = await (streaming && onQueue ? onQueue : onSend)(trimmed, attachments);
    if (sent === false) setText((current) => current || text);
  }

  const sendDisabled = empty || locked;
  // The model chip steps aside while a reply streams; attach stays only for
  // a message to queue.
  const showAttach = Boolean(onAttach) && (!streaming || queueing);
  const showModel = Boolean(model) && !streaming;
  const sendButton = (
    <Pressable
      accessibilityHint={queueing ? t("composer.queueHint") : t("composer.sendHint")}
      accessibilityLabel={queueing ? t("composer.queue") : t("composer.send")}
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
      <Icon name="arrow-up" size={22} tone={sendDisabled ? "textFaint" : "primaryForeground"} />
    </Pressable>
  );

  return (
    <View className="rounded-[28px] bg-elevated p-1.5" style={{ boxShadow: floatingShadow }}>
      {editing ? (
        <View
          className="mx-1.5 mt-0.5 flex-row items-center gap-2 rounded-[20px] bg-raised py-1 pl-3 pr-1"
          testID="composer-editing"
        >
          <Icon name="pencil-outline" size={17} tone="textMuted" />
          <Text className="flex-1 text-sm text-text-muted" numberOfLines={2}>
            {editing.label}
          </Text>
          {editing.target ? (
            <View
              accessibilityRole="radiogroup"
              className="flex-row rounded-full bg-raised-hover p-0.5"
            >
              {EDIT_TARGETS.map((target) => {
                const chosen = editing.target?.value === target;
                const label =
                  target === "here" ? t("composer.editHere") : t("composer.editNewChat");
                return (
                  <Pressable
                    key={target}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{ checked: chosen }}
                    className={cn(
                      "h-7 justify-center rounded-full px-2.5",
                      chosen && "bg-elevated",
                    )}
                    onPress={() => editing.target?.onChange(target)}
                    testID={`composer-edit-${target}`}
                  >
                    <Text
                      className={cn(
                        "text-[13px]",
                        chosen ? "font-medium text-text" : "text-text-muted",
                      )}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
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
      {quotes.length > 0 ? (
        <QuoteCards
          quotes={quotes}
          focused={commenting}
          onFocus={(index) => onCommenting?.(index)}
          onBlur={(index) => onCommentingEnd?.(index)}
          onComment={(index, comment) => onCommentQuote?.(index, comment)}
          onRemove={(index) => onRemoveQuote?.(index)}
        />
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
            className={cn(
              "h-10 w-10 items-center justify-center rounded-full active:opacity-80",
              // Beside a send button, stop is the quieter of the two.
              queueing && !sendDisabled ? "bg-raised-hover" : "bg-primary",
            )}
            onPress={onStop}
            testID="composer-stop"
          >
            <View
              className={cn(
                "h-3 w-3 rounded-[2px]",
                queueing && !sendDisabled ? "bg-text" : "bg-primary-foreground",
              )}
            />
          </Pressable>
        ) : null}
        {!streaming || (queueing && !sendDisabled) ? sendButton : null}
      </View>
    </View>
  );
}
