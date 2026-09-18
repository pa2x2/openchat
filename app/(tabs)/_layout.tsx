import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTintColor: "rgb(var(--oc-text))",
        tabBarActiveTintColor: "rgb(var(--oc-primary))",
        tabBarInactiveTintColor: "rgb(var(--oc-text-muted))",
        tabBarStyle: {
          backgroundColor: "rgb(var(--oc-background))",
          borderTopColor: "rgb(var(--oc-border))",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
        }}
      />
    </Tabs>
  );
}
