/**
 * Picking files to attach to a message.
 *
 * The pickers hand back a local uri; a remote server needs the bytes, so
 * everything picked here is read and base64-encoded before it becomes an
 * `Attachment`. Photos arrive from the image picker already encoded and
 * re-compressed, which is what keeps phone photos inside the size budget;
 * other files are read from the app's cache directory.
 *
 * The library and document pickers need no runtime permission: the system
 * pickers grant access to the chosen item only. The camera does, because
 * expo-image-picker declares CAMERA in its manifest, and Android refuses the
 * capture intent to an app that declares the permission without holding it.
 */

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { fromUint8Array } from "js-base64";
import type { Attachment } from "@/src/domain";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  formatBytes,
} from "@/src/lib/attachments";

/** Compression applied to picked photos; full-size camera photos are megabytes. */
const IMAGE_QUALITY = 0.7;

export type AttachmentSource = "camera" | "image" | "file";

export class AttachmentError extends Error {
  readonly name = "AttachmentError";
}

/** Decoded size of a base64 payload, without decoding it. */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function checkCount(added: number, existing: Attachment[]): void {
  if (existing.length + added > MAX_ATTACHMENT_COUNT) {
    throw new AttachmentError(`Up to ${MAX_ATTACHMENT_COUNT} files per message.`);
  }
}

function checkTotal(candidates: Attachment[], existing: Attachment[]): void {
  const total = [...existing, ...candidates].reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    throw new AttachmentError(
      `Attachments are limited to ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)} per message.`,
    );
  }
}

function friendlyError(error: unknown, source: AttachmentSource): AttachmentError {
  if (error instanceof AttachmentError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/permission|denied/i.test(message)) {
    return new AttachmentError(
      source === "camera"
        ? "OpenChat could not open the camera."
        : source === "image"
          ? "OpenChat could not open your photos."
          : "OpenChat could not open your files.",
    );
  }
  return new AttachmentError(
    source === "file" ? "Could not attach that file." : "Could not attach that image.",
  );
}

function fromImagePicker(
  result: ImagePicker.ImagePickerResult,
  existing: Attachment[],
): Attachment[] {
  if (result.canceled) return [];
  checkCount(result.assets.length, existing);
  const pickedAt = Date.now();
  const candidates = result.assets.map((asset, index) => {
    const bytes = asset.base64 ?? "";
    return {
      uri: asset.uri,
      mimeType: asset.mimeType || "image/jpeg",
      // Numbered, so unnamed images picked together stay tellable apart.
      name: asset.fileName || `image-${pickedAt}${index > 0 ? `-${index + 1}` : ""}.jpg`,
      bytes,
      // The picker reports the size of the file on disk, which is the
      // pre-compression size; the payload is what the server receives.
      size: base64ByteLength(bytes),
    };
  });
  checkTotal(candidates, existing);
  return candidates;
}

/** Opens the photo library. Resolves to nothing when the user backs out. */
export async function pickImages(existing: Attachment[] = []): Promise<Attachment[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: IMAGE_QUALITY,
      base64: true,
    });
    return fromImagePicker(result, existing);
  } catch (error) {
    throw friendlyError(error, "image");
  }
}

/** Opens the camera. Resolves to nothing when the user backs out. */
export async function takePhoto(existing: Attachment[] = []): Promise<Attachment[]> {
  // Checked before the camera opens, so a full composer doesn't cost a photo.
  checkCount(1, existing);
  let granted: boolean;
  try {
    granted = (await ImagePicker.requestCameraPermissionsAsync()).granted;
  } catch (error) {
    throw friendlyError(error, "camera");
  }
  if (!granted) {
    throw new AttachmentError("Allow camera access in system settings to take a photo.");
  }
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: IMAGE_QUALITY,
      base64: true,
    });
    return fromImagePicker(result, existing);
  } catch (error) {
    throw friendlyError(error, "camera");
  }
}

/** Opens the system file browser. Resolves to nothing when the user backs out. */
export async function pickFiles(existing: Attachment[] = []): Promise<Attachment[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return [];
    checkCount(result.assets.length, existing);
    const candidates = await Promise.all(result.assets.map(toAttachment));
    checkTotal(candidates, existing);
    return candidates;
  } catch (error) {
    throw friendlyError(error, "file");
  }
}

async function toAttachment(asset: {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}): Promise<Attachment> {
  const name = asset.name || "attachment";
  if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError(
      `${name} is ${formatBytes(asset.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
    );
  }
  const bytes = fromUint8Array(new Uint8Array(await new File(asset.uri).arrayBuffer()));
  return {
    uri: asset.uri,
    mimeType: asset.mimeType || "application/octet-stream",
    name,
    bytes,
    size: asset.size ?? base64ByteLength(bytes),
  };
}
