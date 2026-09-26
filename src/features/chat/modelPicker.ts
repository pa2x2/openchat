/**
 * Model picker logic, kept apart from the sheet so it can be tested without
 * rendering: grouping the catalog by provider, ordering favorites first, and
 * searching across every provider.
 */

import type { ModelInfo } from "@/src/domain";
import { modelKey } from "@/src/stores/models";

export interface ProviderGroup {
  id: string;
  /** Display name: the backend's provider label, else the id. */
  label: string;
  models: ModelInfo[];
}

function favoritesFirst(models: ModelInfo[], favorites: ReadonlySet<string>): ModelInfo[] {
  const starred = models.filter((model) => favorites.has(modelKey(model.ref)));
  const rest = models.filter((model) => !favorites.has(modelKey(model.ref)));
  return [...starred, ...rest];
}

/**
 * The catalog grouped by provider, in the order each provider first appears,
 * with starred models first inside each group.
 */
export function groupByProvider(
  models: ModelInfo[],
  favorites: ReadonlySet<string>,
): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const model of models) {
    const id = model.ref.provider;
    let group = groups.get(id);
    if (!group) {
      group = { id, label: id, models: [] };
      groups.set(id, group);
    }
    if (group.label === id && model.providerLabel) group.label = model.providerLabel;
    group.models.push(model);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    models: favoritesFirst(group.models, favorites),
  }));
}

/** Starred models that are still in the catalog, in the order they were starred. */
export function favoriteModels(models: ModelInfo[], favorites: readonly string[]): ModelInfo[] {
  const byKey = new Map(models.map((model) => [modelKey(model.ref), model]));
  return favorites.flatMap((key) => byKey.get(key) ?? []);
}

/**
 * Groups narrowed to models matching every word of `query` in their label,
 * id or provider name. Groups left empty are dropped.
 */
export function searchGroups(groups: ProviderGroup[], query: string): ProviderGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => {
        const haystack = `${model.label} ${model.ref.id} ${group.label}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((group) => group.models.length > 0);
}

/**
 * One or two letters standing in for a provider in the rail, e.g.
 * "OpenCode Zen" → "OZ", "opencode-go" → "OG", "Anthropic" → "A".
 */
export function monogram(label: string): string {
  const words = label.split(/[\s\-_/.]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
