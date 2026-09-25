/**
 * Prompt delivery, regeneration and interruption against the OpenCode V2 API.
 *
 * The prompt endpoint takes the whole message at once — text plus any files —
 * and streams the assistant reply through the event stream. Files are passed
 * as inline data uris: a client-local `file://` or `content://` path means
 * nothing to a remote server, so the bytes travel with the request and the
 * server derives the mime type from the uri prefix.
 */

import type { Attachment, ChatId, UserMessage } from "@/src/domain";
import { timeoutSignal, type OpenCodeClient } from "./client";

const PROMPT_TIMEOUT_MS = 30_000;
const CONTROL_TIMEOUT_MS = 10_000;

/** The uri the server can read the attachment from. */
function fileUri(file: Attachment): string {
  return file.bytes ? `data:${file.mimeType};base64,${file.bytes}` : file.uri;
}

async function deliver(client: OpenCodeClient, chatId: ChatId, msg: UserMessage): Promise<void> {
  // The endpoint accepts the message immediately and the reply arrives on the
  // event stream; the timeout only covers delivery on a slow network.
  const timeout = timeoutSignal(PROMPT_TIMEOUT_MS);
  try {
    const files = (msg.attachments ?? [])
      .map((file) => ({ uri: fileUri(file), name: file.name }))
      .filter((file) => file.uri.length > 0);
    await client.session.prompt(
      {
        sessionID: chatId,
        text: msg.text,
        ...(files.length > 0 ? { files } : {}),
      },
      { signal: timeout.signal },
    );
  } finally {
    timeout.done();
  }
}

export async function send(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
): Promise<void> {
  await deliver(client, chatId, msg);
}

/**
 * First half of a rerun: the server rolls that message and everything after it
 * back to a boundary. The next prompt commits the boundary, so the transcript
 * ends up with exactly one copy of the turn instead of a duplicate.
 */
export async function prepareRegenerate(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
): Promise<void> {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    // `files: false` keeps the rollback inside the transcript: this app never
    // edits the server's files, so reverting them would be a surprise.
    await client.session.revert.stage(
      { sessionID: chatId, messageID: msg.id, files: false },
      { signal: timeout.signal },
    );
  } finally {
    timeout.done();
  }
}

/**
 * Second half of a rerun: delivers the message again, which commits a
 * prepared rollback. A prepared rollback that never gets its prompt is
 * dropped, so the next message the user sends cannot discard older turns
 * unnoticed.
 */
export async function regenerate(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
): Promise<void> {
  try {
    await deliver(client, chatId, msg);
  } catch (error) {
    await discardRegenerate(client, chatId).catch(() => undefined);
    throw error;
  }
}

/** Drops a staged rerun that was never delivered. */
export async function discardRegenerate(client: OpenCodeClient, chatId: ChatId): Promise<void> {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    await client.session.revert.clear({ sessionID: chatId }, { signal: timeout.signal });
  } finally {
    timeout.done();
  }
}

export async function interrupt(client: OpenCodeClient, chatId: ChatId): Promise<void> {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    await client.session.interrupt({ sessionID: chatId }, { signal: timeout.signal });
  } finally {
    timeout.done();
  }
}
