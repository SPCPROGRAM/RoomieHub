import type { ISODate } from './types';

// All calendar-date math works on "YYYY-MM-DD" strings interpreted as UTC midnight,
// which avoids daylight-saving and time-zone drift (Colombia has no DST, but users travel).

const DAY_MS = 86_400_000;

export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the user's local time zone. */
export function todayISO(now: Date = new Date()): ISODate {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(d).getTime() + days * DAY_MS));
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: ISODate): number {
  const wd = parseISODate(d).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / DAY_MS);
}

export function diffWeeks(a: ISODate, b: ISODate): number {
  return Math.floor(diffDays(startOfWeek(a), startOfWeek(b)) / 7);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function addMonths(d: ISODate, months: number): ISODate {
  const date = parseISODate(d);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toISODate(target);
}

/** 6×7 grid of dates (Monday-first) covering the month of `d`. */
export function monthGrid(d: ISODate): ISODate[] {
  const first = startOfMonth(d);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekDays(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Local calendar date of an ISO timestamp. */
export function dateOfTimestamp(ts: string): ISODate {
  return todayISO(new Date(ts));
}

export function formatDate(d: ISODate, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(parseISODate(d));
}

export function formatDateTime(ts: string, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(locale, opts).format(new Date(ts));
}

export function formatRelative(ts: string, locale: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(ts).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  return formatDateTime(ts, locale, { dateStyle: 'medium' });
}
