import { DailyScore, DailyScoreHabitBreakdown, Habit } from "./types";
import { listCompletions, listHabits, listPostpones } from "./storage";
import { startOfDay } from "./time";

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function gradeFromScore(score: number): string {
  if (score >= 95) return "S";
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function habitScoreBreakdown(habit: Habit, now: Date, completions: Map<string, number>, duration: Map<string, number>, postpones: Map<string, number>): DailyScoreHabitBreakdown {
  const repetitionTarget = Math.max(1, habit.targetRepetitionsPerDay);
  const repetitions = completions.get(habit.id) ?? 0;
  const repetitionProgress = clamp(repetitions / repetitionTarget);

  const durationMinutes = duration.get(habit.id) ?? 0;
  const durationTargetMinutes = habit.expectedDurationMinutes
    ? habit.expectedDurationMinutes * repetitionTarget
    : 0;
  const durationProgress = durationTargetMinutes > 0 ? clamp(durationMinutes / durationTargetMinutes) : repetitionProgress;

  const postponeCount = postpones.get(habit.id) ?? 0;
  const isOverdue = new Date(habit.dueAt).getTime() < now.getTime();
  const overdueMinutes = isOverdue ? Math.max(0, (now.getTime() - new Date(habit.dueAt).getTime()) / 60_000) : 0;

  const postponePenalty = Math.min(0.2, postponeCount * 0.05);
  const overduePenalty = Math.min(0.25, overdueMinutes / Math.max(1, habit.intervalMinutes) * 0.15);

  const rawProgress = repetitionProgress * 0.65 + durationProgress * 0.35;
  const score = Math.round(clamp(rawProgress * (1 - postponePenalty - overduePenalty)) * 100);

  return {
    habitId: habit.id,
    name: habit.name,
    repetitions,
    repetitionTarget,
    repetitionProgress,
    durationMinutes,
    durationTargetMinutes,
    durationProgress,
    postpones: postponeCount,
    isOverdue,
    score,
  };
}

export async function computeDailyScore(now = new Date()): Promise<DailyScore> {
  const dayStart = startOfDay(now);
  const [habits, completionRecords, postponeRecords] = await Promise.all([listHabits(false), listCompletions(), listPostpones()]);

  const todayCompletions = completionRecords.filter((entry) => {
    const completed = new Date(entry.completedAt).getTime();
    return completed >= dayStart.getTime() && completed <= now.getTime();
  });

  const todayPostpones = postponeRecords.filter((entry) => {
    const postponed = new Date(entry.postponedAt).getTime();
    return postponed >= dayStart.getTime() && postponed <= now.getTime();
  });

  const repetitionsByHabit = new Map<string, number>();
  const durationByHabit = new Map<string, number>();
  const postponesByHabit = new Map<string, number>();

  for (const completion of todayCompletions) {
    repetitionsByHabit.set(completion.habitId, (repetitionsByHabit.get(completion.habitId) ?? 0) + 1);
    durationByHabit.set(
      completion.habitId,
      (durationByHabit.get(completion.habitId) ?? 0) + completion.durationSeconds / 60,
    );
  }

  for (const postpone of todayPostpones) {
    postponesByHabit.set(postpone.habitId, (postponesByHabit.get(postpone.habitId) ?? 0) + 1);
  }

  const breakdown = habits.map((habit) => habitScoreBreakdown(habit, now, repetitionsByHabit, durationByHabit, postponesByHabit));

  const average = breakdown.length === 0 ? 100 : Math.round(breakdown.reduce((total, item) => total + item.score, 0) / breakdown.length);
  const completedCount = todayCompletions.length;
  const totalTrackedMinutes = Math.round(todayCompletions.reduce((total, item) => total + item.durationSeconds / 60, 0));
  const dueNowCount = habits.filter((habit) => new Date(habit.dueAt).getTime() <= now.getTime()).length;

  return {
    score: average,
    grade: gradeFromScore(average),
    completedCount,
    totalTrackedMinutes,
    dueNowCount,
    breakdown,
  };
}
