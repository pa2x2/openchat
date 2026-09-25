import { ScrollView, View, Text } from "react-native";
import { useState } from "react";
import { Button, Input, Sheet, Bubble } from "@/src/ui";

/**
 * Dev-only showcase for the design primitives. Kept out of the
 * user-facing navigation (reachable from Settings) and safe to remove
 * once the real screens cover the primitives.
 */
export default function UiDemoScreen() {
  const [input, setInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 gap-6">
        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Button
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button label="Primary" onPress={() => {}} />
            <Button label="Secondary" variant="secondary" onPress={() => {}} />
            <Button label="Danger" variant="danger" onPress={() => {}} />
            <Button label="Ghost" variant="ghost" onPress={() => {}} />
            <Button label="Disabled" disabled />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Input
          </Text>
          <Input
            value={input}
            onChangeText={setInput}
            label="Server URL"
            placeholder="https://opencode.example.com"
          />
          <Input
            value={input}
            onChangeText={setInput}
            label="Password"
            placeholder="••••••••"
            secureTextEntry
          />
          <Input
            value={input}
            onChangeText={setInput}
            label="With error"
            placeholder="Value"
            error="Something went wrong"
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Bubble
          </Text>
          <Bubble role="user" text="Hello from the user bubble." />
          <Bubble role="assistant" text="And this is the assistant reply." status="streaming…" />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Sheet
          </Text>
          <Button
            label="Open bottom sheet"
            variant="secondary"
            onPress={() => setSheetOpen(true)}
          />
          <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Sheet title">
            <Text className="text-base text-text">
              Sheet content. Tap the backdrop or the handle area to dismiss.
            </Text>
          </Sheet>
        </View>
      </ScrollView>
    </View>
  );
}
