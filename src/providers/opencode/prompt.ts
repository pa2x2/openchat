/**
 * Prompt delivery and interruption against the OpenCode V2 API.
 */

import type { ChatId, UserMessage } from "@/src/domain";
import { timeoutSignal, type OpenCodeClient } from "./client";

export async function send(
  client: OpenCodeClient,
  chatId: ChatId,
  msg: UserMessage,
): Promise<void> {
  // The prompt endpoint accepts the message immediately and streams the
  // assistant reply through the event stream; the generous timeout only
  // covers delivery on a slow network.
  const timeout = timeoutSignal(30_000);
  try {
    await client.session.prompt(
      {
        sessionID: chatId,
        text: msg.text,
        ...(msg.attachments && msg.attachments.length > 0
          ? {
              files: msg.attachments.map((file) => ({
                uri: file.uri,
                name: file.name,
              })),
            }
          : {}),
      },
      { signal: timeout.signal },
    );
  } finally {
    timeout.done();
  }
}

export async function interrupt(client: OpenCodeClient, chatId: ChatId): Promise<void> {
  const timeout = timeoutSignal(10_000);
  try {
    await client.session.interrupt({ sessionID: chatId }, { signal: timeout.signal });
  } finally {
    timeout.done();
  }
}
