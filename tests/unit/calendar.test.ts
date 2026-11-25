import { describe, expect, it } from 'vitest';
import { occurrencesInRange, upcomingReminders } from '@/domain/calendar';
import type { CalendarEvent } from '@/domain/types';

const ev = (starts_at: string, recurrence: CalendarEvent['recurrence'], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e',
  apartment_id: 'a',
  title: 'x',
  description: null,
  kind: 'event',
  starts_at,
  ends_at: null,
  all_day: false,
  recurrence,
  remind_minutes_before: null,
  amount: null,
  visibility: 'shared',
  created_by: 'u',
  created_at: starts_at,
  ...extra,
});

describe('occurrencesInRange', () => {
  it('returns a single date for one-off events inside the range', () => {
    expect(occurrencesInRange(ev('2026-11-10T15:00:00', 'none'), '2026-11-01', '2026-11-30')).toEqual(['2026-11-10']);
    expect(occurrencesInRange(ev('2026-10-10T15:00:00', 'none'), '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('expands weekly recurrences', () => {
    expect(occurrencesInRange(ev('2026-10-05T08:00:00', 'weekly'), '2026-11-01', '2026-11-20')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });

  it('expands monthly recurrences clamping short months', () => {
    expect(occurrencesInRange(ev('2026-01-31T08:00:00', 'monthly'), '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('does not produce dates before the start', () => {
    expect(occurrencesInRange(ev('2026-11-15T08:00:00', 'weekly'), '2026-11-01', '2026-11-30')).toEqual(['2026-11-15', '2026-11-22', '2026-11-29']);
  });
});

describe('upcomingReminders', () => {
  it('finds reminders due within the horizon', () => {
    const now = new Date('2026-11-24T08:00:00');
    const events = [
      ev('2026-11-24T10:00:00', 'none', { remind_minutes_before: 60 }), // fires 09:00 today
      ev('2026-11-26T10:00:00', 'none', { remind_minutes_before: 60 }), // too far
      ev('2026-11-24T10:00:00', 'none'), // no reminder
    ];
    const r = upcomingReminders(events, now, 6 * 3600_000);
    expect(r).toHaveLength(1);
    expect(new Date(r[0]!.fireAt).getHours()).toBe(9);
  });
});
