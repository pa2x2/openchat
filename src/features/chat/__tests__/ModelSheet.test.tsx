import { act } from "react";
import { render } from "@/src/test-utils/render";
import type { ModelInfo } from "@/src/domain";
import { useModelsStore } from "@/src/stores/models";
import { ModelSheet } from "../ModelSheet";

const catalog: ModelInfo[] = [
  {
    ref: { provider: "opencode", id: "big-pickle" },
    label: "Big Pickle",
    providerLabel: "OpenCode Zen",
  },
  { ref: { provider: "opencode-go", id: "glm-5.3" }, label: "GLM 5.3", providerLabel: "Go" },
  { ref: { provider: "opencode-go", id: "kimi-k2.5" }, label: "Kimi K2.5", providerLabel: "Go" },
];

const refresh = jest.fn();

function setStoreState(state: {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  favorites?: string[];
}) {
  useModelsStore.setState({ favorites: [], ...state, refresh });
}

beforeEach(() => {
  refresh.mockClear();
  setStoreState({ models: catalog, loading: false, error: null });
});

const optionIds = (tree: Awaited<ReturnType<typeof render>>) =>
  tree.root
    .findAll((node) => String(node.props.testID).startsWith("model-option-"))
    .map((node) => node.props.testID as string)
    // Composite and host nodes both carry the testID.
    .filter((id, index, all) => all.indexOf(id) === index);

describe("ModelSheet", () => {
  it("refreshes on open and reports the selected model", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const tree = await render(
      <ModelSheet visible onClose={onClose} selected={null} onSelect={onSelect} />,
    );

    expect(refresh).toHaveBeenCalled();
    const option = tree.root.findByProps({ testID: "model-option-opencode-big-pickle" });
    await act(async () => {
      option.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(catalog[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("opens on the selected model's provider and marks the model", async () => {
    const tree = await render(
      <ModelSheet
        visible
        onClose={jest.fn()}
        selected={{ provider: "opencode-go", id: "glm-5.3" }}
        onSelect={jest.fn()}
      />,
    );
    expect(optionIds(tree)).toEqual([
      "model-option-opencode-go-glm-5.3",
      "model-option-opencode-go-kimi-k2.5",
    ]);
    expect(
      tree.root.findByProps({ testID: "model-option-opencode-go-glm-5.3" }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  });

  it("searches every provider and parks the rail while searching", async () => {
    const tree = await render(
      <ModelSheet
        visible
        onClose={jest.fn()}
        selected={{ provider: "opencode-go", id: "glm-5.3" }}
        onSelect={jest.fn()}
      />,
    );
    await act(async () => {
      tree.root.findByProps({ testID: "model-search" }).props.onChangeText("i");
    });
    // "i" hits Big Pickle (OpenCode Zen) and Kimi (Go), across two providers.
    expect(optionIds(tree)).toEqual([
      "model-option-opencode-big-pickle",
      "model-option-opencode-go-kimi-k2.5",
    ]);
    expect(
      tree.root.findByProps({ testID: "model-provider-opencode" }).props.accessibilityState,
    ).toEqual({ selected: false, disabled: true });
  });

  it("stars a model without selecting it, and lists it under Favorites", async () => {
    const onSelect = jest.fn();
    const tree = await render(
      <ModelSheet visible onClose={jest.fn()} selected={null} onSelect={onSelect} />,
    );
    await act(async () => {
      tree.root.findByProps({ testID: "model-favorite-opencode-big-pickle" }).props.onPress();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(useModelsStore.getState().favorites).toEqual(["opencode/big-pickle"]);

    await act(async () => {
      tree.root.findByProps({ testID: "model-provider-favorites" }).props.onPress();
    });
    expect(optionIds(tree)).toEqual(["model-option-opencode-big-pickle"]);
  });

  it("shows the error with a retry action", async () => {
    setStoreState({ models: [], loading: false, error: "offline" });
    const tree = await render(
      <ModelSheet visible onClose={jest.fn()} selected={null} onSelect={jest.fn()} />,
    );
    expect(tree.root.findByProps({ testID: "model-error" }).props.children).toBe("offline");
    refresh.mockClear();
    tree.root.findByProps({ testID: "model-retry" }).props.onPress();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a loading indicator while the first fetch is in flight", async () => {
    setStoreState({ models: [], loading: true, error: null });
    const tree = await render(
      <ModelSheet visible onClose={jest.fn()} selected={null} onSelect={jest.fn()} />,
    );
    expect(tree.root.findByProps({ testID: "model-loading" })).toBeTruthy();
  });
});
