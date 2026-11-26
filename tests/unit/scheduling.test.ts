import { describe, expect, it } from 'vitest';
import { addDays } from '@/domain/dates';
import { generateWeekAssignments } from '@/domain/rotation';
import type { Chore } from '@/domain/types';

const anchor = '2026-11-02'; // Monday
const rotation = { member_order: ['ana', 'bruno', 'caro'], anchor_week: anchor };

function chore(id: string, extra: Partial<Chore>): Chore {
  return {
    id,
    apartment_id: 'apt',
    title: id,
    description: null,
    category_id: null,
    frequency: 'weekly',
    due_weekday: 7,
    rotation_offset: 0,
    schedule_days: [],
    rotation_mode: 'weekly',
    fixed_assignee_id: null,
    effort: 2,
    active: true,
    archived_at: null,
    created_by: null,
    created_at: '2026-11-02T12:00:00Z',
    updated_at: '2026-11-02T12:00:00Z',
    ...extra,
  };
}

const week = (c: Chore, n: number, order = rotation) =>
  generateWeekAssignments({ apartmentId: 'apt', weekStart: addDays(anchor, n * 7), chores: [c], rotation: order, existing: [] });

describe('flexible scheduling', () => {
  it('rotates every occurrence for daily chores and continues across weeks (cooking)', () => {
    const cook = chore('cook', { frequency: 'daily', rotation_mode: 'per_occurrence' });
    expect(week(cook, 0).map((a) => a.assignee_id)).toEqual(['ana', 'bruno', 'caro', 'ana', 'bruno', 'caro', 'ana']);
    // Sunday was Ana, so next Monday continues with Bruno
    expect(week(cook, 1)[0]!.assignee_id).toBe('bruno');
  });

  it('supports specific days such as Mon/Wed/Fri (every other day)', () => {
    const clean = chore('clean', { frequency: 'custom_days', schedule_days: [5, 1, 3], rotation_mode: 'per_occurrence' });
    expect(week(clean, 0).map((r) => [r.due_date, r.assignee_id])).toEqual([
      ['2026-11-02', 'ana'],
      ['2026-11-04', 'bruno'],
      ['2026-11-06', 'caro'],
    ]);
    expect(week(clean, 1).map((r) => r.assignee_id)).toEqual(['ana', 'bruno', 'caro']);
  });

  it('keeps one person for the whole week in weekly mode', () => {
    const c = chore('c', { frequency: 'custom_days', schedule_days: [1, 3, 5], rotation_mode: 'weekly', rotation_offset: 1 });
    expect(new Set(week(c, 0).map((r) => r.assignee_id))).toEqual(new Set(['bruno']));
    expect(new Set(week(c, 1).map((r) => r.assignee_id))).toEqual(new Set(['caro']));
  });

  it('assigns a fixed person, falling back to rotation if they left', () => {
    const fixed = chore('plants', { frequency: 'custom_days', schedule_days: [2, 4], rotation_mode: 'fixed', fixed_assignee_id: 'caro' });
    expect(week(fixed, 0).map((r) => r.assignee_id)).toEqual(['caro', 'caro']);
    expect(week(fixed, 0, { ...rotation, member_order: ['ana', 'bruno'] }).every((r) => r.assignee_id === 'ana')).toBe(true);
  });

  it('is fair over time with per-occurrence rotation', () => {
    const cook = chore('cook', { frequency: 'daily', rotation_mode: 'per_occurrence' });
    const counts = new Map<string, number>();
    for (let w = 0; w < 3; w++) for (const a of week(cook, w)) counts.set(a.assignee_id, (counts.get(a.assignee_id) ?? 0) + 1);
    expect([...counts.values()]).toEqual([7, 7, 7]);
  });

  it('treats chores saved before this feature as weekly rotation', () => {
    const legacy = chore('legacy', {}) as Partial<Chore>;
    delete legacy.rotation_mode;
    delete legacy.schedule_days;
    expect(week(legacy as Chore, 0).map((r) => r.assignee_id)).toEqual(['ana']);
  });
});
