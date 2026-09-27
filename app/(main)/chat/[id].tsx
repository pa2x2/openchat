import { useLocalSearchParams } from "expo-router";
import { ChatScreen, NEW_CHAT } from "@/src/features/chat/ChatScreen";

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = id ?? NEW_CHAT;
  // Keyed by chat so switching conversations starts from clean screen state
  // (draft, staged attachments, banners) instead of carrying it across.
  return <ChatScreen key={chatId} chatId={chatId} />;
}
