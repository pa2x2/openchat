/**
 * Settling OpenCode forms: questions the server asks mid-run and waits on.
 */

import type { ChatForm, ChatId, FormAnswer } from "@/src/domain";
import { timeoutSignal, toConnectionError, type OpenCodeClient } from "./client";
import { toChatForm } from "./normalize";

const FORM_TIMEOUT_MS = 10_000;

export async function answerForm(
  client: OpenCodeClient,
  chatId: ChatId,
  formId: string,
  answer: FormAnswer,
): Promise<void> {
  const timeout = timeoutSignal(FORM_TIMEOUT_MS);
  try {
    await client.session.form.reply(
      { sessionID: chatId, formID: formId, answer },
      { signal: timeout.signal },
    );
  } catch (error) {
    throw toConnectionError(error);
  } finally {
    timeout.done();
  }
}

export async function dismissForm(
  client: OpenCodeClient,
  chatId: ChatId,
  formId: string,
): Promise<void> {
  const timeout = timeoutSignal(FORM_TIMEOUT_MS);
  try {
    await client.session.form.cancel(
      { sessionID: chatId, formID: formId },
      { signal: timeout.signal },
    );
  } catch (error) {
    throw toConnectionError(error);
  } finally {
    timeout.done();
  }
}

export async function pendingForms(client: OpenCodeClient, chatId: ChatId): Promise<ChatForm[]> {
  const timeout = timeoutSignal(FORM_TIMEOUT_MS);
  try {
    const forms = await client.session.form.list({ sessionID: chatId }, { signal: timeout.signal });
    return forms.map(toChatForm);
  } catch (error) {
    throw toConnectionError(error);
  } finally {
    timeout.done();
  }
}
