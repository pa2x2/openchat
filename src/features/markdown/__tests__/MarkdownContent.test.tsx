import { act } from "react";
import { Linking, ScrollView, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import fixtures from "@/__mocks__/react-native-nitro-markdown/fixtures.json";
import { render } from "@/src/test-utils/render";
import { MarkdownContent } from "../MarkdownContent";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

function renderedText(tree: { toJSON: () => unknown }): string {
  return JSON.stringify(tree.toJSON());
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

  it("shows an unfinished code fence as a code block while it streams", async () => {
    const tree = await render(
      <MarkdownContent role="assistant" streaming text={fixtures.openFence.text} />,
    );

    expect(tree.root.findByProps({ accessibilityLabel: "Copy code" })).toBeTruthy();
    expect(renderedText(tree)).toContain("const b");
    expect(renderedText(tree)).not.toContain("```");
  });

  it("keeps a finished code block mounted while the reply grows after it", async () => {
    const tree = await render(
      <MarkdownContent role="assistant" streaming text={fixtures.fenceThenParagraph.text} />,
    );
    const scroller = tree.root.findByType(ScrollView).instance;

    await act(async () => {
      tree.update(
        <MarkdownContent
          role="assistant"
          streaming
          text={fixtures.fenceThenLongerParagraph.text}
        />,
      );
    });

    // A remount would reset the code's horizontal scroll and copy feedback.
    // Compared as a boolean: Jest can't print a diff of two component instances.
    expect(tree.root.findByType(ScrollView).instance === scroller).toBe(true);
  });

  it("copies fenced code without the fence's trailing newline", async () => {
    const tree = await render(
      <MarkdownContent role="assistant" streaming={false} text={fixtures.closedFence.text} />,
    );

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: "Copy code" }).props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("const answer = 42;");
  });

  it("never loads remote images", async () => {
    const tree = await render(
      <MarkdownContent role="user" streaming={false} text={fixtures.remoteImage.text} />,
    );

    expect(
      tree.root.findAllByProps({ source: { uri: "https://example.com/image.png" } }),
    ).toHaveLength(0);
    expect(renderedText(tree)).toContain("remote");
  });

  it("opens web links but not other schemes", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const tree = await render(
      <MarkdownContent role="assistant" streaming={false} text={fixtures.links.text} />,
    );

    const links = tree.root.findAll((node) => node.type === Text && node.props.onPress);
    expect(links).toHaveLength(1);
    await act(async () => {
      links[0].props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith("https://example.com");
    openURL.mockRestore();
  });

  it("numbers an ordered list from its first number", async () => {
    const tree = await render(
      <MarkdownContent role="assistant" streaming={false} text={fixtures.orderedFromThree.text} />,
    );

    expect(tree.root.findAllByProps({ children: "3." }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ children: "4." }).length).toBeGreaterThan(0);
  });
});
