import { act } from "react";
import { render } from "@/src/test-utils/render";
import * as Clipboard from "expo-clipboard";
import { MarkdownContent } from "../MarkdownContent";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

describe("MarkdownContent", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(Clipboard.setStringAsync).mockClear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("renders stable markdown and keeps a live tail as plain text", async () => {
    const tree = await render(
      <MarkdownContent
        role="assistant"
        streaming
        text={"# Done\n\nA **paragraph** is still arriving"}
      />,
    );

    // The finished block is parsed: the heading marker is gone.
    expect(tree.root.findAllByProps({ children: "Done" }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ children: "# Done" })).toHaveLength(0);
    // The live tail is not: half-arrived syntax stays literal until it settles.
    expect(
      tree.root.findAllByProps({ children: "A **paragraph** is still arriving" }).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: "Generating" }).length).toBeGreaterThan(
      0,
    );
  });

  it("renders terminal markdown and copies fenced code", async () => {
    const tree = await render(
      <MarkdownContent
        role="assistant"
        streaming={false}
        text={"```ts\nconst answer = 42;\n```"}
      />,
    );

    const copy = tree.root.findByProps({ accessibilityLabel: "Copy code" });
    await act(async () => {
      copy.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("const answer = 42;");
  });

  it("does not render remote images when image handlers are disabled", async () => {
    const tree = await render(
      <MarkdownContent
        role="user"
        streaming={false}
        text="![remote](https://example.com/image.png)"
      />,
    );

    expect(
      tree.root.findAllByProps({ source: { uri: "https://example.com/image.png" } }),
    ).toHaveLength(0);
  });
});
