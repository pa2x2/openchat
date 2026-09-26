import { render } from "@/src/test-utils/render";
import { Input } from "../Input";

describe("Input", () => {
  it("passes the placeholder a real colour, not a CSS variable", async () => {
    // A `var(--oc-*)` string here is silently dropped by RN, which leaves the
    // placeholder invisible or the wrong colour in dark mode.
    const tree = await render(<Input value="" onChangeText={jest.fn()} placeholder="Type" />);
    const input = tree.root.findByProps({ accessibilityLabel: "Type" });

    expect(input.props.placeholderTextColor).toMatch(/^#[0-9a-f]{3,6}$/i);
  });
});
