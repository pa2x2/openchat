import { useChatsStore } from "@/src/stores/chats";
import { heldForUndo, offerBranchUndo, settleBranchUndo, undoBranch } from "../branchUndo";
import { discardTemporaryChat } from "../temporaryChats";

jest.mock("../temporaryChats", () => ({ discardTemporaryChat: jest.fn(() => Promise.resolve()) }));

// Branching leaves the source at once, and leaving a temporary chat deletes
// it: Undo would have nothing to go back to. But once the offer ends, the
// source must still go, or a chat the user chose not to keep stays behind.
it("keeps a temporary source while Undo stands, and deletes it once the offer ends", () => {
  useChatsStore.getState().markTemporary("source");

  offerBranchUndo({ branchId: "branch", sourceId: "source" });
  expect(heldForUndo("source")).toBe(true);
  expect(undoBranch("branch")).toBe("source");
  // The branch goes the way temporary chats do, when its screen is left.
  expect(useChatsStore.getState().temporary.branch).toBe(true);
  expect(discardTemporaryChat).not.toHaveBeenCalled();

  offerBranchUndo({ branchId: "second", sourceId: "source" });
  settleBranchUndo("second");
  expect(heldForUndo("source")).toBe(false);
  expect(discardTemporaryChat).toHaveBeenCalledWith("source");
});
