import { addMonths, dateOfTimestamp, monthKey, startOfMonth } from './dates';
import type { ChoreAssignment, Expense, ExpenseShare, ISODate, UUID } from './types';

export interface MonthTotal {
  month: string; // YYYY-MM
  total: number;
}

/** Spending per month for the last `months` months ending at `today` (settlements excluded). */
export function spendingByMonth(expenses: readonly Pick<Expense, 'amount' | 'spent_on'>[], today: ISODate, months = 6): MonthTotal[] {
  const keys = Array.from({ length: months }, (_, i) => monthKey(addMonths(startOfMonth(today), i - months + 1)));
  const totals = new Map(keys.map((k) => [k, 0]));
  for (const e of expenses) {
    const k = monthKey(e.spent_on);
    if (totals.has(k)) totals.set(k, totals.get(k)! + e.amount);
  }
  return keys.map((month) => ({ month, total: totals.get(month)! }));
}

export interface CategoryTotal {
  categoryId: UUID | null;
  total: number;
}

export function spendingByCategory(expenses: readonly Pick<Expense, 'amount' | 'category_id'>[]): CategoryTotal[] {
  const totals = new Map<UUID | null, number>();
  for (const e of expenses) totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.amount);
  return [...totals].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
}

export function expensesInMonth<T extends Pick<Expense, 'spent_on'>>(expenses: readonly T[], month: string): T[] {
  return expenses.filter((e) => monthKey(e.spent_on) === month);
}

/** What each member paid and what their share was, for the given expenses. */
export function participationByMember(
  memberIds: readonly UUID[],
  expenses: readonly Pick<Expense, 'id' | 'amount' | 'paid_by'>[],
  shares: readonly Pick<ExpenseShare, 'expense_id' | 'user_id' | 'amount'>[],
): Map<UUID, { paid: number; share: number }> {
  const ids = new Set(expenses.map((e) => e.id));
  const result = new Map(memberIds.map((id) => [id, { paid: 0, share: 0 }]));
  for (const e of expenses) {
    const row = result.get(e.paid_by);
    if (row) row.paid += e.amount;
  }
  for (const s of shares) {
    if (!ids.has(s.expense_id)) continue;
    const row = result.get(s.user_id);
    if (row) row.share += s.amount;
  }
  return result;
}

export interface Compliance {
  due: number;
  done: number;
  onTime: number;
  rate: number; // 0..1, done / due
}

/** Compliance over assignments whose due date has passed (or that are already done). */
export function choreCompliance(assignments: readonly ChoreAssignment[], today: ISODate): Compliance {
  const relevant = assignments.filter((a) => a.status !== 'skipped' && (a.due_date < today || a.status === 'done'));
  const done = relevant.filter((a) => a.status === 'done');
  const onTime = done.filter((a) => a.completed_at !== null && dateOfTimestamp(a.completed_at) <= a.due_date);
  return {
    due: relevant.length,
    done: done.length,
    onTime: onTime.length,
    rate: relevant.length === 0 ? 0 : done.length / relevant.length,
  };
}
