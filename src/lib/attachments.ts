/**
 * Attachment helpers shared by the composer, the transcript and the adapters.
 *
 * Attachments travel inline: the bytes are base64-encoded and handed to the
 * backend as a `data:<mime>;base64,<payload>` uri, because a phone-local
 * `file://` or `content://` path means nothing to a remote server. These
 * helpers are pure so both sides of that split (UI and adapter) agree on the
 * exact form.
 */

import type { Attachment } from "@/src/domain";

/** Largest single attachment the app will send, in bytes. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Largest combined payload per message, in bytes (before base64 expansion). */
export const MAX_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;

/** Most files one message may carry. */
export const MAX_ATTACHMENT_COUNT = 5;

/** The uri a backend can fetch the attachment from, inline. */
export function attachmentUri(attachment: Attachment): string {
  if (attachment.bytes) return `data:${attachment.mimeType};base64,${attachment.bytes}`;
  return attachment.uri;
}

/** True when the attachment carries its own bytes and needs no local file. */
export function hasAttachmentBytes(attachment: Attachment): boolean {
  return typeof attachment.bytes === "string" && attachment.bytes.length > 0;
}

/** True when every attachment still has its bytes, i.e. it can be re-sent. */
export function canResendAttachments(attachments: Attachment[] | undefined): boolean {
  return (attachments ?? []).every(hasAttachmentBytes);
}

export function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType.startsWith("image/");
}

/** Short human label: "photo.png" or "notes.txt". */
export function describeAttachment(attachment: Attachment): string {
  return attachment.name || "attachment";
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
