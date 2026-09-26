/**
 * Attachment source sheet: camera, photo library or a file from the device.
 *
 * Rendered only when the backend accepts attachments (the screen gates on the
 * provider's attachments capability).
 */

import { Text, View } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
import type { AttachmentSource } from "./pickAttachments";
import { Icon, type IconName } from "@/src/ui/Icon";
import { Sheet } from "@/src/ui/Sheet";

export interface AttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (source: AttachmentSource) => void;
}

const OPTIONS: { source: AttachmentSource; title: string; icon: IconName; hint: string }[] = [
  {
    source: "camera",
    title: "Camera",
    icon: "camera-outline",
    hint: "Take a photo and attach it",
  },
  {
    source: "image",
    title: "Photos",
    icon: "image-outline",
    hint: "Attach a picture from your library",
  },
  {
    source: "file",
    title: "Files",
    icon: "file-document-outline",
    hint: "Attach a document from your device",
  },
];

export function AttachSheet({ visible, onClose, onPick }: AttachSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} testID="attach-sheet">
      <View className="flex-row gap-2.5">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.source}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            accessibilityHint={option.hint}
            className="h-[88px] flex-1 items-center justify-center gap-2 rounded-[20px] bg-raised active:bg-raised-hover"
            onPress={() => onPick(option.source)}
            testID={`attach-${option.source}`}
          >
            <Icon name={option.icon} size={26} />
            <Text className="text-sm text-text">{option.title}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
