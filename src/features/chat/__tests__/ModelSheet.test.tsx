import { act } from "react";
import { render } from "@/src/test-utils/render";
import type { ModelInfo } from "@/src/domain";
import { useModelsStore } from "@/src/stores/models";
import { ModelSheet } from "../ModelSheet";

const catalog: ModelInfo[] = [
  { ref: { provider: "opencode", id: "big-pickle" }, label: "Big Pickle" },
  { ref: { provider: "opencode-go", id: "glm-5.3" }, label: "GLM 5.3" },
];

const refresh = jest.fn();

function setStoreState(state: { models: ModelInfo[]; loading: boolean; error: string | null }) {
  useModelsStore.setState({ ...state, refresh });
}

beforeEach(() => {
  refresh.mockClear();
  setStoreState({ models: catalog, loading: false, error: null });
});

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

  it("marks the active model", async () => {
    const tree = await render(
      <ModelSheet
        visible
        onClose={jest.fn()}
        selected={{ provider: "opencode-go", id: "glm-5.3" }}
        onSelect={jest.fn()}
      />,
    );
    const option = (testID: string) => tree.root.findByProps({ testID });
    expect(option("model-option-opencode-go-glm-5.3").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(option("model-option-opencode-big-pickle").props.accessibilityState).toEqual({
      selected: false,
    });
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
