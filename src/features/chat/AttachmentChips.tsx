/**
 * Attachment previews: the files a message carries.
 *
 * Two layouts: large previews stacked at the end of a sent message, and a
 * scrolling row of small thumbnails inside the composer (where the list can
 * outgrow the width).
 */

import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { Attachment } from "@/src/domain";
import { attachmentUri, formatBytes, isImageAttachment } from "@/src/lib/attachments";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";

export interface AttachmentStripProps {
  attachments: Attachment[];
  onRemove?: (attachment: Attachment) => void;
  testID?: string;
}

// Attachments have no id, and two can share a name (the same file picked
// twice), so a staged attachment is keyed by the object itself.
const stagedKeys = new WeakMap<Attachment, number>();
let nextStagedKey = 0;

function stagedKeyOf(attachment: Attachment): number {
  let key = stagedKeys.get(attachment);
  if (key === undefined) {
    key = nextStagedKey++;
    stagedKeys.set(attachment, key);
  }
  return key;
}

/** Files of a message already sent, as shown above its bubble. */
export function AttachmentStrip({ attachments, testID }: AttachmentStripProps) {
  return (
    <View className="flex-row flex-wrap justify-end gap-2" testID={testID}>
      {/* A sent message's files never change order; indexes also stay put
          when a refetch replaces the objects. */}
      {attachments.map((attachment, index) => (
        <AttachmentChip key={index} attachment={attachment} size="large" />
      ))}
    </View>
  );
}

/** Files staged on the message being written, with a remove control each. */
export function AttachmentChips({ attachments, onRemove, testID }: AttachmentStripProps) {
  return (
    <View className="px-1.5 pb-0.5 pt-1.5" testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        // Room for the remove badges, which overhang each chip's corner.
        contentContainerClassName="flex-row gap-2 pr-1 pt-1.5"
      >
        {attachments.map((attachment) => (
          <AttachmentChip
            key={stagedKeyOf(attachment)}
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
  size = "small",
}: {
  attachment: Attachment;
  onRemove?: (attachment: Attachment) => void;
  size?: "small" | "large";
}) {
  const bytes = formatBytes(attachment.size);
  const extension = attachment.name.includes(".")
    ? attachment.name.split(".").pop()!.toUpperCase()
    : "FILE";
  // A transcript read from the cache has the file's name but not its payload
  // yet, so there is nothing to show a thumbnail of until the server's copy
  // arrives; the chip falls back to the file's type.
  const source = attachmentUri(attachment);
  const preview = isImageAttachment(attachment) && source.length > 0;
  const side = size === "large" ? 150 : 64;
  // Small chips sit inside the composer (elevated chrome), large ones on the page.
  const tile = size === "large" ? "bg-surface" : "bg-raised";

  return (
    <View testID={`attachment-chip-${attachment.name}`}>
      {preview ? (
        <Image
          accessibilityLabel={attachment.name}
          source={{ uri: source }}
          style={{ width: side, height: side }}
          className={cn(tile, size === "large" ? "rounded-[18px]" : "rounded-[14px]")}
          testID={`attachment-image-${attachment.name}`}
        />
      ) : (
        <View
          className={cn(
            "flex-row items-center gap-2.5 pl-2.5 pr-3.5",
            tile,
            size === "large" ? "h-16 rounded-2xl" : "h-16 rounded-[14px]",
          )}
        >
          <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-primary">
            <Text className="text-[10px] font-bold text-primary-foreground" numberOfLines={1}>
              {extension.slice(0, 4)}
            </Text>
          </View>
          <View className="max-w-40">
            <Text className="text-sm font-medium text-text" numberOfLines={1}>
              {attachment.name}
            </Text>
            {bytes ? (
              <Text className="text-xs text-text-muted" numberOfLines={1}>
                {bytes}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      {onRemove ? (
        <Pressable
          accessibilityLabel={`Remove ${attachment.name}`}
          accessibilityRole="button"
          className="absolute -right-1.5 -top-1.5 h-[22px] w-[22px] items-center justify-center rounded-full bg-text"
          hitSlop={8}
          onPress={() => onRemove(attachment)}
          testID={`attachment-remove-${attachment.name}`}
        >
          <Icon name="close" size={14} tone="background" />
        </Pressable>
      ) : null}
    </View>
  );
}
