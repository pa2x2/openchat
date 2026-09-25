import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/src/lib/cn";
import { Icon, type IconName } from "./Icon";

/**
 * Grouped list: rounded surface cards of rows with hairline separators, the
 * layout the settings screen and the pickers share.
 */

export function GroupLabel({ children }: { children: ReactNode }) {
  return <Text className="px-3 pb-2 pt-4 text-[13px] font-medium text-text-muted">{children}</Text>;
}

export function Group({
  children,
  className,
  testID,
}: {
  children: ReactNode;
  className?: string;
  testID?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn("overflow-hidden rounded-[20px] bg-surface", className)} testID={testID}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <View className="mx-4 h-px bg-border" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Muted text on the right, e.g. the current value of a setting. */
  value?: string;
  /** Custom trailing content; replaces `value`. */
  trailing?: ReactNode;
  /** Show a chevron: the row opens something. */
  chevron?: boolean;
  destructive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  testID?: string;
}

export function Row({
  title,
  subtitle,
  icon,
  value,
  trailing,
  chevron,
  destructive,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  selected,
  testID,
}: RowProps) {
  const tone = destructive ? "danger" : "text";
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      className="min-h-[52px] flex-row items-center gap-3.5 px-4 py-3 active:bg-surface-hover"
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
    >
      {icon ? <Icon name={icon} size={22} tone={tone} /> : null}
      <View className="flex-1">
        <Text
          className={cn("text-base font-medium", destructive ? "text-danger" : "text-text")}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-[13.5px] text-text-muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (value ? (
          <Text className="max-w-[45%] text-[15px] text-text-muted" numberOfLines={1}>
            {value}
          </Text>
        ) : null)}
      {chevron ? <Icon name="chevron-right" size={20} tone="textMuted" /> : null}
    </Pressable>
  );
}
