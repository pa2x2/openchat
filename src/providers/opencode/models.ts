/**
 * Model listing against the OpenCode V2 API.
 */

import type { ModelInfo, ModelVariant } from "@/src/domain";
import type { OpenCodeClient } from "./client";

/**
 * Labels for the variant ids OpenCode generates for reasoning models. Each
 * one maps to the upstream provider's effort or thinking setting.
 */
const VARIANT_LABELS: Record<string, string> = {
  none: "Off",
  thinking: "On",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** A variant id as a label; ids from custom server config are shown as written. */
export function variantLabel(id: string): string {
  const known = VARIANT_LABELS[id];
  if (known) return known;
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export async function listModels(client: OpenCodeClient): Promise<ModelInfo[]> {
  const response = await client.model.list();
  return response.data
    .filter((model) => model.enabled !== false)
    .filter((model) => model.capabilities?.input?.includes("text") ?? true)
    .map((model) => ({
      ref: { provider: model.providerID, id: model.id },
      label: model.name,
      contextWindow: model.limit?.context,
      variants: (model.variants ?? []).map(
        (variant): ModelVariant => ({
          id: variant.id,
          label: variantLabel(variant.id),
        }),
      ),
    }));
}
