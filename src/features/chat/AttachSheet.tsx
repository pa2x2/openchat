/**
 * Attachment source sheet: camera, photo library or a file from the device.
 *
 * Rendered only when the backend accepts attachments (the screen gates on the
 * provider's attachments capability).
 */

import { View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import type { AttachmentSource } from "./pickAttachments";
import { Icon, type IconName } from "@/src/ui/Icon";
import { Sheet } from "@/src/ui/Sheet";
import { useTranslation } from "react-i18next";

export interface AttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (source: AttachmentSource) => void;
}

const OPTIONS: { source: AttachmentSource; icon: IconName }[] = [
  { source: "camera", icon: "camera-outline" },
  { source: "image", icon: "image-outline" },
  { source: "file", icon: "file-document-outline" },
];

export function AttachSheet({ visible, onClose, onPick }: AttachSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} testID="attach-sheet">
      <View className="flex-row gap-2.5">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.source}
            accessibilityRole="button"
            accessibilityLabel={t(`attach.${option.source}.title`)}
            accessibilityHint={t(`attach.${option.source}.hint`)}
            className="h-[88px] flex-1 items-center justify-center gap-2 rounded-[20px] bg-raised active:bg-raised-hover"
            onPress={() => onPick(option.source)}
            testID={`attach-${option.source}`}
          >
            <Icon name={option.icon} size={26} />
            <Text className="text-sm text-text">{t(`attach.${option.source}.title`)}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
