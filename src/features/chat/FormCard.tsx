/**
 * A question the backend is waiting on, shown above the composer.
 *
 * Dismiss tells the backend the user won't answer, so the run moves on
 * without it.
 */

import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
import type { ChatForm, FormAnswer, FormField, FormOption } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Button } from "@/src/ui/Button";
import { Icon, type IconName } from "@/src/ui/Icon";
import { Input } from "@/src/ui/Input";
import { Segmented } from "@/src/ui/Segmented";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = form.fields.filter((field) => isFieldShown(form, field, draft));

  function update(key: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Could not send.");
      setBusy(false);
    }
  }

  return (
    <View className="mb-2 overflow-hidden rounded-[20px] bg-surface" testID="form-card">
      <ScrollView
        style={{ maxHeight: 360 }}
        contentContainerClassName="gap-4 px-4 pb-3 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-base font-semibold text-text">{form.title}</Text>
        {shown.map((field) => (
          <View key={field.key} className="gap-2">
            {field.title ? (
              <Text className="text-[15px] font-medium text-text">{field.title}</Text>
            ) : null}
            {field.description ? (
              <Text className="text-[14px] text-text-muted">{field.description}</Text>
            ) : null}
            <FieldControl
              field={field}
              value={draft[field.key]}
              disabled={busy}
              onChange={(value) => update(field.key, value)}
            />
            {touched.has(field.key) && fieldError(field, draft[field.key]) ? (
              <Text className="text-sm text-danger">{fieldError(field, draft[field.key])}</Text>
            ) : null}
          </View>
        ))}
        {error ? (
          <Text className="text-sm text-danger" testID="form-error">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View className="flex-row justify-end gap-2 px-3 pb-3">
        <Button
          label="Dismiss"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => void run(onDismiss)}
          testID="form-dismiss"
        />
        <Button
          label="Submit"
          size="sm"
          disabled={busy || !canSubmit(form, draft)}
          onPress={() => void run(() => onSubmit(buildAnswer(form, draft)))}
          testID="form-submit"
        />
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
