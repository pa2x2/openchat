import { UNTITLED_CHAT, type FormResult, type Message } from "@/src/domain";
import { t } from "@/src/i18n";

function formMarkdown(form: FormResult): string {
  return form.questions
    .map((question, index) => {
      const answer = form.answers[index]?.join(", ");
      if (form.status !== "answered") return `- ${question} _${t("forms.skippedMark")}_`;
      return `- ${question} ${answer ? `**${answer}**` : `_${t("forms.noAnswer")}_`}`;
    })
    .join("\n");
}

/** A reply's texts in order, with the forms it asked where they were asked. */
function replyText(message: Message): string {
  const parts = message.parts ?? [];
  if (!parts.some((part) => part.type === "form")) return message.text.trim();
  // A form the run still waits on has no outcome to copy yet.
  const running = message.status === "pending" || message.status === "streaming";
  return parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text];
      if (part.type !== "form" || (part.form.status === "waiting" && running)) return [];
      return [formMarkdown(part.form)];
    })
    .join("\n\n")
    .trim();
}

/**
 * A chat as Markdown, for "Copy conversation": the title (unless the chat has
 * none yet), then each message under who wrote it. A reply keeps its text and
 * the questions it asked with their answers, not the reasoning and tool calls
 * in between; attachments are listed by name.
 */
export function conversationMarkdown(title: string, messages: Message[]): string {
  const sections = title && title !== UNTITLED_CHAT ? [`# ${title}`] : [];
  for (const message of messages) {
    const files = (message.attachments ?? []).map((file) => file.name);
    const body = [
      replyText(message),
      files.length > 0 ? `_${t("conversation.attached", { files: files.join(", ") })}_` : "",
    ].filter(Boolean);
    if (body.length === 0) continue;
    const author = message.role === "user" ? t("conversation.you") : t("conversation.assistant");
    sections.push(`**${author}**`, ...body);
  }
  return sections.join("\n\n") + "\n";
}
