import { act, type ReactElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

const mounted: ReactTestRenderer[] = [];

/**
 * Renders inside `act()` and unmounts after the test. Unmounting matters:
 * looping animations such as `Pulse` only stop on unmount, and a tree left
 * mounted keeps the Jest worker alive after the suite finishes.
 */
export async function render(ui: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(ui);
  });
  mounted.push(tree);
  return tree;
}

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});
