/**
 * Prompt delivery, regeneration and interruption against the OpenCode V2 API.
 *
 * The prompt endpoint takes the whole message at once — text plus any files —
 * and streams the assistant reply through the event stream. Files are passed
 * as inline data uris: a client-local `file://` or `content://` path means
 * nothing to a remote server, so the bytes travel with the request and the
 * server derives the mime type from the uri prefix.
 */

import type { Attachment, ChatId, Delivery, QueuedMessage, UserMessage } from "@/src/domain";
import { timeoutSignal, type OpenCodeClient } from "./client";
import { toAttachment } from "./messages";

const PROMPT_TIMEOUT_MS = 30_000;
const CONTROL_TIMEOUT_MS = 10_000;

function fileUri(file: Attachment): string {
  return file.bytes ? `data:${file.mimeType};base64,${file.bytes}` : file.uri;
}

async function deliver(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
  queued?: { delivery: Delivery },
): Promise<void> {
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
        ...(queued ? { id: msg.id, delivery: queued.delivery } : {}),
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

const ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let lastIdTime = 0;
let idCounter = 0;

/**
 * A message id the way the server makes them: the time in milliseconds with
 * a counter for ids made in the same one, cut to its low 48 bits and written
 * as 12 hex digits, then 14 random characters. The server only checks the
 * prefix, but its own ids have this shape, and one of another shape would
 * not sort among them.
 */
export function newMessageId(now = Date.now()): string {
  if (now !== lastIdTime) {
    lastIdTime = now;
    idCounter = 0;
  }
  idCounter += 1;
  const stamp = BigInt(now) * BigInt(0x1000) + BigInt(idCounter);
  const time = BigInt.asUintN(48, stamp).toString(16).padStart(12, "0");
  let random = "";
  for (let index = 0; index < 14; index += 1) {
    random += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return `msg_${time}${random}`;
}

export async function queue(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
  delivery: Delivery,
): Promise<void> {
  await deliver(client, chatId, msg, { delivery });
}

export async function queuedMessages(
  client: OpenCodeClient,
  chatId: ChatId,
): Promise<QueuedMessage[]> {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    const inbox = await client.session.inbox.list(
      { sessionID: chatId },
      { signal: timeout.signal },
    );
    // The inbox also holds work the server queued for itself, such as a compaction.
    return inbox.flatMap((item) =>
      item.type === "user"
        ? [
            {
              id: item.id,
              text: item.payload.text,
              ...(item.payload.files?.length
                ? { attachments: item.payload.files.map(toAttachment) }
                : {}),
              delivery: item.delivery,
              createdAt: item.time.created,
            },
          ]
        : [],
    );
  } finally {
    timeout.done();
  }
}

export async function cancelQueued(client: OpenCodeClient, chatId: ChatId, id: string) {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    await client.session.inbox.cancel(
      { sessionID: chatId, inboxID: id },
      { signal: timeout.signal },
    );
  } finally {
    timeout.done();
  }
}

export async function steerQueued(client: OpenCodeClient, chatId: ChatId, id: string) {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    await client.session.inbox.update(
      { sessionID: chatId, inboxID: id, delivery: "steer" },
      { signal: timeout.signal },
    );
  } finally {
    timeout.done();
  }
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

export async function compact(client: OpenCodeClient, chatId: ChatId): Promise<void> {
  const timeout = timeoutSignal(CONTROL_TIMEOUT_MS);
  try {
    await client.session.compact({ sessionID: chatId }, { signal: timeout.signal });
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
