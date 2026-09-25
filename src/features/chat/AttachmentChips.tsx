/**
 * Attachment previews: the files a message carries.
 *
 * Two layouts: a wrapping strip for a transcript bubble, and a scrolling strip
 * for the composer (where the list can outgrow the width).
 */

import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { Attachment } from "@/src/domain";
import { attachmentUri, formatBytes, isImageAttachment } from "@/src/lib/attachments";

export interface AttachmentStripProps {
  attachments: Attachment[];
  onRemove?: (attachment: Attachment) => void;
  testID?: string;
}

/** Files of a message already sent, as shown in its bubble. */
export function AttachmentStrip({ attachments, testID }: AttachmentStripProps) {
  return (
    <View className="flex-row flex-wrap" testID={testID}>
      {attachments.map((attachment) => (
        <AttachmentChip key={`${attachment.name}-${attachment.mimeType}`} attachment={attachment} />
      ))}
    </View>
  );
}

/** Files staged on the message being written, with a remove control each. */
export function AttachmentChips({ attachments, onRemove, testID }: AttachmentStripProps) {
  return (
    <View className="border-b border-border px-3 py-2" testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerClassName="flex-row"
      >
        {attachments.map((attachment) => (
          <AttachmentChip
            key={`${attachment.name}-${attachment.mimeType}`}
            attachment={attachment}
            onRemove={onRemove}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** One attachment: an image thumbnail, or a labelled chip for other files. */
export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: (attachment: Attachment) => void;
}) {
  const size = formatBytes(attachment.size);
  const extension = attachment.name.includes(".")
    ? attachment.name.split(".").pop()!.toUpperCase()
    : "FILE";
  // A transcript read from the cache has the file's name but not its payload
  // yet, so there is nothing to show a thumbnail of until the server's copy
  // arrives; the chip falls back to the file's type.
  const source = attachmentUri(attachment);
  const preview = isImageAttachment(attachment) && source.length > 0;
  return (
    <View
      className="mb-1 mr-2 flex-row items-center gap-2 self-start rounded-xl border border-border bg-surface py-1 pl-1 pr-2"
      testID={`attachment-chip-${attachment.name}`}
    >
      {preview ? (
        <Image
          accessibilityLabel={attachment.name}
          source={{ uri: source }}
          style={{ width: 40, height: 40 }}
          className="rounded-lg"
          testID={`attachment-image-${attachment.name}`}
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-hover">
          <Text className="text-[10px] font-semibold text-text-muted" numberOfLines={1}>
            {extension.slice(0, 4)}
          </Text>
        </View>
      )}
      <View className="max-w-40">
        <Text className="text-sm font-medium text-text" numberOfLines={1}>
          {attachment.name}
        </Text>
        {size ? (
          <Text className="text-xs text-text-muted" numberOfLines={1}>
            {size}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable
          accessibilityLabel={`Remove ${attachment.name}`}
          accessibilityRole="button"
          className="rounded-full p-1 active:bg-surface-hover"
          hitSlop={8}
          onPress={() => onRemove(attachment)}
          testID={`attachment-remove-${attachment.name}`}
        >
          <Text className="text-sm text-text-muted">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
