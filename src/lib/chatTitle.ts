import { UNTITLED_CHAT } from "@/src/domain";
import type { TFunction } from "i18next";

/** A chat's title for display; one the server has not named yet reads as untitled. */
export function chatTitle(t: TFunction, title: string): string {
  return title && title !== UNTITLED_CHAT ? title : t("chat.untitled");
}
