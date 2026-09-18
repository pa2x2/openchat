/**
 * Model listing against the OpenCode V2 API.
 */

import type { ModelInfo } from "@/src/domain";
import type { OpenCodeClient } from "./client";

export async function listModels(client: OpenCodeClient): Promise<ModelInfo[]> {
  const response = await client.model.list();
  return response.data
    .filter((model) => model.enabled !== false)
    .filter((model) => model.capabilities?.input?.includes("text") ?? true)
    .map((model) => ({
      ref: { provider: model.providerID, id: model.id },
      label: model.name,
      contextWindow: model.limit?.context,
    }));
}
