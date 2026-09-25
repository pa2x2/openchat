/**
 * Attachment source sheet: photo library or a file from the device.
 *
 * Rendered only when the backend accepts attachments (the screen gates on the
 * provider's attachments capability).
 */

import { Pressable, Text, View } from "react-native";
import type { AttachmentSource } from "./pickAttachments";
import { Button } from "@/src/ui/Button";
import { Sheet } from "@/src/ui/Sheet";

export interface AttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (source: AttachmentSource) => void;
}

const OPTIONS: { source: AttachmentSource; title: string; description: string }[] = [
  {
    source: "image",
    title: "Photo",
    description: "Attach a picture from your library",
  },
  {
    source: "file",
    title: "File",
    description: "Attach a document from your device",
  },
];

export function AttachSheet({ visible, onClose, onPick }: AttachSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Attach" testID="attach-sheet">
      <View className="gap-2 pb-2">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.source}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            className="rounded-xl border border-border px-4 py-3 active:bg-surface-hover"
            onPress={() => onPick(option.source)}
            testID={`attach-${option.source}`}
          >
            <Text className="text-base font-semibold text-text">{option.title}</Text>
            <Text className="mt-0.5 text-sm text-text-muted">{option.description}</Text>
          </Pressable>
        ))}
        <Button label="Cancel" variant="secondary" onPress={onClose} testID="attach-cancel" />
      </View>
    </Sheet>
  );
}
