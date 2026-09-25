import React, { act } from "react";
import { create } from "react-test-renderer";
import * as Clipboard from "expo-clipboard";
import { MarkdownContent } from "../MarkdownContent";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

async function render(ui: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ui);
  });
  return tree;
}

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
        colorScheme="light"
        role="assistant"
        streaming
        text={"# Done\n\nA paragraph is still arriving"}
        testID="markdown-content"
      />,
    );

    expect(tree.root.findByProps({ testID: "markdown-content" })).toBeTruthy();
    expect(
      tree.root.findAllByProps({ children: "A paragraph is still arriving" }).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findByProps({ accessibilityLabel: "Generating" })).toBeTruthy();
  });

  it("renders terminal markdown and copies fenced code", async () => {
    const tree = await render(
      <MarkdownContent
        colorScheme="light"
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
        colorScheme="light"
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
