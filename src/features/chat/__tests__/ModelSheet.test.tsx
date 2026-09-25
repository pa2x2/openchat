import React, { act } from "react";
import { create } from "react-test-renderer";
import type { ModelInfo } from "@/src/domain";
import { ModelSheet } from "../ModelSheet";

const catalog: ModelInfo[] = [
  { ref: { provider: "opencode", id: "big-pickle" }, label: "Big Pickle" },
  { ref: { provider: "opencode-go", id: "glm-5.3" }, label: "GLM 5.3" },
];

const mockRefresh = jest.fn();

jest.mock("@/src/stores/models", () => {
  const actual = jest.requireActual("@/src/stores/models");
  return {
    ...actual,
    useModelsStore: (selector: (state: object) => unknown) =>
      selector({
        models: (globalThis as { __models?: ModelInfo[] }).__models ?? catalog,
        loading: (globalThis as { __modelsLoading?: boolean }).__modelsLoading ?? false,
        error: (globalThis as { __modelsError?: string | null }).__modelsError ?? null,
        refresh: mockRefresh,
      }),
  };
});

async function render(ui: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ui);
  });
  return tree;
}

function setStoreState(state: { models?: ModelInfo[]; loading?: boolean; error?: string | null }) {
  (globalThis as Record<string, unknown>).__models = state.models;
  (globalThis as Record<string, unknown>).__modelsLoading = state.loading;
  (globalThis as Record<string, unknown>).__modelsError = state.error;
}

beforeEach(() => {
  mockRefresh.mockClear();
  setStoreState({ models: catalog, loading: false, error: null });
});

describe("ModelSheet", () => {
  it("refreshes on open and reports the selected model", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const tree = await render(
      <ModelSheet visible onClose={onClose} selected={null} onSelect={onSelect} />,
    );

    expect(mockRefresh).toHaveBeenCalled();
    const option = tree.root.findByProps({ testID: "model-option-opencode-big-pickle" });
    await act(async () => {
      option.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(catalog[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("marks the active model", async () => {
    const tree = await render(
      <ModelSheet
        visible
        onClose={jest.fn()}
        selected={{ provider: "opencode-go", id: "glm-5.3" }}
        onSelect={jest.fn()}
      />,
    );
    expect(tree.root.findByProps({ testID: "model-selected" })).toBeTruthy();
  });

  it("shows the error with a retry action", async () => {
    setStoreState({ models: [], loading: false, error: "offline" });
    const tree = await render(
      <ModelSheet visible onClose={jest.fn()} selected={null} onSelect={jest.fn()} />,
    );
    expect(tree.root.findByProps({ testID: "model-error" }).props.children).toBe("offline");
    mockRefresh.mockClear();
    tree.root.findByProps({ testID: "model-retry" }).props.onPress();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a loading indicator while the first fetch is in flight", async () => {
    setStoreState({ models: [], loading: true, error: null });
    const tree = await render(
      <ModelSheet visible onClose={jest.fn()} selected={null} onSelect={jest.fn()} />,
    );
    expect(tree.root.findByProps({ testID: "model-loading" })).toBeTruthy();
  });
});
