import { describe, expect, it } from 'vitest';
import { addDays } from '@/domain/dates';
import {
  cycleIndex,
  detectRepetitions,
  displayStatus,
  generateWeekAssignments,
  nextRotationOffset,
  workloadByMember,
} from '@/domain/rotation';
import type { Chore, ChoreAssignment } from '@/domain/types';

const members = ['ana', 'bruno', 'caro'];
const anchor = '2026-11-02'; // Monday

function chore(id: string, offset: number, extra: Partial<Chore> = {}): Chore {
  return {
    id,
    apartment_id: 'apt',
    title: id,
    description: null,
    category_id: null,
    frequency: 'weekly',
    due_weekday: 7,
    rotation_offset: offset,
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

const chores = [chore('kitchen', 0), chore('bathroom', 1), chore('trash', 2)];
const rotation = { member_order: members, anchor_week: anchor };

function asStored(rows: ReturnType<typeof generateWeekAssignments>, status: ChoreAssignment['status'] = 'pending'): ChoreAssignment[] {
  return rows.map((r, i) => ({
    ...r,
    id: `${r.chore_id}-${r.week_start}-${r.occurrence}-${i}`,
    status,
    completed_at: status === 'done' ? `${r.due_date}T10:00:00Z` : null,
    swapped_at: null,
    created_at: '2026-11-02T12:00:00Z',
  }));
}

function weekOf(weekIndex: number) {
  return generateWeekAssignments({
    apartmentId: 'apt',
    weekStart: addDays(anchor, weekIndex * 7),
    chores,
    rotation,
    existing: [],
  });
}

describe('weekly rotation', () => {
  it('gives each person a different chore in the same week', () => {
    const week = weekOf(0);
    expect(week.map((a) => [a.chore_id, a.assignee_id])).toEqual([
      ['kitchen', 'ana'],
      ['bathroom', 'bruno'],
      ['trash', 'caro'],
    ]);
    expect(week.every((a) => a.due_date === '2026-11-08')).toBe(true);
  });

  it('rotates predictably week after week', () => {
    expect(weekOf(1).map((a) => a.assignee_id)).toEqual(['bruno', 'caro', 'ana']);
    expect(weekOf(2).map((a) => a.assignee_id)).toEqual(['caro', 'ana', 'bruno']);
    expect(weekOf(3).map((a) => a.assignee_id)).toEqual(['ana', 'bruno', 'caro']);
  });

  it('is fair: over n weeks everybody does every chore exactly once', () => {
    const counts = new Map<string, number>();
    for (let w = 0; w < 3; w++) {
      for (const a of weekOf(w)) counts.set(`${a.chore_id}:${a.assignee_id}`, (counts.get(`${a.chore_id}:${a.assignee_id}`) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });

  it('is idempotent and never rewrites existing (historical) assignments', () => {
    const first = asStored(weekOf(0), 'done');
    // the person order changes afterwards (e.g. someone re-ordered the rotation)
    const again = generateWeekAssignments({
      apartmentId: 'apt',
      weekStart: anchor,
      chores,
      rotation: { member_order: ['caro', 'bruno', 'ana'], anchor_week: anchor },
      existing: first,
    });
    expect(again).toEqual([]);
    expect(first.map((a) => a.assignee_id)).toEqual(['ana', 'bruno', 'caro']);
  });

  it('only fills missing occurrences of a partially generated week', () => {
    const partial = asStored(weekOf(0).slice(0, 1));
    const rest = generateWeekAssignments({ apartmentId: 'apt', weekStart: anchor, chores, rotation, existing: partial });
    expect(rest.map((a) => a.chore_id)).toEqual(['bathroom', 'trash']);
  });

  it('accepts any day of the week and normalises to Monday', () => {
    const rows = generateWeekAssignments({ apartmentId: 'apt', weekStart: '2026-11-05', chores, rotation, existing: [] });
    expect(rows[0]!.week_start).toBe(anchor);
  });

  it('creates 7 occurrences for daily chores and 2 for twice-weekly ones, same person all week', () => {
    const rows = generateWeekAssignments({
      apartmentId: 'apt',
      weekStart: anchor,
      chores: [chore('dishes', 0, { frequency: 'daily' }), chore('floor', 1, { frequency: 'twice_weekly' })],
      rotation,
      existing: [],
    });
    const dishes = rows.filter((r) => r.chore_id === 'dishes');
    expect(dishes).toHaveLength(7);
    expect(new Set(dishes.map((d) => d.assignee_id))).toEqual(new Set(['ana']));
    expect(dishes.map((d) => d.due_date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(anchor, i)));
    expect(rows.filter((r) => r.chore_id === 'floor').map((r) => r.due_date)).toEqual(['2026-11-04', '2026-11-08']);
  });

  it('schedules biweekly and monthly chores on their cycle only', () => {
    const bi = chore('windows', 0, { frequency: 'biweekly' });
    const mo = chore('fridge', 0, { frequency: 'monthly' });
    const scheduled = (c: Chore) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((w) => cycleIndex(c, addDays(anchor, w * 7), anchor));
    expect(scheduled(bi)).toEqual([0, null, 1, null, 2, null, 3, null, 4]);
    expect(scheduled(mo)).toEqual([0, null, null, null, 1, null, null, null, 2]);
  });

  it('starts a chore created later at its own first week', () => {
    const late = chore('plants', 0, { created_at: '2026-11-18T09:00:00Z' });
    expect(cycleIndex(late, '2026-11-09', anchor)).toBeNull();
    expect(cycleIndex(late, '2026-11-16', anchor)).toBe(0);
  });

  it('restarts cycles when the anchor is reset', () => {
    const resetAnchor = '2026-11-23';
    const rows = generateWeekAssignments({
      apartmentId: 'apt',
      weekStart: resetAnchor,
      chores,
      rotation: { member_order: members, anchor_week: resetAnchor },
      existing: [],
    });
    expect(rows.map((r) => [r.assignee_id, r.rotation_index])).toEqual([
      ['ana', 0],
      ['bruno', 0],
      ['caro', 0],
    ]);
  });

  it('skips inactive or archived chores and handles an empty member list', () => {
    const rows = generateWeekAssignments({
      apartmentId: 'apt',
      weekStart: anchor,
      chores: [chore('x', 0, { active: false }), chore('y', 0, { archived_at: '2026-11-03T00:00:00Z' })],
      rotation,
      existing: [],
    });
    expect(rows).toEqual([]);
    expect(generateWeekAssignments({ apartmentId: 'apt', weekStart: anchor, chores, rotation: { member_order: [], anchor_week: anchor }, existing: [] })).toEqual([]);
  });

  it('suggests spreading offsets for new chores', () => {
    expect(nextRotationOffset(chores, 3)).toBe(0);
    expect(nextRotationOffset(chores.slice(0, 2), 3)).toBe(2);
    expect(nextRotationOffset([], 0)).toBe(0);
  });
});

describe('repetition detection', () => {
  it('flags a chore that keeps landing on the same person', () => {
    const weeks = [0, 1, 2].flatMap((w) => asStored(weekOf(w)));
    // simulate swaps: Ana took the kitchen three weeks in a row
    for (const a of weeks) if (a.chore_id === 'kitchen') a.assignee_id = 'ana';
    expect(detectRepetitions(weeks, 3)).toEqual([{ choreId: 'kitchen', userId: 'ana', streak: 3 }]);
    expect(detectRepetitions(weeks, 4)).toEqual([]);
  });

  it('does not flag a normal rotation', () => {
    const weeks = [0, 1, 2, 3].flatMap((w) => asStored(weekOf(w)));
    expect(detectRepetitions(weeks, 2)).toEqual([]);
  });
});

describe('workload and status', () => {
  it('sums effort per member', () => {
    const rows = asStored(weekOf(0));
    rows[0]!.status = 'done';
    const load = workloadByMember(rows, chores, members);
    expect(load.get('ana')).toEqual({ assigned: 1, done: 1, effort: 2 });
    expect(load.get('bruno')).toEqual({ assigned: 1, done: 0, effort: 2 });
  });

  it('marks pending assignments past due as overdue', () => {
    expect(displayStatus({ status: 'pending', due_date: '2026-11-01' }, '2026-11-02')).toBe('overdue');
    expect(displayStatus({ status: 'pending', due_date: '2026-11-02' }, '2026-11-02')).toBe('pending');
    expect(displayStatus({ status: 'done', due_date: '2026-11-01' }, '2026-11-02')).toBe('done');
  });
});
