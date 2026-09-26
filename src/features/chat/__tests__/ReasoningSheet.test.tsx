import { act } from "react";
import { render } from "@/src/test-utils/render";
import { ReasoningSheet } from "../ReasoningSheet";

const variants = [
  { id: "low", label: "Low" },
  { id: "high", label: "High" },
];

describe("ReasoningSheet", () => {
  it("marks the current level, with Auto for no variant", async () => {
    const option = async (selected: string | undefined, testID: string) => {
      const tree = await render(
        <ReasoningSheet
          visible
          onClose={jest.fn()}
          variants={variants}
          selected={selected}
          onSelect={jest.fn()}
        />,
      );
      return tree.root.findByProps({ testID }).props.accessibilityState;
    };
    expect(await option(undefined, "reasoning-option-auto")).toEqual({ selected: true });
    expect(await option("high", "reasoning-option-high")).toEqual({ selected: true });
    expect(await option("high", "reasoning-option-auto")).toEqual({ selected: false });
  });

  it("reports Auto as no variant and closes", async () => {
    // Anything but undefined would reach the server as a variant id.
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const tree = await render(
      <ReasoningSheet
        visible
        onClose={onClose}
        variants={variants}
        selected="high"
        onSelect={onSelect}
      />,
    );
    await act(async () => {
      tree.root.findByProps({ testID: "reasoning-option-auto" }).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(undefined);
    expect(onClose).toHaveBeenCalled();
  });
});
