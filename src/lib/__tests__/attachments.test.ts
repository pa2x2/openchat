import {
  MAX_ATTACHMENT_BYTES,
  attachmentUri,
  canResendAttachments,
  formatBytes,
  isImageAttachment,
} from "@/src/lib/attachments";

describe("attachmentUri", () => {
  it("inlines the payload when the attachment carries bytes", () => {
    expect(
      attachmentUri({
        uri: "file:///cache/a.png",
        mimeType: "image/png",
        name: "a.png",
        bytes: "QQ==",
      }),
    ).toBe("data:image/png;base64,QQ==");
  });

  it("uses the uri as-is when there are no bytes", () => {
    expect(
      attachmentUri({ uri: "https://x/a.pdf", mimeType: "application/pdf", name: "a.pdf" }),
    ).toBe("https://x/a.pdf");
  });
});

describe("canResendAttachments", () => {
  it("accepts an empty or fully loaded attachment list", () => {
    expect(canResendAttachments(undefined)).toBe(true);
    expect(canResendAttachments([])).toBe(true);
    expect(
      canResendAttachments([{ uri: "", mimeType: "image/png", name: "a.png", bytes: "QQ==" }]),
    ).toBe(true);
  });

  it("rejects a list where any payload was dropped", () => {
    expect(
      canResendAttachments([
        { uri: "", mimeType: "image/png", name: "a.png", bytes: "QQ==" },
        { uri: "", mimeType: "image/png", name: "b.png" },
      ]),
    ).toBe(false);
  });
});

describe("isImageAttachment", () => {
  it("keys off the mime type", () => {
    expect(isImageAttachment({ uri: "", mimeType: "image/png", name: "a" })).toBe(true);
    expect(isImageAttachment({ uri: "", mimeType: "application/pdf", name: "a" })).toBe(false);
  });
});

describe("formatBytes", () => {
  it("scales the unit and hides unknown sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(undefined)).toBe("");
  });

  it("keeps the per-file limit at 4 MB", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(4 * 1024 * 1024);
  });
});
