import { UNTITLED_CHAT } from "@/src/domain";
import { t } from "@/src/i18n";

/** A chat's title for display; one the server has not named yet reads as untitled. */
export function chatTitle(title: string): string {
  return title && title !== UNTITLED_CHAT ? title : t("chat.untitled");
}
