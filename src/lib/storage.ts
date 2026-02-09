import { LocalStorage } from "@raycast/api";
import { CompletionRecord, Habit, HabitDraft, PostponeRecord, TimerSession } from "./types";
import { secondsBetween } from "./time";

const HABITS_KEY = "rayminder_habits_v1";
const SESSIONS_KEY = "rayminder_sessions_v1";
const COMPLETIONS_KEY = "rayminder_completions_v1";
const POSTPONES_KEY = "rayminder_postpones_v1";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readCollection<T>(key: string): Promise<T[]> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) {
    return [];
  }

  try {
    const data = JSON.parse(raw) as T[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeCollection<T>(key: string, data: T[]): Promise<void> {
  await LocalStorage.setItem(key, JSON.stringify(data));
}

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  const filtered = includeArchived ? habits : habits.filter((habit) => !habit.archived);
  return filtered.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export async function getHabit(habitId: string): Promise<Habit | undefined> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  return habits.find((habit) => habit.id === habitId);
}

export async function upsertHabit(draft: HabitDraft, existingId?: string): Promise<Habit> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  const now = new Date().toISOString();

  if (existingId) {
    const index = habits.findIndex((habit) => habit.id === existingId);
    if (index < 0) {
      throw new Error("Habit not found");
    }

    const previous = habits[index];
    const next: Habit = {
      ...previous,
      ...draft,
      expectedDurationMinutes: draft.expectedDurationMinutes,
      notes: draft.notes,
    };
    habits[index] = next;
    await writeCollection(HABITS_KEY, habits);
    return next;
  }

  const habit: Habit = {
    id: uid(),
    name: draft.name,
    type: draft.type,
    intervalMinutes: draft.intervalMinutes,
    targetRepetitionsPerDay: draft.targetRepetitionsPerDay,
    expectedDurationMinutes: draft.expectedDurationMinutes,
    notes: draft.notes,
    createdAt: now,
    dueAt: new Date(Date.now() + draft.intervalMinutes * 60_000).toISOString(),
    archived: false,
  };

  habits.push(habit);
  await writeCollection(HABITS_KEY, habits);
  return habit;
}

export async function archiveHabit(habitId: string): Promise<void> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  const sessions = await readCollection<TimerSession>(SESSIONS_KEY);
  const updated = habits.map((habit) => (habit.id === habitId ? { ...habit, archived: true } : habit));
  const activeSessions = sessions.filter((session) => session.habitId !== habitId);
  await writeCollection(HABITS_KEY, updated);
  await writeCollection(SESSIONS_KEY, activeSessions);
}

export async function listSessions(): Promise<TimerSession[]> {
  return readCollection<TimerSession>(SESSIONS_KEY);
}

export async function listCompletions(): Promise<CompletionRecord[]> {
  return readCollection<CompletionRecord>(COMPLETIONS_KEY);
}

export async function listPostpones(): Promise<PostponeRecord[]> {
  return readCollection<PostponeRecord>(POSTPONES_KEY);
}

export async function startHabitTimer(habitId: string): Promise<TimerSession> {
  const sessions = await readCollection<TimerSession>(SESSIONS_KEY);
  const existing = sessions.find((session) => session.habitId === habitId);
  if (existing) {
    return existing;
  }

  const session: TimerSession = {
    id: uid(),
    habitId,
    startedAt: new Date().toISOString(),
  };

  sessions.push(session);
  await writeCollection(SESSIONS_KEY, sessions);
  return session;
}

export async function stopHabitTimer(habitId: string): Promise<CompletionRecord> {
  const sessions = await readCollection<TimerSession>(SESSIONS_KEY);
  const session = sessions.find((entry) => entry.habitId === habitId);

  if (!session) {
    throw new Error("No active timer for this habit");
  }

  const remaining = sessions.filter((entry) => entry.id !== session.id);
  await writeCollection(SESSIONS_KEY, remaining);

  return completeHabit(habitId, {
    durationSeconds: secondsBetween(session.startedAt, new Date()),
    source: "timer",
  });
}

export async function completeHabit(
  habitId: string,
  options: { durationSeconds?: number; source?: "manual" | "timer" } = {},
): Promise<CompletionRecord> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  const sessions = await readCollection<TimerSession>(SESSIONS_KEY);
  const completions = await readCollection<CompletionRecord>(COMPLETIONS_KEY);

  const index = habits.findIndex((habit) => habit.id === habitId);
  if (index < 0) {
    throw new Error("Habit not found");
  }

  const habit = habits[index];
  const now = new Date();
  const completion: CompletionRecord = {
    id: uid(),
    habitId,
    completedAt: now.toISOString(),
    durationSeconds: Math.max(0, Math.floor(options.durationSeconds ?? 0)),
    source: options.source ?? "manual",
  };

  completions.push(completion);

  habits[index] = {
    ...habit,
    lastCompletedAt: completion.completedAt,
    lastReminderAt: undefined,
    dueAt: new Date(now.getTime() + habit.intervalMinutes * 60_000).toISOString(),
  };

  const remainingSessions = sessions.filter((session) => session.habitId !== habitId);

  await writeCollection(COMPLETIONS_KEY, completions);
  await writeCollection(HABITS_KEY, habits);
  await writeCollection(SESSIONS_KEY, remainingSessions);

  return completion;
}

export async function postponeHabit(habitId: string, minutes: number): Promise<Habit> {
  const safeMinutes = Math.max(1, Math.floor(minutes));
  const habits = await readCollection<Habit>(HABITS_KEY);
  const postpones = await readCollection<PostponeRecord>(POSTPONES_KEY);
  const index = habits.findIndex((habit) => habit.id === habitId);

  if (index < 0) {
    throw new Error("Habit not found");
  }

  const current = habits[index];
  const now = new Date();
  const currentDue = new Date(current.dueAt);
  const baseTime = currentDue.getTime() > now.getTime() ? currentDue.getTime() : now.getTime();
  const nextDueAt = new Date(baseTime + safeMinutes * 60_000).toISOString();

  const postponed: PostponeRecord = {
    id: uid(),
    habitId,
    postponedAt: now.toISOString(),
    minutes: safeMinutes,
  };

  postpones.push(postponed);

  const updated = {
    ...current,
    dueAt: nextDueAt,
    lastReminderAt: undefined,
  };

  habits[index] = updated;
  await writeCollection(HABITS_KEY, habits);
  await writeCollection(POSTPONES_KEY, postpones);

  return updated;
}

export async function setHabitLastReminder(habitId: string, atIso: string): Promise<void> {
  const habits = await readCollection<Habit>(HABITS_KEY);
  const index = habits.findIndex((habit) => habit.id === habitId);
  if (index < 0) {
    return;
  }

  habits[index] = {
    ...habits[index],
    lastReminderAt: atIso,
  };

  await writeCollection(HABITS_KEY, habits);
}
