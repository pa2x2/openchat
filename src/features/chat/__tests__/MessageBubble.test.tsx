import { act } from "react";
import { render } from "@/src/test-utils/render";
import type { Message } from "@/src/domain";
import { MessageBubble } from "../MessageBubble";

function message(patch: Partial<Message> = {}): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    text: "Answer",
    status: "complete",
    createdAt: 1,
    ...patch,
  };
}

describe("MessageBubble", () => {
  it("streams inline and only exposes reasoning when enabled", async () => {
    const hidden = await render(
      <MessageBubble
        message={message({ status: "streaming", reasoning: "thinking" })}
        showReasoning={false}
      />,
    );
    expect(hidden.root.findByProps({ accessibilityLabel: "Generating" })).toBeTruthy();
    expect(hidden.root.findAllByProps({ testID: "reasoning-drawer" })).toHaveLength(0);
    // Reply actions wait for the reply to finish.
    expect(hidden.root.findAllByProps({ testID: "copy-button" })).toHaveLength(0);

    const shown = await render(
      <MessageBubble
        message={message({ status: "streaming", reasoning: "thinking" })}
        showReasoning
      />,
    );
    expect(shown.root.findByProps({ testID: "reasoning-drawer" })).toBeTruthy();
  });

  it("says it is thinking before the first token arrives", async () => {
    const tree = await render(
      <MessageBubble message={message({ status: "pending", text: "" })} showReasoning={false} />,
    );
    expect(tree.root.findByProps({ testID: "thinking-indicator" })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: "markdown-assistant-1" })).toHaveLength(0);
  });

  it("offers copy and share on a finished reply", async () => {
    const tree = await render(<MessageBubble message={message()} showReasoning={false} />);
    expect(tree.root.findByProps({ accessibilityLabel: "Copy reply" })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: "Share reply" })).toBeTruthy();
  });

  it("uses a terminal status after interruption", async () => {
    const tree = await render(
      <MessageBubble
        message={message({ status: "interrupted", text: "```ts\nconst x = 1;" })}
        showReasoning={false}
      />,
    );

    expect(tree.root.findByProps({ children: "Stopped" })).toBeTruthy();
  });
});

describe("MessageBubble attachments", () => {
  const attachment = {
    uri: "",
    mimeType: "image/png",
    name: "photo.png",
    bytes: "QUJD",
    size: 3,
  };

  it("renders the files a user message carries", async () => {
    const tree = await render(
      <MessageBubble
        showReasoning={false}
        message={message({ role: "user", text: "look", attachments: [attachment] })}
      />,
    );

    expect(tree.root.findByProps({ testID: "attachment-chip-photo.png" })).toBeTruthy();
    expect(tree.root.findByProps({ testID: "attachment-image-photo.png" }).props.source).toEqual({
      uri: "data:image/png;base64,QUJD",
    });
  });

  it("shows no attachment strip for a plain message", async () => {
    const tree = await render(<MessageBubble showReasoning={false} message={message()} />);
    expect(tree.root.findAllByProps({ testID: /^attachment-chip-/ })).toHaveLength(0);
  });

  it("falls back to the file type when the payload is not loaded yet", async () => {
    // A transcript restored from the cache knows the file's name but not its
    // bytes, so there is no source for a thumbnail.
    const tree = await render(
      <MessageBubble
        showReasoning={false}
        message={message({
          role: "user",
          text: "look",
          attachments: [{ uri: "", mimeType: "image/png", name: "photo.png", size: 3 }],
        })}
      />,
    );

    expect(tree.root.findByProps({ testID: "attachment-chip-photo.png" })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: "attachment-image-photo.png" })).toHaveLength(0);
    expect(tree.root.findByProps({ children: "PNG" })).toBeTruthy();
  });
});

describe("MessageBubble regenerate", () => {
  it("offers the rerun only when the screen allows it", async () => {
    const without = await render(<MessageBubble showReasoning={false} message={message()} />);
    expect(without.root.findAllByProps({ testID: "regenerate-button" })).toHaveLength(0);

    const onRegenerate = jest.fn();
    const with_ = await render(
      <MessageBubble showReasoning={false} message={message()} onRegenerate={onRegenerate} />,
    );
    const button = with_.root.findByProps({ testID: "regenerate-button" });
    await act(async () => {
      button.props.onPress();
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("hides the rerun while the reply is still streaming", async () => {
    const tree = await render(
      <MessageBubble
        showReasoning={false}
        message={message({ status: "streaming" })}
        onRegenerate={jest.fn()}
      />,
    );
    expect(tree.root.findAllByProps({ testID: "regenerate-button" })).toHaveLength(0);
  });
});
