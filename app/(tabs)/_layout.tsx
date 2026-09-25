import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import { Tabs } from "expo-router";

/**
 * Tab bar and per-tab header. No colours are set here on purpose: they come
 * from the navigation theme in `app/_layout.tsx`, which is derived from the
 * same palette as the Tailwind tokens. Setting them per-screen is how they
 * drifted out of sync before.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{}}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarLabel: "Chats",
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialDesignIcons
              color={color}
              name={focused ? "message-text" : "message-text-outline"}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
