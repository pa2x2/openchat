import { Modal as RNModal, type ModalProps as RNModalProps } from "react-native";

export type ModalProps = Omit<
  RNModalProps,
  "transparent" | "statusBarTranslucent" | "navigationBarTranslucent"
>;

/**
 * A Modal is its own Android window. Unless it is transparent and draws under
 * both system bars, Android paints those bars in its own default colours over
 * the app's, so these are fixed rather than left to each caller.
 */
export function Modal(props: ModalProps) {
  return <RNModal {...props} transparent statusBarTranslucent navigationBarTranslucent />;
}
