import { Text, View } from "react-native";
import type { ToolCategory, TurnActivity } from "@/src/domain";
import { Icon, type IconName } from "@/src/ui/Icon";
import { Pulse } from "@/src/ui/Pulse";

const TOOLS: Record<Exclude<ToolCategory, "other">, { icon: IconName; label: string }> = {
  command: { icon: "console-line", label: "Running a command" },
  read: { icon: "file-document-outline", label: "Reading files" },
  search: { icon: "magnify", label: "Searching files" },
  edit: { icon: "pencil-outline", label: "Editing files" },
  "web-search": { icon: "web", label: "Searching the web" },
  "web-fetch": { icon: "web", label: "Reading a web page" },
  subtask: { icon: "source-branch", label: "Running a subtask" },
};

function describe(activity: TurnActivity): { icon: IconName; label: string } {
  switch (activity.kind) {
    case "thinking":
      return { icon: "brain", label: "Thinking" };
    case "tool":
      if (activity.category !== "other") return TOOLS[activity.category];
      return {
        icon: "wrench-outline",
        label: activity.name ? `Using ${activity.name}` : "Using a tool",
      };
    case "retrying":
      return {
        icon: "refresh",
        label: activity.attempt > 1 ? `Retrying (attempt ${activity.attempt})` : "Retrying",
      };
    case "compacting":
      return { icon: "archive-arrow-down-outline", label: "Compacting the conversation" };
  }
}

export function ActivityIndicator({ activity }: { activity: TurnActivity }) {
  const { icon, label } = describe(activity);
  return (
    <Pulse>
      <View
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2 py-1"
        testID="activity-indicator"
      >
        <Icon name={icon} size={17} tone="textMuted" />
        <Text className="text-[15px] text-text-muted">{label}</Text>
      </View>
    </Pulse>
  );
}
