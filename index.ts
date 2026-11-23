// A background task can start the app without rendering it, and Expo Router
// only loads `app/` when it renders, so the task is defined here first.
import "./src/features/notifications/scheduledRuns";
import "expo-router/entry";
