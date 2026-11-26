import { addDays, dateOfTimestamp, diffWeeks, startOfWeek } from './dates';
import type { Chore, ChoreAssignment, ChoreFrequency, ISODate, NewAssignment, RotationSettings, UUID } from './types';

/**
 * Weekly rotation
 * ---------------
 * Each chore advances one "cycle" every `interval` weeks (1 for daily/twice-weekly/weekly,
 * 2 for biweekly, 4 for monthly). In cycle k the chore goes to
 *     memberOrder[(chore.rotation_offset + k) mod n]
 * Chores get different offsets, so in a given week the chores are spread across people,
 * and over n cycles everybody does every chore the same number of times (fair and
 * predictable). Cycles are counted from max(rotation anchor, chore's first week), so
 * "resetting" the rotation only moves the anchor. Assignments are stored rows: generating
 * a week only INSERTS missing occurrences and never edits existing or past ones.
 */

export const FREQUENCY_INTERVAL_WEEKS: Record<ChoreFrequency, number> = {
  daily: 1,
  twice_weekly: 1,
  weekly: 1,
  biweekly: 2,
  monthly: 4,
  custom_days: 1,
};

/** ISO weekdays (1 = Monday) on which the occurrences of a chore fall within its week. */
export function occurrenceWeekdays(chore: Pick<Chore, 'frequency' | 'due_weekday'> & { schedule_days?: number[] | null }): number[] {
  switch (chore.frequency) {
    case 'daily':
      return [1, 2, 3, 4, 5, 6, 7];
    case 'twice_weekly':
      return [3, 7];
    case 'custom_days': {
      const days = [...new Set((chore.schedule_days ?? []).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
      return days.length ? days : [chore.due_weekday];
    }
    default:
      return [chore.due_weekday];
  }
}

export function choreFirstWeek(chore: Pick<Chore, 'created_at'>, anchorWeek: ISODate): ISODate {
  const created = startOfWeek(dateOfTimestamp(chore.created_at));
  return created > anchorWeek ? created : anchorWeek;
}

/** Cycle number of a chore in `week`, or null when the chore is not scheduled that week. */
export function cycleIndex(chore: Pick<Chore, 'created_at' | 'frequency'>, weekStart: ISODate, anchorWeek: ISODate): number | null {
  const first = choreFirstWeek(chore, anchorWeek);
  const weeks = diffWeeks(weekStart, first);
  if (weeks < 0) return null;
  const interval = FREQUENCY_INTERVAL_WEEKS[chore.frequency];
  if (weeks % interval !== 0) return null;
  return weeks / interval;
}

export function assigneeFor(memberOrder: readonly UUID[], rotationOffset: number, cycle: number): UUID | null {
  if (memberOrder.length === 0) return null;
  return memberOrder[(rotationOffset + cycle) % memberOrder.length] ?? null;
}

/**
 * Who does occurrence `occurrence` (0-based within the week) of a chore in cycle `cycle`.
 *  - weekly:         the whole cycle goes to one person (index = cycle)
 *  - per_occurrence: every occurrence moves to the next person and the sequence continues across
 *                    weeks (index = cycle × occurrences per week + occurrence)
 *  - fixed:          always the chosen person (falls back to rotation if they left the apartment)
 * Returns the assignee and the rotation index stored with the assignment.
 */
export function assigneeForOccurrence(
  chore: Pick<Chore, 'rotation_offset'> & { rotation_mode?: Chore['rotation_mode'] | null; fixed_assignee_id?: UUID | null },
  memberOrder: readonly UUID[],
  cycle: number,
  occurrence: number,
  occurrencesPerWeek: number,
): { assignee: UUID | null; index: number } {
  const mode = chore.rotation_mode ?? 'weekly';
  if (mode === 'fixed' && chore.fixed_assignee_id && memberOrder.includes(chore.fixed_assignee_id)) {
    return { assignee: chore.fixed_assignee_id, index: cycle };
  }
  const index = mode === 'per_occurrence' ? cycle * occurrencesPerWeek + occurrence : cycle;
  return { assignee: assigneeFor(memberOrder, chore.rotation_offset, index), index };
}

export function isChoreSchedulable(chore: Pick<Chore, 'active' | 'archived_at'>): boolean {
  return chore.active && chore.archived_at === null;
}

/**
 * Assignments that are missing for `weekStart`. Existing rows (any status) are left as they are,
 * so re-running is idempotent and history is never rewritten.
 */
export function generateWeekAssignments(params: {
  apartmentId: UUID;
  weekStart: ISODate;
  chores: readonly Chore[];
  rotation: Pick<RotationSettings, 'member_order' | 'anchor_week'>;
  existing: readonly Pick<ChoreAssignment, 'chore_id' | 'week_start' | 'occurrence'>[];
}): NewAssignment[] {
  const { apartmentId, weekStart, chores, rotation, existing } = params;
  const monday = startOfWeek(weekStart);
  const taken = new Set(existing.filter((a) => a.week_start === monday).map((a) => `${a.chore_id}#${a.occurrence}`));
  const result: NewAssignment[] = [];

  for (const chore of chores) {
    if (!isChoreSchedulable(chore)) continue;
    const cycle = cycleIndex(chore, monday, rotation.anchor_week);
    if (cycle === null) continue;
    const days = occurrenceWeekdays(chore);

    days.forEach((weekday, occurrence) => {
      if (taken.has(`${chore.id}#${occurrence}`)) return;
      const { assignee, index } = assigneeForOccurrence(chore, rotation.member_order, cycle, occurrence, days.length);
      if (!assignee) return;
      result.push({
        apartment_id: apartmentId,
        chore_id: chore.id,
        week_start: monday,
        occurrence,
        rotation_index: index,
        assignee_id: assignee,
        original_assignee_id: assignee,
        due_date: addDays(monday, weekday - 1),
      });
    });
  }
  return result;
}

/** Offset for a newly created chore: continue the spread so the next chore starts with a different person. */
export function nextRotationOffset(chores: readonly Chore[], memberCount: number): number {
  const active = chores.filter(isChoreSchedulable).length;
  return memberCount > 0 ? active % memberCount : 0;
}

export interface Repetition {
  choreId: UUID;
  userId: UUID;
  /** Consecutive most-recent cycles done/assigned to the same person. */
  streak: number;
}

/**
 * Detect chores that keep landing on the same person (e.g. after repeated swaps or when
 * someone left), looking at the latest cycles. Daily/twice-weekly chores are judged by the
 * person who had the first occurrence of each week.
 */
export function detectRepetitions(assignments: readonly ChoreAssignment[], threshold: number): Repetition[] {
  const byChore = new Map<UUID, Map<string, UUID>>();
  for (const a of assignments) {
    if (a.occurrence !== 0 || a.status === 'skipped') continue;
    let weeks = byChore.get(a.chore_id);
    if (!weeks) byChore.set(a.chore_id, (weeks = new Map()));
    weeks.set(a.week_start, a.assignee_id);
  }

  const result: Repetition[] = [];
  for (const [choreId, weeks] of byChore) {
    const ordered = [...weeks.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([, user]) => user);
    const last = ordered[0];
    if (!last) continue;
    let streak = 0;
    for (const user of ordered) {
      if (user !== last) break;
      streak++;
    }
    if (streak >= threshold) result.push({ choreId, userId: last, streak });
  }
  return result;
}

/** Effort points per member over the given assignments (used to show balance of work). */
export function workloadByMember(
  assignments: readonly ChoreAssignment[],
  chores: readonly Pick<Chore, 'id' | 'effort'>[],
  memberIds: readonly UUID[],
): Map<UUID, { assigned: number; done: number; effort: number }> {
  const effort = new Map(chores.map((c) => [c.id, c.effort]));
  const result = new Map(memberIds.map((id) => [id, { assigned: 0, done: 0, effort: 0 }]));
  for (const a of assignments) {
    const row = result.get(a.assignee_id);
    if (!row || a.status === 'skipped') continue;
    row.assigned++;
    row.effort += effort.get(a.chore_id) ?? 1;
    if (a.status === 'done') row.done++;
  }
  return result;
}

export type DisplayStatus = 'pending' | 'done' | 'skipped' | 'overdue';

export function displayStatus(a: Pick<ChoreAssignment, 'status' | 'due_date'>, today: ISODate): DisplayStatus {
  if (a.status === 'pending' && a.due_date < today) return 'overdue';
  return a.status;
}
