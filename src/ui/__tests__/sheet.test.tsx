import { act } from "react";
import { Keyboard, View } from "react-native";
import { render } from "@/src/test-utils/render";
import { Sheet } from "../Sheet";

const body = <View testID="body" />;

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Sheet", () => {
  it("takes the keyboard down on the way down only, not on the way in", async () => {
    // A screen renders its sheets closed, and it can mount while the composer
    // is still typing. Dismissing on mount would drop that keyboard on every
    // mount, which is what the seeded avoiding view exists to prevent.
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const tree = await render(
      <Sheet visible={false} onClose={jest.fn()}>
        {body}
      </Sheet>,
    );
    expect(dismiss).not.toHaveBeenCalled();

    await act(async () => {
      tree.update(
        <Sheet visible onClose={jest.fn()}>
          {body}
        </Sheet>,
      );
    });
    expect(dismiss).not.toHaveBeenCalled();

    await act(async () => {
      tree.update(
        <Sheet visible={false} onClose={jest.fn()}>
          {body}
        </Sheet>,
      );
    });
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
