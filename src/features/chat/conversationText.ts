import { UNTITLED_CHAT, type Message } from "@/src/domain";

/**
 * A chat as Markdown, for "Copy conversation": the title (unless the chat has
 * none yet), then each message under who wrote it. A reply keeps only its
 * answer, not the reasoning and tool calls that led to it; attachments are
 * listed by name.
 */
export function conversationMarkdown(title: string, messages: Message[]): string {
  const sections = title && title !== UNTITLED_CHAT ? [`# ${title}`] : [];
  for (const message of messages) {
    const files = (message.attachments ?? []).map((file) => file.name);
    const body = [
      message.text.trim(),
      files.length > 0 ? `_Attached: ${files.join(", ")}_` : "",
    ].filter(Boolean);
    if (body.length === 0) continue;
    sections.push(`**${message.role === "user" ? "You" : "Assistant"}**`, ...body);
  }
  return sections.join("\n\n") + "\n";
}
