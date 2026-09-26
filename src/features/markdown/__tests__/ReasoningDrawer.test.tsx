import { act } from "react";
import { render } from "@/src/test-utils/render";
import { ReasoningDrawer } from "../ReasoningDrawer";

describe("ReasoningDrawer", () => {
  it("stays hidden when the capability is disabled or there is no reasoning", async () => {
    const disabled = await render(<ReasoningDrawer enabled={false} text="private reasoning" />);
    expect(disabled.root.findAllByProps({ testID: "reasoning-drawer" })).toHaveLength(0);

    const empty = await render(<ReasoningDrawer enabled text="" />);
    expect(empty.root.findAllByProps({ testID: "reasoning-drawer" })).toHaveLength(0);
  });

  it("is collapsed by default and expands accessibly", async () => {
    const tree = await render(<ReasoningDrawer enabled text={"step one\nstep two"} />);
    const toggle = tree.root.findByProps({ testID: "reasoning-toggle" });

    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(tree.root.findAllByProps({ testID: "reasoning-content" })).toHaveLength(0);

    await act(async () => {
      toggle.props.onPress();
    });

    expect(tree.root.findByProps({ testID: "reasoning-content" }).props.children).toBe(
      "step one\nstep two",
    );
    expect(tree.root.findByProps({ testID: "reasoning-toggle" }).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it("shows a streaming label while the answer is live", async () => {
    const tree = await render(<ReasoningDrawer enabled streaming text="thinking" />);
    expect(
      tree.root.findByProps({ testID: "reasoning-toggle" }).findByProps({ children: "Thinking…" }),
    ).toBeTruthy();
  });
});
