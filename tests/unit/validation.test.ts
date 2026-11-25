import { describe, expect, it } from 'vitest';
import {
  eventSchema,
  expenseSchema,
  joinSchema,
  registerSchema,
  settlementSchema,
  shoppingSchema,
} from '@/domain/schemas';

const firstError = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.error?.issues[0]?.message;

describe('registerSchema', () => {
  const valid = { displayName: 'Ana', email: 'ana@example.com', password: 'casa1234', confirm: 'casa1234' };

  it('accepts a valid sign-up', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a strong enough password and matching confirmation', () => {
    expect(firstError(registerSchema.safeParse({ ...valid, password: 'short1', confirm: 'short1' }))).toBe('validation.passwordLength');
    expect(firstError(registerSchema.safeParse({ ...valid, password: 'onlyletters', confirm: 'onlyletters' }))).toBe('validation.passwordDigits');
    expect(firstError(registerSchema.safeParse({ ...valid, confirm: 'other1234' }))).toBe('validation.passwordMatch');
  });

  it('validates email and name', () => {
    expect(firstError(registerSchema.safeParse({ ...valid, email: 'nope' }))).toBe('validation.email');
    expect(firstError(registerSchema.safeParse({ ...valid, displayName: '   ' }))).toBe('validation.required');
  });
});

describe('expenseSchema', () => {
  const valid = {
    description: 'Mercado',
    amount: '120.000',
    paidBy: 'a',
    spentOn: '2026-11-20',
    categoryId: '',
    participants: ['a', 'b', 'c'],
    notes: '',
    maintenanceReportId: '',
  };

  it('accepts a valid expense', () => {
    expect(expenseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid amounts, missing participants and dates', () => {
    expect(firstError(expenseSchema.safeParse({ ...valid, amount: '0' }))).toBe('validation.amount');
    expect(firstError(expenseSchema.safeParse({ ...valid, amount: '12,5' }))).toBe('validation.amount');
    expect(firstError(expenseSchema.safeParse({ ...valid, amount: '' }))).toBe('validation.required');
    expect(firstError(expenseSchema.safeParse({ ...valid, participants: [] }))).toBe('validation.participants');
    expect(firstError(expenseSchema.safeParse({ ...valid, spentOn: '20/11/2026' }))).toBe('validation.date');
  });
});

describe('settlementSchema', () => {
  it('rejects paying yourself', () => {
    const r = settlementSchema.safeParse({ fromUser: 'a', toUser: 'a', amount: '1000', settledOn: '2026-11-20', note: '' });
    expect(firstError(r)).toBe('validation.sameMember');
  });
});

describe('eventSchema', () => {
  const base = {
    title: 'Pago arriendo',
    description: '',
    kind: 'payment' as const,
    date: '2026-12-01',
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    recurrence: 'monthly' as const,
    remind: '60',
    amount: '1.800.000',
    visibility: 'shared' as const,
  };
  it('accepts a timed event', () => {
    expect(eventSchema.safeParse(base).success).toBe(true);
  });
  it('requires end after start', () => {
    expect(firstError(eventSchema.safeParse({ ...base, endTime: '08:00' }))).toBe('validation.endAfterStart');
  });
  it('requires a start time unless all-day', () => {
    expect(firstError(eventSchema.safeParse({ ...base, startTime: '' }))).toBe('validation.time');
    expect(eventSchema.safeParse({ ...base, startTime: '', endTime: '', allDay: true }).success).toBe(true);
  });
});

describe('shoppingSchema', () => {
  const base = { name: 'Leche', quantity: '2', unit: 'L', categoryId: '', assignedTo: '', estimatedPrice: '', notes: '' };
  it('accepts decimal quantities with comma or dot', () => {
    expect(shoppingSchema.safeParse({ ...base, quantity: '1,5' }).success).toBe(true);
    expect(shoppingSchema.safeParse({ ...base, quantity: '0.25' }).success).toBe(true);
  });
  it('rejects zero or absurd quantities', () => {
    expect(firstError(shoppingSchema.safeParse({ ...base, quantity: '0' }))).toBe('validation.quantity');
    expect(firstError(shoppingSchema.safeParse({ ...base, quantity: '10000' }))).toBe('validation.quantity');
  });
});

describe('joinSchema', () => {
  it('normalises codes typed by people', () => {
    expect(joinSchema.parse({ code: 'abcd-efgh 23' }).code).toBe('ABCDEFGH23');
  });
  it('rejects codes of the wrong length', () => {
    expect(joinSchema.safeParse({ code: 'ABC' }).success).toBe(false);
  });
});
