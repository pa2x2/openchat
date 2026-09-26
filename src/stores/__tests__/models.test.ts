import { createModelsStore, createMemoryStorage, refWithVariant } from "@/src/stores";

it("stars a model regardless of variant, and keeps stars when the catalog is cleared", async () => {
  const storage = createMemoryStorage();
  const store = createModelsStore(storage);
  store.getState().toggleFavorite({ provider: "opencode", id: "big-pickle" });
  store.getState().toggleFavorite({ provider: "anthropic", id: "claude-sonnet-5" });
  store.getState().toggleFavorite({ provider: "opencode", id: "big-pickle", variant: "high" });
  store.getState().clear();

  const restarted = createModelsStore(storage);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(restarted.getState().favorites).toEqual(["anthropic/claude-sonnet-5"]);
});

it("drops a variant the model does not offer", () => {
  // The server accepts any variant, so a carried-over one would stick.
  const model = {
    ref: { provider: "opencode", id: "claude-sonnet-5" },
    label: "Claude Sonnet 5",
    variants: [{ id: "high", label: "High" }],
  };
  expect(refWithVariant(model, "high")).toEqual({ ...model.ref, variant: "high" });
  expect(refWithVariant(model, "xhigh")).toEqual(model.ref);
});
