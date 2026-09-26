import { act } from "react";
import { render } from "@/src/test-utils/render";
import { Composer } from "../Composer";

describe("Composer", () => {
  it("keeps send disabled until there is text", async () => {
    const onSend = jest.fn();
    const tree = await render(<Composer onSend={onSend} />);
    const send = () => tree.root.findByProps({ testID: "composer-send" });

    expect(send().props.disabled).toBe(true);
    expect(send().props.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      tree.root.findByProps({ testID: "composer-input" }).props.onChangeText("   ");
    });
    expect(send().props.disabled).toBe(true);

    await act(async () => {
      tree.root.findByProps({ testID: "composer-input" }).props.onChangeText("hi");
    });
    expect(send().props.disabled).toBe(false);
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

  it("gives the input a real placeholder colour, not a CSS variable", async () => {
    // A `var(--oc-*)` string is dropped by RN, leaving the placeholder
    // unreadable in dark mode.
    const tree = await render(<Composer onSend={jest.fn()} />);
    const input = tree.root.findByProps({ testID: "composer-input" });

    expect(input.props.placeholderTextColor).toMatch(/^#[0-9a-f]{3,6}$/i);
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

describe("Composer reasoning chip", () => {
  it("shows the level only when the caller passes one, and hides it while streaming", async () => {
    const without = await render(<Composer onSend={jest.fn()} />);
    expect(without.root.findAllByProps({ testID: "composer-reasoning" })).toHaveLength(0);

    const onPress = jest.fn();
    const idle = await render(
      <Composer onSend={jest.fn()} reasoning={{ label: "High", onPress }} />,
    );
    const chip = idle.root.findByProps({ testID: "composer-reasoning" });
    expect(chip.props.accessibilityLabel).toBe("Reasoning: High");
    await act(async () => {
      chip.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    const streaming = await render(
      <Composer onSend={jest.fn()} onStop={jest.fn()} reasoning={{ label: "High", onPress }} />,
    );
    expect(streaming.root.findAllByProps({ testID: "composer-reasoning" })).toHaveLength(0);
  });
});
