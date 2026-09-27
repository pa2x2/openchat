import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Modal } from "./Modal";
import { Pressable } from "./Pressable";
import { create } from "zustand";
import { Button, type ButtonVariant } from "./Button";
import { SeededKeyboardAvoidingView } from "./keyboard";
import { TextInput } from "./TextInput";
import { useAppTheme } from "./theme";

export interface DialogAction {
  label: string;
  /** `cancel` also runs when the dialog is dismissed with back or a tap outside. */
  style?: "default" | "cancel" | "destructive";
  /** Receives the field's text when the dialog has one, and "" otherwise. */
  onPress?: (value: string) => void;
}

export interface DialogRequest {
  title: string;
  message?: string;
  /** A single-line text field, filled with `value`. */
  input?: { value: string; placeholder?: string; label: string };
  /** Defaults to a single "OK". */
  actions?: DialogAction[];
}

// Closing only clears `open`: the request stays so the Modal can fade out
// with its content still on screen.
const useDialogStore = create<{ request: DialogRequest | null; open: boolean }>(() => ({
  request: null,
  open: false,
}));

/**
 * Themed stand-in for `Alert.alert`, callable from outside React. The system
 * alert ignores the app's palette and shape, so it looks foreign on every
 * theme. A second call replaces whatever is showing.
 */
export function showDialog(request: DialogRequest) {
  useDialogStore.setState({ request, open: true });
}

const variantFor: Record<NonNullable<DialogAction["style"]>, ButtonVariant> = {
  default: "primary",
  cancel: "secondary",
  destructive: "danger",
};

/** Mounted once, at the root, inside the view that seeds the theme variables. */
export function DialogHost() {
  const { colors } = useAppTheme();
  const shown = useDialogStore((state) => state.request);
  const open = useDialogStore((state) => state.open);
  const [value, setValue] = useState("");
  // Each request starts from its own value, not what was typed into the last one.
  const [valueFor, setValueFor] = useState<DialogRequest | null>(null);
  if (shown !== valueFor) {
    setValueFor(shown);
    setValue(shown?.input?.value ?? "");
  }

  function close(action?: DialogAction) {
    // Closed first, so an action that opens another dialog keeps it open.
    useDialogStore.setState({ open: false });
    action?.onPress?.(value);
  }

  const actions = shown?.actions ?? [{ label: "OK" }];
  const dismiss = () => close(actions.find((action) => action.style === "cancel"));

  return (
    <Modal visible={open} animationType="fade" onRequestClose={dismiss}>
      {/* The Modal is its own window, so it has to rise above the keyboard itself. */}
      <SeededKeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: 0.4 }]}
          onPress={dismiss}
          accessibilityLabel="Close dialog"
        />
        {shown ? (
          <View
            accessibilityRole="alert"
            className="w-full max-w-[400px] rounded-[28px] bg-elevated px-6 pb-5 pt-6"
            testID="dialog"
          >
            <Text className="text-lg font-semibold text-text">{shown.title}</Text>
            {shown.message ? (
              <Text className="mt-2 text-[15px] leading-[21px] text-text-muted">
                {shown.message}
              </Text>
            ) : null}
            {shown.input ? (
              <TextInput
                autoFocus
                selectTextOnFocus
                value={value}
                onChangeText={setValue}
                placeholder={shown.input.placeholder}
                accessibilityLabel={shown.input.label}
                returnKeyType="done"
                onSubmitEditing={() =>
                  close(actions.find((action) => (action.style ?? "default") === "default"))
                }
                className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-base focus:border-primary"
                testID="dialog-input"
              />
            ) : null}
            <View className="mt-6 flex-row flex-wrap justify-end gap-2">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  label={action.label}
                  variant={variantFor[action.style ?? "default"]}
                  size="sm"
                  className="px-5 py-2.5"
                  onPress={() => close(action)}
                  testID={`dialog-action-${action.label}`}
                />
              ))}
            </View>
          </View>
        ) : null}
      </SeededKeyboardAvoidingView>
    </Modal>
  );
}
