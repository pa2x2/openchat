import { View } from "react-native";
import { cn } from "@/src/lib/cn";
import { Pulse } from "./Pulse";
import { useTranslation } from "react-i18next";

/**
 * Size and shape come from `className`. A block does not animate by itself:
 * wrap a group in `SkeletonGroup` so its blocks pulse together.
 */
export function Skeleton({ className }: { className?: string }) {
  return <View className={cn("rounded-full bg-surface", className)} />;
}

export function SkeletonGroup({
  children,
  label,
  className,
  testID,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={label ?? t("common.loading")}
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      <Pulse>
        <View className={className}>{children}</View>
      </Pulse>
    </View>
  );
}
