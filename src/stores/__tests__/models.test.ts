import { getProvider } from "@/src/lib/providerFactory";
import { createModelsStore, createMemoryStorage, refWithVariant } from "@/src/stores";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
}));

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

it("re-reads the catalog when a change is announced during a read", async () => {
  // A starting server answers with no models, then announces the real list
  // while that first read may still be in flight.
  let answerFirst: (models: never[]) => void = () => undefined;
  const model = { ref: { provider: "opencode", id: "big-pickle" }, label: "Big Pickle" };
  const listModels = jest
    .fn()
    .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
    .mockResolvedValueOnce([model]);
  jest.mocked(getProvider).mockResolvedValue({ listModels } as never);
  const store = createModelsStore(createMemoryStorage());

  const first = store.getState().refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  void store.getState().refresh();
  answerFirst([]);
  await first;

  expect(store.getState().models).toEqual([model]);
  expect(store.getState().loading).toBe(false);
});
