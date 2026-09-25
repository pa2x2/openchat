import React, { act } from "react";
import { create } from "react-test-renderer";
import type { Message } from "@/src/domain";
import { MessageBubble } from "../MessageBubble";

async function render(ui: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ui);
  });
  return tree;
}

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
  it("shows live status and only exposes reasoning when enabled", async () => {
    const hidden = await render(
      <MessageBubble
        colorScheme="light"
        message={message({ status: "streaming", reasoning: "thinking" })}
        showReasoning={false}
      />,
    );
    expect(hidden.root.findByProps({ children: "Generating…" })).toBeTruthy();
    expect(hidden.root.findAllByProps({ testID: "reasoning-drawer" })).toHaveLength(0);

    const shown = await render(
      <MessageBubble
        colorScheme="light"
        message={message({ status: "streaming", reasoning: "thinking" })}
        showReasoning
      />,
    );
    expect(shown.root.findByProps({ testID: "reasoning-drawer" })).toBeTruthy();
  });

  it("uses a terminal status after interruption", async () => {
    const tree = await render(
      <MessageBubble
        colorScheme="dark"
        message={message({ status: "interrupted", text: "```ts\nconst x = 1;" })}
        showReasoning={false}
      />,
    );

    expect(tree.root.findByProps({ children: "Stopped" })).toBeTruthy();
  });
});
