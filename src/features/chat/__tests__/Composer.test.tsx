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
