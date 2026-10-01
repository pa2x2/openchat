import type { ModelInfo, ModelVariant } from "@/src/domain";
import { t } from "@/src/i18n";
import type { OpenCodeClient } from "./client";

/**
 * The variant ids OpenCode generates for reasoning models. Each one maps to
 * the upstream provider's effort or thinking setting.
 */
const KNOWN_VARIANTS = [
  "none",
  "thinking",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

function isKnownVariant(id: string): id is (typeof KNOWN_VARIANTS)[number] {
  return (KNOWN_VARIANTS as readonly string[]).includes(id);
}

/** A variant id as a label; ids from custom server config are shown as written. */
export function variantLabel(id: string): string {
  if (isKnownVariant(id)) return t(`models.variant.${id}`);
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Display names keyed by provider id. The names only decorate the picker, so
 * a failed lookup yields none rather than failing the model list.
 */
async function providerNames(client: OpenCodeClient): Promise<Map<string, string>> {
  try {
    const response = await client.provider.list();
    return new Map(response.data.map((provider) => [provider.id, provider.name]));
  } catch {
    return new Map();
  }
}

export async function listModels(client: OpenCodeClient): Promise<ModelInfo[]> {
  const [response, names] = await Promise.all([client.model.list(), providerNames(client)]);
  return response.data
    .filter((model) => model.enabled !== false)
    .filter((model) => model.capabilities?.input?.includes("text") ?? true)
    .map((model) => ({
      ref: { provider: model.providerID, id: model.id },
      label: model.name,
      providerLabel: names.get(model.providerID),
      contextWindow: model.limit?.context,
      variants: (model.variants ?? []).map((variant): ModelVariant => ({
        id: variant.id,
        label: variantLabel(variant.id),
      })),
    }));
}
