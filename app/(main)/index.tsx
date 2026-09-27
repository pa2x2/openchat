import { Redirect } from "expo-router";
import { useSettingsStore } from "@/src/stores/settings";

/** The app opens on a fresh chat, like ChatGPT; history lives in the sidebar. */
export default function Index() {
  const startupChat = useSettingsStore((state) => state.startupChat);
  return (
    <Redirect
      href={{
        pathname: "/chat/[id]",
        params: startupChat === "temporary" ? { id: "new", temporary: "1" } : { id: "new" },
      }}
    />
  );
}
