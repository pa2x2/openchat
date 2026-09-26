/**
 * What the form card edits, and how that becomes a backend answer.
 *
 * The draft keeps numbers as the text the user typed, so a half-typed "1."
 * survives re-renders; they are parsed only when checked or sent. Fields
 * whose conditions fail are neither checked nor sent, and hidden fields
 * send their default.
 */

import type { ChatForm, FormAnswer, FormField, FormValue } from "@/src/domain";

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
      return "Enter a number.";
    }
    return field.required ? "Required." : null;
  }
  switch (field.type) {
    case "text": {
      const text = answer as string;
      if (field.minLength !== undefined && text.length < field.minLength) {
        return `Use at least ${field.minLength} characters.`;
      }
      if (field.maxLength !== undefined && text.length > field.maxLength) {
        return `Use at most ${field.maxLength} characters.`;
      }
      if (field.pattern !== undefined && !matchesPattern(field.pattern, text)) {
        return "That doesn't look right.";
      }
      return null;
    }
    case "number": {
      const number = answer as number;
      if (field.integer && !Number.isInteger(number)) return "Enter a whole number.";
      if (field.minimum !== undefined && number < field.minimum) {
        return `Enter ${field.minimum} or more.`;
      }
      if (field.maximum !== undefined && number > field.maximum) {
        return `Enter ${field.maximum} or less.`;
      }
      return null;
    }
    case "multiselect": {
      const count = (answer as string[]).length;
      if (field.minItems !== undefined && count < field.minItems) {
        return `Pick at least ${field.minItems}.`;
      }
      if (field.maxItems !== undefined && count > field.maxItems) {
        return `Pick at most ${field.maxItems}.`;
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
