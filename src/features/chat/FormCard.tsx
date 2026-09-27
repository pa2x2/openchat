/**
 * A question the backend is waiting on, shown above the composer.
 *
 * A form with several questions shows one per page. Back and Next keep the
 * whole draft, so any answer can be changed until Submit sends them all.
 * Dismiss tells the backend the user won't answer, so the run moves on
 * without it.
 */

import { useState } from "react";
import { Keyboard, Linking, ScrollView, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import type { ChatForm, FormAnswer, FormField, FormOption } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Button } from "@/src/ui/Button";
import { Icon, type IconName } from "@/src/ui/Icon";
import { Input } from "@/src/ui/Input";
import { Segmented } from "@/src/ui/Segmented";
import { useKeyboardOpen } from "@/src/ui/keyboard";
import {
  buildAnswer,
  canSubmit,
  fieldError,
  initialDraft,
  isFieldShown,
  type DraftValue,
  type FormDraft,
} from "./formDraft";

export interface FormCardProps {
  form: ChatForm;
  /** Rejects with a user-facing message when the backend did not take it. */
  onSubmit: (answer: FormAnswer) => Promise<void>;
  onDismiss: () => Promise<void>;
}

export function FormCard({ form, onSubmit, onDismiss }: FormCardProps) {
  const [draft, setDraft] = useState<FormDraft>(() => initialDraft(form));
  // Errors show once a field has been edited, not while it is still empty.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<"submit" | "dismiss" | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const keyboardOpen = useKeyboardOpen();

  const shown = form.fields.filter((field) => isFieldShown(form, field, draft));
  // An answer can hide later questions, leaving the page past the end.
  const index = Math.max(0, Math.min(page, shown.length - 1));
  const field = shown.at(index);
  const paged = shown.length > 1;
  const last = index >= shown.length - 1;
  const invalid = field ? fieldError(field, draft[field.key]) : null;

  function update(key: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  }

  // The page's text field unmounts, and the keyboard would stay up without it.
  function turnPage(next: number) {
    Keyboard.dismiss();
    setPage(next);
  }

  async function run(kind: "submit" | "dismiss", action: () => Promise<void>) {
    if (busy) return;
    setPending(kind);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Could not send.");
      setPending(null);
    }
  }

  return (
    <View className="mb-2 overflow-hidden rounded-[20px] bg-surface" testID="form-card">
      {/* The question stays in view while its options scroll. */}
      <View className="gap-4 px-4 pb-2 pt-4">
        <View className="flex-row items-baseline gap-3">
          <Text className="flex-1 text-base font-semibold text-text">{form.title}</Text>
          {paged ? (
            <Text className="text-sm text-text-muted" testID="form-page">
              {index + 1} of {shown.length}
            </Text>
          ) : null}
        </View>
        {field?.title || field?.description ? (
          <View className="gap-2">
            {field.title ? (
              <Text className="text-[15px] font-medium text-text">{field.title}</Text>
            ) : null}
            {field.description ? (
              <Text className="text-[14px] text-text-muted">{field.description}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {field ? (
        <ScrollView
          // A new page starts scrolled to the top.
          key={field.key}
          // With the keyboard up, the full height pushes the question off screen.
          style={{ maxHeight: keyboardOpen ? 160 : 280 }}
          contentContainerClassName="px-4 py-1"
          keyboardShouldPersistTaps="handled"
        >
          <FieldControl
            field={field}
            value={draft[field.key]}
            disabled={busy}
            onChange={(value) => update(field.key, value)}
          />
        </ScrollView>
      ) : null}
      {field && touched.has(field.key) && invalid ? (
        <Text className="px-4 pt-2 text-sm text-danger">{invalid}</Text>
      ) : null}
      {error ? (
        <Text className="px-4 pt-2 text-sm text-danger" testID="form-error">
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2 px-3 pb-3 pt-2">
        <Button
          label="Dismiss"
          variant="ghost"
          size="sm"
          disabled={busy}
          loading={pending === "dismiss"}
          onPress={() => void run("dismiss", onDismiss)}
          testID="form-dismiss"
        />
        <View className="flex-1" />
        {paged && index > 0 ? (
          <Button
            label="Back"
            variant="secondary"
            size="sm"
            disabled={busy}
            onPress={() => turnPage(index - 1)}
            testID="form-back"
          />
        ) : null}
        {last ? (
          <Button
            label="Submit"
            size="sm"
            disabled={busy || !canSubmit(form, draft)}
            loading={pending === "submit"}
            onPress={() => void run("submit", () => onSubmit(buildAnswer(form, draft)))}
            testID="form-submit"
          />
        ) : (
          <Button
            label="Next"
            size="sm"
            disabled={busy || invalid !== null}
            onPress={() => turnPage(index + 1)}
            testID="form-next"
          />
        )}
      </View>
    </View>
  );
}

interface FieldControlProps {
  field: FormField;
  value: DraftValue | undefined;
  disabled: boolean;
  onChange: (value: DraftValue) => void;
}

function FieldControl({ field, value, disabled, onChange }: FieldControlProps) {
  switch (field.type) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      if (!field.options?.length) {
        return (
          <Input
            value={text}
            onChangeText={onChange}
            placeholder={field.placeholder}
            testID={`form-field-${field.key}`}
          />
        );
      }
      const isOption = field.options.some((option) => option.value === text);
      return (
        <View className="gap-1.5">
          {field.options.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              icon={option.value === text ? "radiobox-marked" : "radiobox-blank"}
              selected={option.value === text}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              testID={`form-option-${field.key}-${option.value}`}
            />
          ))}
          {field.custom ? (
            <Input
              value={isOption ? "" : text}
              onChangeText={onChange}
              placeholder={field.placeholder ?? "Something else"}
              testID={`form-field-${field.key}-custom`}
            />
          ) : null}
        </View>
      );
    }
    case "number":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          keyboardType="numeric"
          testID={`form-field-${field.key}`}
        />
      );
    case "boolean":
      return (
        <Segmented
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(next) => onChange(next === "yes")}
          testIDPrefix={`form-field-${field.key}`}
        />
      );
    case "multiselect": {
      const picked = Array.isArray(value) ? value : [];
      const listed = new Set(field.options.map((option) => option.value));
      // The typed answer rides in the same list as the ticked options.
      const typed = picked.find((item) => !listed.has(item)) ?? "";
      return (
        <View className="gap-1.5">
          {field.options.map((option) => {
            const on = picked.includes(option.value);
            return (
              <OptionRow
                key={option.value}
                option={option}
                icon={on ? "checkbox-marked" : "checkbox-blank-outline"}
                selected={on}
                disabled={disabled}
                onPress={() =>
                  onChange(
                    on ? picked.filter((item) => item !== option.value) : [...picked, option.value],
                  )
                }
                testID={`form-option-${field.key}-${option.value}`}
              />
            );
          })}
          {field.custom ? (
            <Input
              value={typed}
              onChangeText={(next) =>
                onChange([...picked.filter((item) => listed.has(item)), ...(next ? [next] : [])])
              }
              placeholder="Something else"
              testID={`form-field-${field.key}-custom`}
            />
          ) : null}
        </View>
      );
    }
    case "link":
      return (
        <OptionRow
          option={{ value: field.url, label: "Open", description: field.url }}
          icon="open-in-new"
          selected={false}
          disabled={disabled}
          onPress={() => void Linking.openURL(field.url)}
          testID={`form-link-${field.key}`}
        />
      );
  }
}

interface OptionRowProps {
  option: FormOption;
  icon: IconName;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}

function OptionRow({ option, icon, selected, disabled, onPress, testID }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={option.label}
      accessibilityState={{ selected, disabled }}
      className={cn(
        "min-h-[48px] flex-row items-center gap-3 rounded-2xl px-3.5 py-2.5",
        selected ? "bg-selected" : "bg-raised active:bg-raised-hover",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Icon name={icon} size={20} tone={selected ? "text" : "textMuted"} />
      <View className="flex-1">
        <Text className="text-[15px] text-text">{option.label}</Text>
        {option.description ? (
          <Text className="mt-0.5 text-[13px] text-text-muted" numberOfLines={2}>
            {option.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
