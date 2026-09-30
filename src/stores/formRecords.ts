/**
 * Settled forms that only this device remembers.
 *
 * A backend records a form's answers when a tool call raised it; the
 * transcript then carries them. Any other form (an MCP server asking for
 * input, say) leaves no trace there, so its result is kept here and put back
 * into the transcript every time the server's copy replaces it.
 *
 * A record is tied to the tool call that was running when its form was
 * settled. That id is the one thing the live reply and the server's copy of
 * it share: message ids differ until the transcript is fetched. It also makes
 * a record go away with its reply when the turn is rerun.
 */

import type { FormResult, Message, ReplyPart } from "@/src/domain";

export interface FormRecord {
  afterToolId: string;
  form: FormResult;
}

function hasTool(message: Message, toolId: string): boolean {
  return (message.parts ?? []).some((part) => part.type === "tool" && part.tool.id === toolId);
}

export function withFormRecords(messages: Message[], records: FormRecord[] = []): Message[] {
  if (records.length === 0) return messages;
  return messages.map((message) => {
    if (!message.parts) return message;
    const parts = records.reduce<ReplyPart[]>((current, record) => {
      if (current.some((part) => part.type === "form" && part.form.id === record.form.id)) {
        return current;
      }
      const anchor = current.findIndex(
        (part) => part.type === "tool" && part.tool.id === record.afterToolId,
      );
      if (anchor < 0) return current;
      // Past the forms already there, so several on one call keep their order.
      let at = anchor + 1;
      while (current[at]?.type === "form") at += 1;
      return [...current.slice(0, at), { type: "form", form: record.form }, ...current.slice(at)];
    }, message.parts);
    return parts === message.parts ? message : { ...message, parts };
  });
}

/** The records whose tool call is still somewhere in `messages`. */
export function placedFormRecords(messages: Message[], records: FormRecord[]): FormRecord[] {
  return records.filter((record) =>
    messages.some((message) => hasTool(message, record.afterToolId)),
  );
}
