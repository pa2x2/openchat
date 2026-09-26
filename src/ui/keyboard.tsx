/**
 * Keyboard plumbing shared by the surfaces that sit above the keyboard: the
 * composer and the bottom sheets. The app draws edge-to-edge, so no window
 * resizes for the keyboard on Android and every surface has to move itself.
 */

import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, type KeyboardEvent } from "react-native";

/** Whether the soft keyboard is up, so a surface can drop the nav-bar inset. */
export function useKeyboardOpen(): boolean {
  // Seeded from the current state: the show event may have fired before mount.
  const [open, setOpen] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}

/**
 * React Native's KeyboardAvoidingView learns about the keyboard only from
 * show/hide events, so one mounted while the keyboard is already up lays out
 * as if it were hidden and leaves what it wraps under the keyboard. Seed it
 * with the keyboard's current frame; its first layout pass picks that up.
 */
export class SeededKeyboardAvoidingView extends KeyboardAvoidingView {
  componentDidMount() {
    super.componentDidMount?.();
    const endCoordinates = Keyboard.metrics();
    if (!endCoordinates) return;
    // `_keyboardEvent` is the component's own record of the last show event.
    (this as unknown as { _keyboardEvent: KeyboardEvent })._keyboardEvent = {
      duration: 0,
      easing: "keyboard",
      endCoordinates,
    };
  }
}
