import React, { act } from "react";
import { create } from "react-test-renderer";
import { Composer } from "../Composer";

async function render(ui: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ui);
  });
  return tree;
}

describe("Composer", () => {
  it("keeps send disabled until there is text", async () => {
    const onSend = jest.fn();
    const tree = await render(<Composer onSend={onSend} />);
    const send = tree.root.findByProps({ testID: "composer-send" });

    expect(send.props.disabled).toBe(true);
    expect(send.props.accessibilityState).toEqual({ disabled: true });
  });

  it("renders one accessible stop control while streaming", async () => {
    const onStop = jest.fn();
    const tree = await render(<Composer onSend={jest.fn()} onStop={onStop} />);
    const stop = tree.root.findByProps({ testID: "composer-stop" });

    expect(stop.props.accessibilityLabel).toBe("Stop generating");
    expect(stop.props.accessibilityState).toEqual({ busy: true });
    await act(async () => {
      stop.props.onPress();
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe("Composer attachments", () => {
  const attachment = {
    uri: "file:///cache/photo.jpg",
    mimeType: "image/jpeg",
    name: "photo.jpg",
    bytes: "QUJD",
    size: 3,
  };

  it("offers the attach button only when the caller allows attachments", async () => {
    const without = await render(<Composer onSend={jest.fn()} />);
    expect(without.root.findAllByProps({ testID: "composer-attach" })).toHaveLength(0);

    const onAttach = jest.fn();
    const with_ = await render(<Composer onSend={jest.fn()} onAttach={onAttach} />);
    const attach = with_.root.findByProps({ testID: "composer-attach" });
    expect(attach.props.accessibilityLabel).toBe("Add attachment");
    await act(async () => {
      attach.props.onPress();
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("hides the attach button while a reply is streaming", async () => {
    const tree = await render(
      <Composer onSend={jest.fn()} onStop={jest.fn()} onAttach={jest.fn()} />,
    );
    expect(tree.root.findAllByProps({ testID: "composer-attach" })).toHaveLength(0);
  });

  it("sends with an attachment and no text, then clears the field", async () => {
    const onSend = jest.fn();
    const tree = await render(
      <Composer onSend={onSend} attachments={[attachment]} onRemoveAttachment={jest.fn()} />,
    );
    const send = tree.root.findByProps({ testID: "composer-send" });
    expect(send.props.disabled).toBe(false);

    await act(async () => {
      send.props.onPress();
    });

    expect(onSend).toHaveBeenCalledWith("", [attachment]);
    expect(tree.root.findByProps({ testID: "composer-input" }).props.value).toBe("");
  });

  it("shows staged attachments and removes the one that is tapped", async () => {
    const onRemoveAttachment = jest.fn();
    const tree = await render(
      <Composer
        onSend={jest.fn()}
        attachments={[attachment]}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );

    expect(tree.root.findByProps({ testID: "attachment-chip-photo.jpg" })).toBeTruthy();
    expect(tree.root.findByProps({ testID: "attachment-image-photo.jpg" })).toBeTruthy();

    const remove = tree.root.findByProps({ testID: "attachment-remove-photo.jpg" });
    expect(remove.props.accessibilityLabel).toBe("Remove photo.jpg");
    await act(async () => {
      remove.props.onPress();
    });
    expect(onRemoveAttachment).toHaveBeenCalledWith(attachment);
  });

  it("sends text and attachments together", async () => {
    const onSend = jest.fn();
    const tree = await render(
      <Composer onSend={onSend} attachments={[attachment]} onRemoveAttachment={jest.fn()} />,
    );

    await act(async () => {
      tree.root.findByProps({ testID: "composer-input" }).props.onChangeText("look at this");
    });
    await act(async () => {
      tree.root.findByProps({ testID: "composer-send" }).props.onPress();
    });

    expect(onSend).toHaveBeenCalledWith("look at this", [attachment]);
  });
});
