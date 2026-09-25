import React, { act } from "react";
import { create } from "react-test-renderer";
import { Button } from "../Button";
import { Bubble } from "../Bubble";
import { Input } from "../Input";

async function render(ui: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ui);
  });
  return tree;
}

describe("Button", () => {
  it("renders its label and fires onPress when enabled", async () => {
    const onPress = jest.fn();
    const tree = await render(<Button label="Send" onPress={onPress} testID="send" />);

    const pressable = tree.root.findByProps({ accessibilityRole: "button" });
    expect(pressable.props.disabled).toBe(false);

    pressable.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("marks the button as disabled via RN's disabled prop", async () => {
    const onPress = jest.fn();
    const tree = await render(<Button label="Send" onPress={onPress} disabled />);

    // RN's Pressable itself suppresses onPress when disabled; the primitive
    // guarantees the accessibility state and opacity styling.
    const pressable = tree.root.findByProps({ accessibilityRole: "button" });
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState.disabled).toBe(true);
  });
});

describe("Bubble", () => {
  it("renders user and assistant text", async () => {
    const user = await render(<Bubble role="user" text="hi" />);
    const assistant = await render(<Bubble role="assistant" text="hello" status="streaming…" />);
    expect(user.root.findByProps({ children: "hi" })).toBeTruthy();
    expect(assistant.root.findByProps({ children: "hello" })).toBeTruthy();
    expect(assistant.root.findByProps({ children: "streaming…" })).toBeTruthy();
  });
});

describe("Input", () => {
  it("renders with a label and forwards changes", async () => {
    const onChangeText = jest.fn();
    const tree = await render(
      <Input value="" onChangeText={onChangeText} label="Server URL" placeholder="https://…" />,
    );
    const input = tree.root.findByProps({ accessibilityLabel: "Server URL" });
    input.props.onChangeText("https://x");
    expect(onChangeText).toHaveBeenCalledWith("https://x");
  });

  it("passes the placeholder a real colour, not a CSS variable", async () => {
    // A `var(--oc-*)` string here is silently dropped by RN, which leaves the
    // placeholder invisible or the wrong colour in dark mode.
    const tree = await render(<Input value="" onChangeText={jest.fn()} placeholder="Type" />);
    const input = tree.root.findByProps({ accessibilityLabel: "Type" });

    expect(input.props.placeholderTextColor).toMatch(/^#[0-9a-f]{3,6}$/i);
  });
});
