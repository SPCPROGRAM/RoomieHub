import { describe, expect, it } from 'vitest';
import { computeBalances, formatMoney, parseMoneyInput, splitEqually, suggestSettlements } from '@/domain/money';

const [A, B, C] = ['a', 'b', 'c'];

describe('splitEqually', () => {
  it('splits evenly when divisible', () => {
    expect(splitEqually(90000, [A, B, C]).map((s) => s.amount)).toEqual([30000, 30000, 30000]);
  });

  it('distributes the remainder to the first participants so the sum is exact', () => {
    expect(splitEqually(100000, [A, B, C]).map((s) => s.amount)).toEqual([33334, 33333, 33333]);
    expect(splitEqually(100001, [A, B, C]).map((s) => s.amount)).toEqual([33334, 33334, 33333]);
    expect(splitEqually(1, [A, B, C]).map((s) => s.amount)).toEqual([1, 0, 0]);
  });

  it('always sums exactly for many amounts and group sizes', () => {
    for (let amount = 1; amount < 2000; amount += 7) {
      for (const group of [[A], [A, B], [A, B, C]]) {
        const shares = splitEqually(amount, group);
        expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(amount);
        const values = shares.map((s) => s.amount);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects invalid inputs', () => {
    expect(() => splitEqually(0, [A])).toThrow();
    expect(() => splitEqually(10.5, [A])).toThrow();
    expect(() => splitEqually(10, [])).toThrow();
    expect(() => splitEqually(10, [A, A])).toThrow();
  });
});

describe('balances and settlements', () => {
  const expenses = [
    { id: 'e1', paid_by: A, amount: 100000 },
    { id: 'e2', paid_by: B, amount: 30000 },
  ];
  const shares = [
    ...splitEqually(100000, [A, B, C]).map((s) => ({ expense_id: 'e1', user_id: s.userId, amount: s.amount })),
    ...splitEqually(30000, [A, B, C]).map((s) => ({ expense_id: 'e2', user_id: s.userId, amount: s.amount })),
  ];

  it('computes net balances that sum to zero', () => {
    const balances = computeBalances([A, B, C], expenses, shares, []);
    expect(Object.fromEntries(balances)).toEqual({ a: 56666, b: -13333, c: -43333 });
    expect([...balances.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('suggests transfers that zero every balance', () => {
    const balances = computeBalances([A, B, C], expenses, shares, []);
    const transfers = suggestSettlements(balances);
    expect(transfers).toEqual([
      { from: C, to: A, amount: 43333 },
      { from: B, to: A, amount: 13333 },
    ]);
    const settled = computeBalances(
      [A, B, C],
      expenses,
      shares,
      transfers.map((t) => ({ from_user: t.from, to_user: t.to, amount: t.amount })),
    );
    expect([...settled.values()].every((v) => v === 0)).toBe(true);
  });

  it('settlements move balances without changing spending', () => {
    const balances = computeBalances([A, B], [{ id: 'x', paid_by: A, amount: 1000 }], [
      { expense_id: 'x', user_id: A, amount: 500 },
      { expense_id: 'x', user_id: B, amount: 500 },
    ], [{ from_user: B, to_user: A, amount: 200 }]);
    expect(Object.fromEntries(balances)).toEqual({ a: 300, b: -300 });
  });

  it('returns no transfers when everyone is square', () => {
    expect(suggestSettlements(new Map([[A, 0], [B, 0]]))).toEqual([]);
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['120000', 120000],
    ['120.000', 120000],
    ['120,000', 120000],
    ['$ 1.250.000', 1250000],
    ['1.250.000 COP', 1250000],
    ['7', 7],
  ])('parses %s', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(['', '0', '-500', '12.5', '12,50', 'abc', '1.2.3', '10000000000000'])('rejects %s', (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats COP without decimals', () => {
    const text = formatMoney(1250000, 'COP', 'es-CO').replace(/\s/g, ' ');
    expect(text).toContain('1.250.000');
    expect(text).not.toContain(',00');
  });
});
