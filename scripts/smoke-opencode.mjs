/**
 * Checks a running OpenCode server against the client package the app ships, through the calls
 * the app makes before a model is involved. Typecheck only proves the app compiles against the
 * client; this is what notices a server that rejects the image's opencode.json or speaks a
 * different wire format.
 *
 *   node scripts/smoke-opencode.mjs <base-url> <password> <expected-version>
 */

import { OpenCode } from "@opencode/client";

const [baseUrl, password, expected] = process.argv.slice(2);
if (!baseUrl || !password || !expected) {
  console.error("usage: smoke-opencode.mjs <base-url> <password> <expected-version>");
  process.exit(2);
}

const START_TIMEOUT_MS = 60_000;

const client = OpenCode.make({
  baseUrl,
  headers: { authorization: `Basic ${btoa(`opencode:${password}`)}` },
});

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    try {
      return await client.server.info({ signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

const info = await waitForServer();
if (info.version !== expected) {
  throw new Error(`Server reports version ${info.version}, expected ${expected}`);
}

const title = "smoke test";
const session = await client.session.create({ title });
const listed = await client.session.list({ limit: 100, order: "desc" });
if (!listed.data.some((entry) => entry.id === session.id && entry.title === title)) {
  throw new Error(`Session ${session.id} is missing from the session list`);
}
await client.session.remove({ sessionID: session.id });
await client.model.list();

console.log(`OpenCode ${info.version} answers the client.`);
