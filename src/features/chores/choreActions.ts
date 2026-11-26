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

/** "Delete" keeps history: the chore is archived and its pending turns from this week on are removed. */
export async function archiveChore(repo: Repository, h: Household, chore: Chore) {
  await repo.updateChore(chore.id, { archived_at: new Date().toISOString(), active: false });
  await repo.deletePendingAssignments(h.snap.apartment.id, startOfWeek(todayISO()), { choreId: chore.id, onwards: true });
}
