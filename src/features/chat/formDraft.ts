/**
 * What the form card edits, and how that becomes a backend answer.
 *
 * The draft keeps numbers as the text the user typed, so a half-typed "1."
 * survives re-renders; they are parsed only when checked or sent. Fields
 * whose conditions fail are neither checked nor sent, and hidden fields
 * send their default.
 */

import type { ChatForm, FormAnswer, FormField, FormResult, FormValue } from "@/src/domain";
import { t } from "@/src/i18n";

export type DraftValue = string | boolean | string[];
export type FormDraft = Record<string, DraftValue>;

export function initialDraft(form: ChatForm): FormDraft {
  const draft: FormDraft = {};
  for (const field of form.fields) {
    switch (field.type) {
      case "text":
        draft[field.key] = field.default ?? "";
        break;
      case "number":
        draft[field.key] = field.default === undefined ? "" : String(field.default);
        break;
      case "boolean":
        if (field.default !== undefined) draft[field.key] = field.default;
        break;
      case "multiselect":
        draft[field.key] = field.default ?? [];
        break;
    }
  }
  return draft;
}

/** The draft value as the backend would receive it; undefined when unanswered. */
function toValue(field: FormField, value: DraftValue | undefined): FormValue | undefined {
  switch (field.type) {
    case "text":
      return typeof value === "string" && value.length > 0 ? value : undefined;
    case "number": {
      if (typeof value !== "string" || value.trim() === "") return undefined;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "multiselect":
      return Array.isArray(value) && value.length > 0 ? value : undefined;
    case "link":
      return undefined;
  }
}

function defaultValue(field: FormField): FormValue | undefined {
  return field.type === "link" ? undefined : field.default;
}

export function isFieldShown(form: ChatForm, field: FormField, draft: FormDraft): boolean {
  if (field.hidden) return false;
  return (field.when ?? []).every((condition) => {
    const other = form.fields.find((candidate) => candidate.key === condition.key);
    const value = other
      ? other.hidden
        ? defaultValue(other)
        : toValue(other, draft[other.key])
      : undefined;
    return condition.op === "eq" ? value === condition.value : value !== condition.value;
  });
}

/** Why the field's current value cannot be sent, or null when it can. */
export function fieldError(field: FormField, value: DraftValue | undefined): string | null {
  if (field.type === "link") return null;
  const answer = toValue(field, value);
  if (answer === undefined) {
    if (field.type === "number" && typeof value === "string" && value.trim() !== "") {
      return t("forms.errors.number");
    }
    return field.required ? t("forms.errors.required") : null;
  }
  switch (field.type) {
    case "text": {
      const text = answer as string;
      if (field.minLength !== undefined && text.length < field.minLength) {
        return t("forms.errors.minLength", { count: field.minLength });
      }
      if (field.maxLength !== undefined && text.length > field.maxLength) {
        return t("forms.errors.maxLength", { count: field.maxLength });
      }
      if (field.pattern !== undefined && !matchesPattern(field.pattern, text)) {
        return t("forms.errors.pattern");
      }
      return null;
    }
    case "number": {
      const number = answer as number;
      if (field.integer && !Number.isInteger(number)) return t("forms.errors.integer");
      if (field.minimum !== undefined && number < field.minimum) {
        return t("forms.errors.minimum", { value: field.minimum });
      }
      if (field.maximum !== undefined && number > field.maximum) {
        return t("forms.errors.maximum", { value: field.maximum });
      }
      return null;
    }
    case "multiselect": {
      const count = (answer as string[]).length;
      if (field.minItems !== undefined && count < field.minItems) {
        return t("forms.errors.minItems", { count: field.minItems });
      }
      if (field.maxItems !== undefined && count > field.maxItems) {
        return t("forms.errors.maxItems", { count: field.maxItems });
      }
      return null;
    }
    case "boolean":
      return null;
  }
}

function matchesPattern(pattern: string, text: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(text);
  } catch {
    // A pattern this engine cannot parse is the server's to enforce.
    return true;
  }
}

export function canSubmit(form: ChatForm, draft: FormDraft): boolean {
  return form.fields.every(
    (field) => !isFieldShown(form, field, draft) || fieldError(field, draft[field.key]) === null,
  );
}

export function buildAnswer(form: ChatForm, draft: FormDraft): FormAnswer {
  const answer: FormAnswer = {};
  for (const field of form.fields) {
    const value = field.hidden
      ? defaultValue(field)
      : isFieldShown(form, field, draft)
        ? toValue(field, draft[field.key])
        : undefined;
    if (value !== undefined) answer[field.key] = value;
  }
  return answer;
}

/** The field's question in full; its title is only a short label for it. */
export function fieldQuestion(field: FormField): string {
  return field.description ?? field.title ?? field.key;
}

/** The field's answer as the user reads it: option labels, not their values. */
export function answerText(field: FormField, value: DraftValue | undefined): string[] {
  const answer = toValue(field, value);
  if (answer === undefined) return [];
  if (typeof answer === "boolean") return [answer ? t("forms.yes") : t("forms.no")];
  const options = field.type === "text" || field.type === "multiselect" ? field.options : undefined;
  const label = (item: string) => options?.find((option) => option.value === item)?.label ?? item;
  return Array.isArray(answer) ? answer.map(label) : [label(String(answer))];
}

export function formResult(
  form: ChatForm,
  draft: FormDraft,
  status: "answered" | "dismissed",
): FormResult {
  const asked = form.fields.filter(
    (field) => field.type !== "link" && isFieldShown(form, field, draft),
  );
  return {
    id: form.id,
    status,
    questions: asked.map(fieldQuestion),
    answers: status === "answered" ? asked.map((field) => answerText(field, draft[field.key])) : [],
  };
}
