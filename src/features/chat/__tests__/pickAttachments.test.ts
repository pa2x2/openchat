import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { AttachmentError, pickFiles, pickImages } from "../pickAttachments";
import { MAX_ATTACHMENT_BYTES } from "@/src/lib/attachments";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
}));

jest.mock("js-base64", () => ({
  fromUint8Array: jest.fn(() => "RE9D"),
}));

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
const getDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const FileMock = File as unknown as jest.Mock;

const imageAsset = (overrides: Record<string, unknown> = {}) => ({
  uri: "file:///cache/photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  base64: "QUJD",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  FileMock.mockImplementation(() => ({
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
});

describe("pickImages", () => {
  it("maps picked images to attachments with their payload", async () => {
    launch.mockResolvedValue({ canceled: false, assets: [imageAsset()] });

    await expect(pickImages()).resolves.toEqual([
      {
        uri: "file:///cache/photo.jpg",
        mimeType: "image/jpeg",
        name: "photo.jpg",
        bytes: "QUJD",
        size: 3,
      },
    ]);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["images"], base64: true }),
    );
  });

  it("returns nothing when the picker is dismissed", async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImages()).resolves.toEqual([]);
  });

  it("names an image the picker could not name", async () => {
    launch.mockResolvedValue({ canceled: false, assets: [imageAsset({ fileName: null })] });
    const [attachment] = await pickImages();
    expect(attachment?.name).toMatch(/^image-\d+\.jpg$/);
  });

  it("refuses more files than a message may carry", async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [imageAsset(), imageAsset({ fileName: "second.jpg" })],
    });
    const existing = Array.from({ length: 4 }, (_, index) => ({
      uri: "",
      mimeType: "image/jpeg",
      name: `old-${index}.jpg`,
      bytes: "QQ==",
      size: 1,
    }));

    await expect(pickImages(existing)).rejects.toBeInstanceOf(AttachmentError);
    await expect(pickImages(existing)).rejects.toThrow("Up to 5 files per message.");
  });

  it("refuses a batch that would blow the per-message budget", async () => {
    // Six megabytes of payload, twice: over the 10 MB per-message budget.
    const heavy = "A".repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3));
    launch.mockResolvedValue({
      canceled: false,
      assets: [imageAsset({ base64: heavy }), imageAsset({ base64: heavy, fileName: "b.jpg" })],
    });

    await expect(pickImages()).rejects.toThrow("limited to");
  });

  it("explains a picker failure instead of leaking it", async () => {
    launch.mockRejectedValue(new Error("No Activity found to handle Intent"));
    await expect(pickImages()).rejects.toThrow("Could not attach that image.");
  });
});

describe("pickFiles", () => {
  it("reads the picked document and base64-encodes it", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///cache/notes.txt", name: "notes.txt", mimeType: "text/plain", size: 3 },
      ],
    });

    await expect(pickFiles()).resolves.toEqual([
      {
        uri: "file:///cache/notes.txt",
        mimeType: "text/plain",
        name: "notes.txt",
        bytes: "RE9D",
        size: 3,
      },
    ]);
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true, copyToCacheDirectory: true }),
    );
  });

  it("returns nothing when the file browser is dismissed", async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickFiles()).resolves.toEqual([]);
  });

  it("rejects a file above the per-file limit before reading it", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/big.pdf",
          name: "big.pdf",
          mimeType: "application/pdf",
          size: MAX_ATTACHMENT_BYTES + 1,
        },
      ],
    });

    await expect(pickFiles()).rejects.toThrow("big.pdf is 4.0 MB — the limit is 4.0 MB.");
    expect(FileMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic mime type", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/blob", name: "blob", size: 3 }],
    });

    const [attachment] = await pickFiles();
    expect(attachment?.mimeType).toBe("application/octet-stream");
  });
});
