import { View } from "react-native";
import { cn } from "@/src/lib/cn";
import { Pulse } from "./Pulse";

/**
 * Size and shape come from `className`. A block does not animate by itself:
 * wrap a group in `SkeletonGroup` so its blocks pulse together.
 */
export function Skeleton({ className }: { className?: string }) {
  return <View className={cn("rounded-full bg-surface", className)} />;
}

export function SkeletonGroup({
  children,
  label = "Loading",
  className,
  testID,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  testID?: string;
}) {
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} testID={testID}>
      <Pulse>
        <View className={className}>{children}</View>
      </Pulse>
    </View>
  );
}
