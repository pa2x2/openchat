import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";

const COPIED_MS = 1500;

/**
 * Copies text and reports `copied` for a moment afterwards, only once the
 * clipboard took it: it can refuse on web or in a restricted host, and a
 * check mark then would claim a copy that never happened.
 */
export function useCopyToClipboard(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function copy(text: string) {
    void Clipboard.setStringAsync(text)
      .then((ok) => {
        if (!ok) return;
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => undefined);
  }

  return { copied, copy };
}
