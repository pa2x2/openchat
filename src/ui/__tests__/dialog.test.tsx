import { act } from "react";
import { Modal } from "react-native";
import { render } from "@/src/test-utils/render";
import { Button } from "../Button";
import { DialogHost, showDialog, useDialogStore } from "../Dialog";

function confirm() {
  const onCancel = jest.fn();
  const onDelete = jest.fn();
  act(() =>
    showDialog({
      title: "Delete chat?",
      actions: [
        { label: "Cancel", style: "cancel", onPress: onCancel },
        { label: "Delete", style: "destructive", onPress: onDelete },
      ],
    }),
  );
  return { onCancel, onDelete };
}

beforeEach(() => {
  useDialogStore.setState({ current: null });
});

describe("DialogHost", () => {
  it("runs the pressed action and closes", async () => {
    const tree = await render(<DialogHost />);
    const { onCancel, onDelete } = confirm();

    const del = tree.root.findAllByType(Button).find((b) => b.props.label === "Delete")!;
    act(() => del.props.onPress());

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });

  it("treats back as cancel", async () => {
    const tree = await render(<DialogHost />);
    const { onCancel, onDelete } = confirm();

    act(() => tree.root.findByType(Modal).props.onRequestClose());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it("keeps a dialog that an action opens", async () => {
    // Confirm → failure: the error dialog is shown from inside the confirm's
    // action, and closing the confirm must not wipe it.
    const tree = await render(<DialogHost />);
    act(() =>
      showDialog({
        title: "Delete chat?",
        actions: [
          { label: "Delete", onPress: () => showDialog({ title: "Could not delete chat" }) },
        ],
      }),
    );
    const del = tree.root.findAllByType(Button).find((b) => b.props.label === "Delete")!;
    act(() => del.props.onPress());

    expect(useDialogStore.getState().current?.title).toBe("Could not delete chat");
  });
});
