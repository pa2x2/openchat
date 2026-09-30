import { View } from "react-native";
import type { FormResult } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { Text } from "@/src/ui/Text";

/**
 * A settled form in the reply that asked it: each question with the user's
 * answer, or the questions alone when the form was dismissed. A form still
 * waiting in a reply that is over was never answered either, so it reads as
 * skipped too.
 */
export function FormResultCard({ form }: { form: FormResult }) {
  const answered = form.status === "answered";
  return (
    <View
      className={cn("my-1.5 rounded-[18px] bg-surface px-3.5 py-3", answered ? "gap-2.5" : "gap-1")}
      testID="form-result"
    >
      <View className="flex-row items-center gap-1.5">
        <Icon
          name={answered ? "check-circle-outline" : "debug-step-over"}
          size={15}
          tone="textMuted"
        />
        <Text className="text-[13px] font-medium text-text-muted">
          {answered
            ? "You answered"
            : form.questions.length > 1
              ? "You skipped these questions"
              : "You skipped this question"}
        </Text>
      </View>
      {form.questions.map((question, index) => {
        const answer = form.answers[index]?.join(", ");
        return answered ? (
          <View key={index}>
            <Text className="text-[13.5px] leading-[18px] text-text-muted">{question}</Text>
            <Text
              selectable
              className={cn(
                "mt-px text-[15px] font-medium leading-[21px]",
                answer ? "text-text" : "text-text-faint",
              )}
            >
              {answer || "No answer"}
            </Text>
          </View>
        ) : (
          <Text key={index} className="text-[14px] leading-[19px] text-text-muted">
            {question}
          </Text>
        );
      })}
    </View>
  );
}
