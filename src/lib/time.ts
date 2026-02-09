export function minutesBetween(start: Date | string, end: Date | string): number {
  const startMs = typeof start === "string" ? new Date(start).getTime() : start.getTime();
  const endMs = typeof end === "string" ? new Date(end).getTime() : end.getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

export function secondsBetween(start: Date | string, end: Date | string): number {
  const startMs = typeof start === "string" ? new Date(start).getTime() : start.getTime();
  const endMs = typeof end === "string" ? new Date(end).getTime() : end.getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

export function startOfDay(date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function formatRelativeDue(dueAtIso: string, now = new Date()): string {
  const due = new Date(dueAtIso);
  const diffMs = due.getTime() - now.getTime();
  const absMinutes = Math.abs(Math.round(diffMs / 60000));

  if (absMinutes < 1) {
    return "now";
  }

  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return diffMs < 0 ? `${label} overdue` : `in ${label}`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
