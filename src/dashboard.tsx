import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HabitForm } from "./components/HabitForm";
import { computeDailyScore } from "./lib/score";
import {
  archiveHabit,
  completeHabit,
  listCompletions,
  listHabits,
  listPostpones,
  listSessions,
  postponeHabit,
  startHabitTimer,
  stopHabitTimer,
} from "./lib/storage";
import { formatClock, formatDuration, formatRelativeDue, secondsBetween, startOfDay } from "./lib/time";
import { CompletionRecord, DailyScore, Habit, PostponeRecord, RayminderPreferences, TimerSession } from "./lib/types";

function safeInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function useNowTick(): Date {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return now;
}

export default function DashboardCommand() {
  const preferences = getPreferenceValues<RayminderPreferences>();
  const defaultPostponeMinutes = safeInteger(preferences.defaultPostponeMinutes, 15);

  const [isLoading, setIsLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [sessions, setSessions] = useState<TimerSession[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [postpones, setPostpones] = useState<PostponeRecord[]>([]);
  const [dailyScore, setDailyScore] = useState<DailyScore | null>(null);

  const now = useNowTick();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [habitData, sessionData, completionData, postponeData, score] = await Promise.all([
        listHabits(false),
        listSessions(),
        listCompletions(),
        listPostpones(),
        computeDailyScore(),
      ]);

      setHabits(habitData);
      setSessions(sessionData);
      setCompletions(completionData);
      setPostpones(postponeData);
      setDailyScore(score);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dayStartMs = useMemo(() => startOfDay(now).getTime(), [now]);

  const completionStats = useMemo(() => {
    const byHabit = new Map<string, { count: number; durationSeconds: number }>();
    for (const entry of completions) {
      const completed = new Date(entry.completedAt).getTime();
      if (completed < dayStartMs || completed > now.getTime()) {
        continue;
      }
      const current = byHabit.get(entry.habitId) ?? { count: 0, durationSeconds: 0 };
      byHabit.set(entry.habitId, {
        count: current.count + 1,
        durationSeconds: current.durationSeconds + entry.durationSeconds,
      });
    }
    return byHabit;
  }, [completions, dayStartMs, now]);

  const postponeStats = useMemo(() => {
    const byHabit = new Map<string, number>();
    for (const entry of postpones) {
      const postponed = new Date(entry.postponedAt).getTime();
      if (postponed < dayStartMs || postponed > now.getTime()) {
        continue;
      }
      byHabit.set(entry.habitId, (byHabit.get(entry.habitId) ?? 0) + 1);
    }
    return byHabit;
  }, [postpones, dayStartMs, now]);

  const activeSessionByHabit = useMemo(() => {
    const map = new Map<string, TimerSession>();
    for (const session of sessions) {
      map.set(session.habitId, session);
    }
    return map;
  }, [sessions]);

  const dueHabits = useMemo(() => {
    const nowMs = now.getTime();
    return habits.filter((habit) => new Date(habit.dueAt).getTime() <= nowMs);
  }, [habits, now]);

  const upcomingHabits = useMemo(() => {
    const nowMs = now.getTime();
    return habits.filter((habit) => new Date(habit.dueAt).getTime() > nowMs);
  }, [habits, now]);

  const activeTimerHabits = useMemo(() => {
    return sessions
      .map((session) => {
        const habit = habits.find((item) => item.id === session.habitId);
        return habit ? { session, habit } : undefined;
      })
      .filter((item): item is { session: TimerSession; habit: Habit } => Boolean(item));
  }, [sessions, habits]);

  async function completeNow(habit: Habit, manualOnly = false) {
    try {
      const session = activeSessionByHabit.get(habit.id);
      if (session && !manualOnly) {
        await stopHabitTimer(habit.id);
      } else {
        await completeHabit(habit.id, { source: "manual" });
      }
      await showToast({ style: Toast.Style.Success, title: `${habit.name} completed` });
      await refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to complete habit",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function startTimer(habit: Habit) {
    try {
      await startHabitTimer(habit.id);
      await showToast({ style: Toast.Style.Success, title: `Started timer for ${habit.name}` });
      await refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to start timer",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function stopTimer(habit: Habit) {
    try {
      const completion = await stopHabitTimer(habit.id);
      await showToast({
        style: Toast.Style.Success,
        title: `${habit.name} completed`,
        message: completion.durationSeconds > 0 ? `Tracked ${formatDuration(completion.durationSeconds)}` : undefined,
      });
      await refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to stop timer",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function postponeBy(habit: Habit, minutes: number) {
    try {
      await postponeHabit(habit.id, minutes);
      await showToast({
        style: Toast.Style.Success,
        title: `${habit.name} postponed`,
        message: `Next due in ${minutes}m`,
      });
      await refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to postpone",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function archive(habit: Habit) {
    const confirmed = await confirmAlert({
      title: `Archive ${habit.name}?`,
      message: "Archived habits are hidden and no longer trigger reminders.",
      primaryAction: {
        title: "Archive",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    await archiveHabit(habit.id);
    await showToast({ style: Toast.Style.Success, title: `${habit.name} archived` });
    await refresh();
  }

  function habitMarkdown(habit: Habit): string {
    const stats = completionStats.get(habit.id) ?? { count: 0, durationSeconds: 0 };
    const session = activeSessionByHabit.get(habit.id);
    const postponeCount = postponeStats.get(habit.id) ?? 0;

    const trackedDuration = stats.durationSeconds + (session ? secondsBetween(session.startedAt, now) : 0);
    const durationProgress =
      habit.expectedDurationMinutes && habit.targetRepetitionsPerDay > 0
        ? `${Math.round((trackedDuration / 60 / (habit.expectedDurationMinutes * habit.targetRepetitionsPerDay)) * 100)}%`
        : "n/a";

    return [
      `# ${habit.name}`,
      habit.notes ? `${habit.notes}` : "No notes",
      "",
      `- Type: **${habit.type}**`,
      `- Due: **${formatRelativeDue(habit.dueAt, now)}**`,
      habit.type === "task" ? "- Schedule: **one-time task**" : `- Interval: **every ${habit.intervalMinutes}m**`,
      `- Today repetitions: **${stats.count}/${habit.targetRepetitionsPerDay}**`,
      `- Today tracked time: **${formatDuration(trackedDuration)}**`,
      `- Duration target progress: **${durationProgress}**`,
      `- Postponed today: **${postponeCount}x**`,
      session ? `- Active timer since: **${formatClock(session.startedAt)}**` : "- Active timer: **no**",
    ].join("\n");
  }

  function habitAccessories(habit: Habit): List.Item.Accessory[] {
    const stats = completionStats.get(habit.id) ?? { count: 0, durationSeconds: 0 };
    const session = activeSessionByHabit.get(habit.id);
    const isOverdue = new Date(habit.dueAt).getTime() <= now.getTime();

    const accessories: List.Item.Accessory[] = [
      {
        tag: {
          value: formatRelativeDue(habit.dueAt, now),
          color: isOverdue ? Color.Red : Color.Green,
        },
      },
      { text: `${stats.count}/${habit.targetRepetitionsPerDay} reps` },
    ];

    if (stats.durationSeconds > 0) {
      accessories.push({ text: formatDuration(stats.durationSeconds) });
    }

    if (session) {
      accessories.push({ icon: Icon.Stopwatch, text: formatDuration(secondsBetween(session.startedAt, now)) });
    }

    return accessories;
  }

  function habitActions(habit: Habit): JSX.Element {
    const session = activeSessionByHabit.get(habit.id);

    return (
      <ActionPanel>
        <ActionPanel.Section>
          {session ? (
            <Action title="Stop Timer & Complete" icon={Icon.Stop} onAction={() => stopTimer(habit)} />
          ) : (
            <Action title="Start Timer" icon={Icon.Play} onAction={() => startTimer(habit)} />
          )}
          <Action
            title={session ? "Complete Without Timer" : "Mark Complete"}
            icon={Icon.Checkmark}
            onAction={() => completeNow(habit, true)}
          />
          <Action title={`Postpone ${defaultPostponeMinutes}m`} icon={Icon.Clock} onAction={() => postponeBy(habit, defaultPostponeMinutes)} />
        </ActionPanel.Section>

        <ActionPanel.Section title="Postpone">
          <Action title="Postpone 10m" onAction={() => postponeBy(habit, 10)} />
          <Action title="Postpone 30m" onAction={() => postponeBy(habit, 30)} />
          <Action title="Postpone 60m" onAction={() => postponeBy(habit, 60)} />
        </ActionPanel.Section>

        <ActionPanel.Section title="Manage">
          <Action.Push title="Edit" icon={Icon.Pencil} target={<HabitForm habit={habit} onSaved={refresh} />} />
          <Action.Push title="Add Habit or Task" icon={Icon.Plus} target={<HabitForm onSaved={refresh} />} />
          <Action
            title="Archive"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
            onAction={() => archive(habit)}
          />
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} shortcut={{ modifiers: ["cmd"], key: "r" }} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  const summaryMarkdown = dailyScore
    ? [
        `# Daily Score: ${dailyScore.score}/100 (${dailyScore.grade})`,
        "",
        `- Completed today: **${dailyScore.completedCount}**`,
        `- Tracked time today: **${dailyScore.totalTrackedMinutes}m**`,
        `- Currently due: **${dailyScore.dueNowCount}**`,
        "",
        "## Habit Breakdown",
        ...dailyScore.breakdown
          .sort((a, b) => a.score - b.score)
          .map(
            (item) =>
              `- **${item.name}**: ${item.score}/100 | reps ${item.repetitions}/${item.repetitionTarget} | time ${Math.round(item.durationMinutes)}m${
                item.durationTargetMinutes > 0 ? `/${item.durationTargetMinutes}m` : ""
              } | postpones ${item.postpones}`,
          ),
      ].join("\n")
    : "# Loading score...";

  return (
    <List isShowingDetail isLoading={isLoading} searchBarPlaceholder="Search habits or tasks">
      <List.Section title="Today">
        <List.Item
          id="rayminder-summary"
          icon={Icon.BarChart}
          title={dailyScore ? `Score ${dailyScore.score}/100 (${dailyScore.grade})` : "Daily Score"}
          subtitle={dailyScore ? `${dailyScore.completedCount} completions, ${dailyScore.totalTrackedMinutes}m tracked` : ""}
          accessories={dailyScore ? [{ text: `${dailyScore.dueNowCount} due now` }] : undefined}
          detail={<List.Item.Detail markdown={summaryMarkdown} />}
          actions={
            <ActionPanel>
              <Action.Push title="Add Habit or Task" icon={Icon.Plus} target={<HabitForm onSaved={refresh} />} />
              <Action title="Refresh" onAction={refresh} icon={Icon.ArrowClockwise} />
            </ActionPanel>
          }
        />
      </List.Section>

      {activeTimerHabits.length > 0 && (
        <List.Section title="Active Timers">
          {activeTimerHabits.map(({ habit, session }) => (
            <List.Item
              key={`timer-${habit.id}`}
              id={`timer-${habit.id}`}
              icon={Icon.Stopwatch}
              title={habit.name}
              subtitle={`Running since ${formatClock(session.startedAt)}`}
              accessories={[{ icon: Icon.Stopwatch, text: formatDuration(secondsBetween(session.startedAt, now)) }]}
              detail={<List.Item.Detail markdown={habitMarkdown(habit)} />}
              actions={habitActions(habit)}
            />
          ))}
        </List.Section>
      )}

      <List.Section title={`Due Now (${dueHabits.length})`}>
        {dueHabits.map((habit) => (
          <List.Item
            key={habit.id}
            id={habit.id}
            icon={habit.type === "habit" ? Icon.Repeat : Icon.Checklist}
            title={habit.name}
            subtitle={`${habit.type} · due ${formatClock(habit.dueAt)}`}
            accessories={habitAccessories(habit)}
            detail={<List.Item.Detail markdown={habitMarkdown(habit)} />}
            actions={habitActions(habit)}
          />
        ))}
      </List.Section>

      <List.Section title={`Upcoming (${upcomingHabits.length})`}>
        {upcomingHabits.map((habit) => (
          <List.Item
            key={habit.id}
            id={`upcoming-${habit.id}`}
            icon={habit.type === "habit" ? Icon.Repeat : Icon.Checklist}
            title={habit.name}
            subtitle={`${habit.type} · due ${formatClock(habit.dueAt)}`}
            accessories={habitAccessories(habit)}
            detail={<List.Item.Detail markdown={habitMarkdown(habit)} />}
            actions={habitActions(habit)}
          />
        ))}
      </List.Section>
    </List>
  );
}
