import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, startOfWeek } from '@/domain/dates';
import { choreCompliance, participationByMember, spendingByCategory, spendingByMonth } from '@/domain/stats';
import type { ChoreAssignment } from '@/domain/types';

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-11-24')).toBe('2026-11-23');
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23'); // Sunday
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23');
  });
  it('adds months clamping the day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', -11)).toBe('2025-12-15');
  });
  it('builds a Monday-first 6-week grid', () => {
    const grid = monthGrid('2026-11-10');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26');
    expect(grid).toContain('2026-11-30');
  });
});

describe('stats', () => {
  const expenses = [
    { id: '1', amount: 1000, spent_on: '2026-11-03', category_id: 'food', paid_by: 'a' },
    { id: '2', amount: 500, spent_on: '2026-11-20', category_id: 'rent', paid_by: 'b' },
    { id: '3', amount: 300, spent_on: '2026-09-01', category_id: 'food', paid_by: 'a' },
    { id: '4', amount: 999, spent_on: '2025-01-01', category_id: null, paid_by: 'a' },
  ];

  it('totals spending per month including empty months', () => {
    expect(spendingByMonth(expenses, '2026-11-24', 3)).toEqual([
      { month: '2026-09', total: 300 },
      { month: '2026-10', total: 0 },
      { month: '2026-11', total: 1500 },
    ]);
  });

  it('totals spending per category, largest first', () => {
    expect(spendingByCategory(expenses.slice(0, 3))).toEqual([
      { categoryId: 'food', total: 1300 },
      { categoryId: 'rent', total: 500 },
    ]);
  });

  it('computes what each member paid versus their share', () => {
    const shares = [
      { expense_id: '1', user_id: 'a', amount: 500 },
      { expense_id: '1', user_id: 'b', amount: 500 },
      { expense_id: '2', user_id: 'a', amount: 250 },
      { expense_id: '2', user_id: 'b', amount: 250 },
    ];
    const p = participationByMember(['a', 'b'], expenses.slice(0, 2), shares);
    expect(p.get('a')).toEqual({ paid: 1000, share: 750 });
    expect(p.get('b')).toEqual({ paid: 500, share: 750 });
  });

  it('measures chore compliance only on due or done assignments', () => {
    const mk = (due: string, status: ChoreAssignment['status'], completed: string | null = null) =>
      ({ due_date: due, status, completed_at: completed }) as ChoreAssignment;
    const c = choreCompliance(
      [
        mk('2026-11-20', 'done', '2026-11-19T10:00:00'),
        mk('2026-11-20', 'done', '2026-11-22T10:00:00'),
        mk('2026-11-21', 'pending'),
        mk('2026-11-30', 'pending'), // not due yet: ignored
        mk('2026-11-21', 'skipped'), // ignored
      ],
      '2026-11-24',
    );
    expect(c).toEqual({ due: 3, done: 2, onTime: 1, rate: 2 / 3 });
  });
});
