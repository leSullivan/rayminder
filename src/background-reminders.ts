import { getPreferenceValues, showHUD, showToast, Toast } from "@raycast/api";
import { completeHabit, listHabits, listSessions, postponeHabit, setHabitLastReminder, startHabitTimer } from "./lib/storage";
import { formatRelativeDue, minutesBetween } from "./lib/time";
import { Habit, RayminderPreferences } from "./lib/types";

function safeInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function shouldNotify(habit: Habit, now: Date, throttleMinutes: number): boolean {
  if (new Date(habit.dueAt).getTime() > now.getTime()) {
    return false;
  }

  if (!habit.lastReminderAt) {
    return true;
  }

  return minutesBetween(habit.lastReminderAt, now) >= throttleMinutes;
}

export default async function Command() {
  try {
    const preferences = getPreferenceValues<RayminderPreferences>();
    const defaultPostponeMinutes = safeInteger(preferences.defaultPostponeMinutes, 15);
    const reminderThrottleMinutes = safeInteger(preferences.reminderThrottleMinutes, 5);

    const now = new Date();
    const [habits, sessions] = await Promise.all([listHabits(false), listSessions()]);
    const runningHabits = new Set(sessions.map((session) => session.habitId));

    const candidate = habits
      .filter((habit) => !runningHabits.has(habit.id))
      .filter((habit) => shouldNotify(habit, now, reminderThrottleMinutes))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

    if (!candidate) {
      return;
    }

    await setHabitLastReminder(candidate.id, now.toISOString());

    const toast = await showToast({
      style: Toast.Style.Failure,
      title: `Overdue: ${candidate.name}`,
      message: `${formatRelativeDue(candidate.dueAt, now)} · choose an action`,
    });

    if (candidate.expectedDurationMinutes && candidate.expectedDurationMinutes > 0) {
      toast.primaryAction = {
        title: "Start Timer",
        onAction: async () => {
          await startHabitTimer(candidate.id);
          await showHUD(`Timer started: ${candidate.name}`);
        },
      };
    } else {
      toast.primaryAction = {
        title: "Mark Complete",
        onAction: async () => {
          await completeHabit(candidate.id, { source: "manual" });
          await showHUD(`Completed: ${candidate.name}`);
        },
      };
    }

    toast.secondaryAction = {
      title: `Postpone ${defaultPostponeMinutes}m`,
      onAction: async () => {
        await postponeHabit(candidate.id, defaultPostponeMinutes);
        await showHUD(`Postponed: ${candidate.name}`);
      },
    };
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Reminder check failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
