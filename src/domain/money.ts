import type { Expense, ExpenseShare, Settlement, UUID } from './types';

/** Upper bound accepted for one amount (mirrors the database CHECK). */
export const MAX_AMOUNT = 1_000_000_000_000;

export interface Share {
  userId: UUID;
  amount: number;
}

/**
 * Split an integer amount equally among participants. The remainder (amount mod n) is
 * handed out one unit at a time to the first participants in the given order, so the
 * shares always add up to exactly `amount`. Mirrors public.split_equally() in SQL.
 */
export function splitEqually(amount: number, participants: readonly UUID[]): Share[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError('amount must be a positive integer');
  }
  if (participants.length === 0) throw new RangeError('at least one participant is required');
  if (new Set(participants).size !== participants.length) throw new RangeError('participants must be unique');

  const n = participants.length;
  const base = Math.floor(amount / n);
  const remainder = amount % n;
  return participants.map((userId, i) => ({ userId, amount: base + (i < remainder ? 1 : 0) }));
}

/**
 * Net balance per member. Positive: the household owes them. Negative: they owe.
 * Expenses add to the payer and subtract each participant's share; settlements move
 * money from the payer of the settlement towards the receiver. Settlements are not
 * spending, so they never appear in expense totals.
 */
export function computeBalances(
  memberIds: readonly UUID[],
  expenses: readonly Pick<Expense, 'id' | 'paid_by' | 'amount'>[],
  shares: readonly Pick<ExpenseShare, 'expense_id' | 'user_id' | 'amount'>[],
  settlements: readonly Pick<Settlement, 'from_user' | 'to_user' | 'amount'>[],
): Map<UUID, number> {
  const balances = new Map<UUID, number>(memberIds.map((id) => [id, 0]));
  const add = (id: UUID, delta: number) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const e of expenses) add(e.paid_by, e.amount);
  for (const s of shares) add(s.user_id, -s.amount);
  for (const s of settlements) {
    add(s.from_user, s.amount);
    add(s.to_user, -s.amount);
  }
  return balances;
}

export interface Transfer {
  from: UUID;
  to: UUID;
  amount: number;
}

/**
 * Suggest a minimal-ish set of transfers that brings every balance to zero
 * (greedy: largest debtor pays largest creditor). Deterministic for equal amounts.
 */
export function suggestSettlements(balances: Map<UUID, number>): Transfer[] {
  const debtors = [...balances].filter(([, b]) => b < 0).map(([id, b]) => ({ id, amount: -b }));
  const creditors = [...balances].filter(([, b]) => b > 0).map(([id, b]) => ({ id, amount: b }));
  const order = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);
  debtors.sort(order);
  creditors.sort(order);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.amount, c.amount);
    if (amount > 0) transfers.push({ from: d.id, to: c.id, amount });
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) i++;
    if (c.amount === 0) j++;
  }
  return transfers;
}

/**
 * Parse what a person types as money into whole units. Accepts "120000", "120.000",
 * "120,000", "$ 120.000". Decimals are rejected (COP is handled in whole pesos).
 * Returns null when the input is not a valid positive amount.
 */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s$]|COP/gi, '');
  if (cleaned === '') return null;
  // thousands separators: "." or "," followed by exactly 3 digits
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT) return null;
  return value;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency = 'COP', locale = 'es-CO'): string {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
    formatters.set(key, f);
  }
  return f.format(amount);
}

/** Thousands-grouped number without currency symbol, for inputs. */
export function formatAmountPlain(amount: number, locale = 'es-CO'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
}
