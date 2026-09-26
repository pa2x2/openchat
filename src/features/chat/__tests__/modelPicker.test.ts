import type { ModelInfo } from "@/src/domain";
import { groupByProvider, searchGroups } from "../modelPicker";

const model = (provider: string, id: string, label: string, providerLabel?: string): ModelInfo => ({
  ref: { provider, id },
  label,
  providerLabel,
});

const catalog: ModelInfo[] = [
  model("opencode", "big-pickle", "Big Pickle", "OpenCode Zen"),
  model("anthropic", "claude-sonnet-5", "Claude Sonnet 5", "Anthropic"),
  model("opencode", "gpt-5.5", "GPT-5.5", "OpenCode Zen"),
  model("anthropic", "claude-opus-5-5", "Claude Opus 5.5", "Anthropic"),
  model("local", "llama", "Llama"),
];

const ids = (models: ModelInfo[]) => models.map((each) => each.ref.id);

describe("groupByProvider", () => {
  it("lifts starred models to the top of their provider only", () => {
    const groups = groupByProvider(catalog, new Set(["anthropic/claude-opus-5-5"]));
    expect(ids(groups[1].models)).toEqual(["claude-opus-5-5", "claude-sonnet-5"]);
    // A star on one provider must not reorder another.
    expect(ids(groups[0].models)).toEqual(["big-pickle", "gpt-5.5"]);
  });
});

describe("searchGroups", () => {
  const groups = groupByProvider(catalog, new Set());

  it("matches every word across label, id and provider name", () => {
    const result = searchGroups(groups, "  opus ANTHROPIC ");
    expect(result.map((group) => [group.id, ids(group.models)])).toEqual([
      ["anthropic", ["claude-opus-5-5"]],
    ]);
    // "zen" is only in the provider name; "5.5" matches an id in another group.
    expect(ids(searchGroups(groups, "zen 5.5")[0].models)).toEqual(["gpt-5.5"]);
  });

  it("drops providers with no match, and returns nothing for a miss", () => {
    expect(searchGroups(groups, "claude").map((group) => group.id)).toEqual(["anthropic"]);
    expect(searchGroups(groups, "claude pickle")).toEqual([]);
  });
});
