import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/src/ui/Icon";
import { Pulse } from "@/src/ui/Pulse";
import { toolLabel, workItemIcon, workRow, type WorkBlock, type WorkItem } from "./replyLayout";

function ReasoningText({ text }: { text: string }) {
  return (
    <Text
      selectable
      className="mb-1 mt-1 text-[14.5px] leading-[22px] text-text-muted"
      testID="reasoning-content"
    >
      {text}
    </Text>
  );
}

function ThoughtItem({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityHint={expanded ? "Hides the model reasoning" : "Shows the model reasoning"}
        accessibilityLabel="Thought"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center gap-2 self-start py-1"
        hitSlop={6}
        onPress={() => setExpanded((current) => !current)}
      >
        <Icon name="brain" size={15} tone="textMuted" />
        <Text className="text-[14.5px] text-text-muted">Thought</Text>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} tone="textMuted" />
      </Pressable>
      {expanded ? <ReasoningText text={text} /> : null}
    </View>
  );
}

function WorkItems({ items }: { items: WorkItem[] }) {
  // A row of thinking alone opens straight onto the thought.
  if (items.length === 1 && items[0].type === "reasoning") {
    return (
      <View className="ml-2 border-l-2 border-border pl-3">
        <ReasoningText text={items[0].text} />
      </View>
    );
  }
  return (
    <View className="ml-2 border-l-2 border-border pl-3" testID="work-items">
      {items.map((item, index) =>
        item.type === "reasoning" ? (
          <ThoughtItem key={index} text={item.text} />
        ) : (
          <View key={item.tool.id} className="flex-row items-start gap-2 py-1">
            <View className="pt-0.5">
              <Icon
                name={workItemIcon(item)}
                size={15}
                tone={item.tool.status === "failed" ? "danger" : "textMuted"}
              />
            </View>
            <Text numberOfLines={2} className="shrink text-[14.5px] text-text-muted">
              {toolLabel(item.tool)}
              {item.tool.status === "failed" ? (
                <Text className="text-danger"> · Failed</Text>
              ) : null}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

/**
 * The tool calls and thinking between two texts of a reply, collapsed to one
 * line that opens onto each of them. As a reply's live row it pulses and says
 * what the reply is doing now.
 */
export function WorkRow({ block }: { block: WorkBlock }) {
  const [expanded, setExpanded] = useState(false);
  const { icon, label } = workRow(block);
  const expandable = block.items.length > 0;
  const row = (
    <View className="flex-row items-center gap-2 py-1">
      <Icon name={icon} size={17} tone="textMuted" />
      <Text numberOfLines={1} className="shrink text-[15px] text-text-muted">
        {label}
      </Text>
      {expandable ? (
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={18} tone="textMuted" />
      ) : null}
    </View>
  );
  return (
    <View className="my-0.5 self-stretch">
      <Pressable
        accessibilityLabel={label}
        accessibilityLiveRegion={block.live ? "polite" : "none"}
        accessibilityRole={expandable ? "button" : undefined}
        accessibilityState={expandable ? { expanded } : undefined}
        className="max-w-full self-start"
        disabled={!expandable}
        hitSlop={6}
        onPress={() => setExpanded((current) => !current)}
        testID={block.live ? "live-work-row" : "work-row"}
      >
        {block.live ? <Pulse>{row}</Pulse> : row}
      </Pressable>
      {expanded ? <WorkItems items={block.items} /> : null}
    </View>
  );
}
