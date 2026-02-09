# Rayminder (Raycast Extension)

Rayminder is a habit/task tracker for Raycast with interval-based overdue reminders, fulfill/postpone actions, timer tracking, and a daily score.

## Features

- Add habits or tasks with a recurrence interval in minutes.
- Mark items complete or postpone from the dashboard.
- Background reminders run every minute and pop up when an item is overdue.
- Optional timer tracking per habit to measure real execution time.
- Daily score with per-habit breakdown from repetitions, tracked time, overdue state, and postpones.

## Commands

- `Habit Dashboard`: Main view for all habits/tasks, timers, and score.
- `Add Habit or Task`: Quick form for creating a trackable item.
- `Background Habit Reminders`: No-view command scheduled every minute.

## Scoring Model

- Repetitions and duration progress are combined per habit.
- Postpones and overdue time lower score.
- The daily score is the average of active habit scores.

## Development

```bash
npm install
npm run dev
```

## Notes

- Data is persisted via Raycast `LocalStorage` under versioned keys.
- Timers are tracked as active sessions and converted to completion records when stopped.
