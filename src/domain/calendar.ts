import { addDays, addMonths, dateOfTimestamp, diffDays } from './dates';
import type { CalendarEvent, ISODate } from './types';

/** Dates (local calendar days) on which an event occurs within [from, to], recurrences expanded. */
export function occurrencesInRange(event: Pick<CalendarEvent, 'starts_at' | 'recurrence'>, from: ISODate, to: ISODate): ISODate[] {
  const start = dateOfTimestamp(event.starts_at);
  if (start > to) return [];
  if (event.recurrence === 'none') return start >= from ? [start] : [];

  const result: ISODate[] = [];
  if (event.recurrence === 'weekly') {
    // jump close to `from` without iterating every week since the start
    const skip = start < from ? Math.floor(diffDays(from, start) / 7) : 0;
    for (let d = addDays(start, skip * 7); d <= to; d = addDays(d, 7)) if (d >= from) result.push(d);
    return result;
  }
  // monthly: same day-of-month (clamped to the month's last day)
  for (let i = 0; i < 1200; i++) {
    const d = addMonths(start, i);
    if (d > to) break;
    if (d >= from) result.push(d);
  }
  return result;
}

export interface UpcomingReminder {
  event: CalendarEvent;
  occursOn: ISODate;
  /** When the reminder should fire (ms since epoch). */
  fireAt: number;
}

/** Reminders that should fire between `now` and `now + horizonMs`. */
export function upcomingReminders(events: readonly CalendarEvent[], now: Date, horizonMs: number): UpcomingReminder[] {
  const today = dateOfTimestamp(now.toISOString());
  const until = addDays(today, 31);
  const result: UpcomingReminder[] = [];
  for (const event of events) {
    if (event.remind_minutes_before === null) continue;
    const time = new Date(event.starts_at);
    for (const day of occurrencesInRange(event, today, until)) {
      const [y, m, d] = day.split('-').map(Number);
      const occurrence = new Date(time);
      occurrence.setFullYear(y!, m! - 1, d!);
      if (event.all_day) occurrence.setHours(9, 0, 0, 0);
      const fireAt = occurrence.getTime() - event.remind_minutes_before * 60_000;
      if (fireAt >= now.getTime() && fireAt <= now.getTime() + horizonMs) result.push({ event, occursOn: day, fireAt });
    }
  }
  return result.sort((a, b) => a.fireAt - b.fireAt);
}
