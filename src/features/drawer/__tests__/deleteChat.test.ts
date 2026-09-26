import { Alert } from "react-native";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { deleteChat } from "../ChatDrawer";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
  useProviderCapabilities: jest.fn(),
}));

const getProviderMock = getProvider as jest.Mock;
const chat = { id: "c1", title: "Plans", updatedAt: 1 };

beforeEach(() => {
  useChatsStore.setState({ chats: [chat] });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("deleteChat", () => {
  it("keeps the chat and says why when the server refuses", async () => {
    getProviderMock.mockResolvedValue({
      deleteChat: jest.fn().mockRejectedValue(new Error("Server unavailable")),
    });
    const onDeleted = jest.fn();

    await deleteChat("c1", onDeleted);

    expect(useChatsStore.getState().chats).toEqual([chat]);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("Could not delete chat", "Server unavailable");
  });

  it("removes the chat once the server has deleted it", async () => {
    getProviderMock.mockResolvedValue({ deleteChat: jest.fn().mockResolvedValue(undefined) });
    const onDeleted = jest.fn();

    await deleteChat("c1", onDeleted);

    expect(useChatsStore.getState().chats).toEqual([]);
    expect(onDeleted).toHaveBeenCalled();
  });
});
