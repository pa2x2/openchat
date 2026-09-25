import { Redirect } from "expo-router";

/** The app opens on a fresh chat, like ChatGPT; history lives in the sidebar. */
export default function Index() {
  return <Redirect href="/chat/new" />;
}
