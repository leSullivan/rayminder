export type TrackableType = "habit" | "task";

export interface Habit {
  id: string;
  name: string;
  type: TrackableType;
  intervalMinutes: number;
  targetRepetitionsPerDay: number;
  expectedDurationMinutes?: number;
  notes?: string;
  createdAt: string;
  dueAt: string;
  lastCompletedAt?: string;
  lastReminderAt?: string;
  archived: boolean;
}

export interface TimerSession {
  id: string;
  habitId: string;
  startedAt: string;
}

export interface CompletionRecord {
  id: string;
  habitId: string;
  completedAt: string;
  durationSeconds: number;
  source: "manual" | "timer";
}

export interface PostponeRecord {
  id: string;
  habitId: string;
  postponedAt: string;
  minutes: number;
}

export interface DailyScoreHabitBreakdown {
  habitId: string;
  name: string;
  repetitions: number;
  repetitionTarget: number;
  repetitionProgress: number;
  durationMinutes: number;
  durationTargetMinutes: number;
  durationProgress: number;
  postpones: number;
  isOverdue: boolean;
  score: number;
}

export interface DailyScore {
  score: number;
  grade: string;
  completedCount: number;
  totalTrackedMinutes: number;
  dueNowCount: number;
  breakdown: DailyScoreHabitBreakdown[];
}

export interface HabitDraft {
  name: string;
  type: TrackableType;
  intervalMinutes: number;
  targetRepetitionsPerDay: number;
  expectedDurationMinutes?: number;
  notes?: string;
}

export interface RayminderPreferences {
  defaultPostponeMinutes: string;
  reminderThrottleMinutes: string;
}
