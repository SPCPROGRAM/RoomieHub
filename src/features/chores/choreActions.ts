import { startOfWeek, todayISO } from '@/domain/dates';
import { generateWeekAssignments } from '@/domain/rotation';
import type { Chore } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import type { Repository } from '@/services/repository';

/** Active members in rotation order (people who left are never assigned). */
export function activeOrder(h: Household) {
  const active = new Set(h.activeMembers.map((m) => m.user_id));
  return h.snap.rotation.member_order.filter((id) => active.has(id));
}

/**
 * After a chore is created or its schedule changes: drop its PENDING turns from this week on and
 * generate this week again with the new rules. Completed turns and past weeks are never touched.
 */
export async function regenerateFromThisWeek(repo: Repository, h: Household, chore: Chore, opts: { dropPending: boolean }) {
  const week = startOfWeek(todayISO());
  if (opts.dropPending) await repo.deletePendingAssignments(h.snap.apartment.id, week, { choreId: chore.id, onwards: true });
  if (!h.snap.rotation.auto_generate) return;
  const kept = h.snap.assignments.filter((a) => a.chore_id === chore.id && !(a.week_start >= week && a.status === 'pending'));
  const rows = generateWeekAssignments({
    apartmentId: h.snap.apartment.id,
    weekStart: week,
    chores: [chore],
    rotation: { ...h.snap.rotation, member_order: activeOrder(h) },
    existing: opts.dropPending ? kept : h.snap.assignments,
  });
  await repo.insertAssignments(rows);
}

/**
 * Delete a chore. Never completed (e.g. created by mistake) → removed completely, with all its turns.
 * Has completed turns → archived: it disappears from the week, its pending/skipped turns from this
 * week on are removed, and what was done stays in the history and statistics.
 */
export async function archiveChore(repo: Repository, h: Household, chore: Chore): Promise<'deleted' | 'archived'> {
  const hasHistory = h.snap.assignments.some((a) => a.chore_id === chore.id && a.status === 'done');
  if (!hasHistory) {
    await repo.deleteChore(chore.id);
    return 'deleted';
  }
  await repo.updateChore(chore.id, { archived_at: new Date().toISOString(), active: false });
  await repo.deletePendingAssignments(h.snap.apartment.id, startOfWeek(todayISO()), { choreId: chore.id, onwards: true, includeSkipped: true });
  return 'archived';
}

/** Turns worth showing in the week, home and calendar: never those of deleted (archived) chores. */
export function isLiveTurn(a: { chore_id: string }, choreById: ReadonlyMap<string, Pick<Chore, 'archived_at'>>): boolean {
  const c = choreById.get(a.chore_id);
  return c !== undefined && c.archived_at === null;
}
