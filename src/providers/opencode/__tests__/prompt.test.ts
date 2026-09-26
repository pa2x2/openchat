import type { OpenCodeClient } from "../client";
import { prepareRegenerate, regenerate, send } from "../prompt";

function stubClient(failing: { prompt?: boolean } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const record =
    (name: string, result: unknown, fail = false) =>
    async (input: unknown) => {
      calls.push({ name, input });
      if (fail) throw new Error("offline");
      return result;
    };
  const client = {
    session: {
      prompt: record("prompt", { id: "msg_new" }, failing.prompt),
      revert: { stage: record("stage", { files: [] }), clear: record("clear", undefined) },
    },
  } as unknown as OpenCodeClient;
  return { client, calls };
}

it("inlines attachment bytes and skips attachments that resolve to nothing", async () => {
  const { client, calls } = stubClient();
  await send(client, "ses_1", {
    id: "u1",
    text: "look",
    attachments: [
      { uri: "file:///cache/photo.jpg", mimeType: "image/jpeg", name: "photo.jpg", bytes: "QUJD" },
      { uri: "https://example.com/a.pdf", mimeType: "application/pdf", name: "a.pdf" },
      { uri: "", mimeType: "image/png", name: "lost.png" },
    ],
  });
  expect(calls[0].input).toEqual({
    sessionID: "ses_1",
    text: "look",
    files: [
      { uri: "data:image/jpeg;base64,QUJD", name: "photo.jpg" },
      { uri: "https://example.com/a.pdf", name: "a.pdf" },
    ],
  });
});

it("stages a regenerate rollback without reverting files", async () => {
  const { client, calls } = stubClient();
  await prepareRegenerate(client, "ses_1", { id: "msg_old", text: "again" });
  expect(calls).toEqual([
    { name: "stage", input: { sessionID: "ses_1", messageID: "msg_old", files: false } },
  ]);
});

it("drops the staged rollback when the rerun cannot be delivered", async () => {
  const { client, calls } = stubClient({ prompt: true });
  await expect(regenerate(client, "ses_1", { id: "msg_old", text: "again" })).rejects.toThrow(
    "offline",
  );
  expect(calls.map((call) => call.name)).toEqual(["prompt", "clear"]);
});
