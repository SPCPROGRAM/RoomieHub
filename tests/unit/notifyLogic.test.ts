import { describe, expect, it } from 'vitest';
import { buildDailyDigest, buildDamageNotice, buildDueReminder, dedupeKey, localDate } from '../../supabase/functions/notify/logic';

const today = '2026-11-26';
const items = [
  { assignee_id: 'ana', chore_title: 'Limpiar baño', due_date: today },
  { assignee_id: 'ana', chore_title: 'Sacar basura', due_date: '2026-11-25' },
  { assignee_id: 'bruno', chore_title: 'Cocina', due_date: '2026-11-28' }, // not due yet
  { assignee_id: 'caro', chore_title: 'Muy vieja', due_date: '2026-11-10' }, // older than 6 days
];
const people = [
  { user_id: 'ana', locale: 'es' as const },
  { user_id: 'bruno', locale: 'es' as const },
  { user_id: 'caro', locale: 'en' as const },
];

describe('notification messages', () => {
  it('uses the Colombian calendar date', () => {
    // 03:00 UTC on the 27th is still the 26th in Bogotá (UTC-5)
    expect(localDate(new Date('2026-11-27T03:00:00Z'))).toBe('2026-11-26');
  });

  it('daily digest: only people with something due today or recently overdue', () => {
    const m = buildDailyDigest(items, people, today);
    expect([...m.keys()]).toEqual(['ana']);
    expect(m.get('ana')).toMatchObject({ title: 'Hoy te toca', body: 'Limpiar baño · Atrasadas: Sacar basura', url: '/chores' });
  });

  it('evening reminder: only chores due today', () => {
    const m = buildDueReminder(items, people, today);
    expect(m.get('ana')?.body).toBe('Antes de terminar el día: Limpiar baño');
    expect(m.has('bruno')).toBe(false);
  });

  it('damage notice goes to everyone except the reporter, in their language', () => {
    const m = buildDamageNotice({ id: 'r1', title: 'Fuga', reported_by: 'ana', priority: 'urgent' }, 'Ana', people);
    expect([...m.keys()]).toEqual(['bruno', 'caro']);
    expect(m.get('bruno')).toMatchObject({ title: 'Daño importante reportado', body: 'Ana: Fuga', url: '/maintenance' });
    expect(m.get('caro')?.title).toBe('Important damage reported');
  });

  it('summarises long lists', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ assignee_id: 'ana', chore_title: `T${i}`, due_date: today }));
    expect(buildDueReminder(many, people, today).get('ana')?.body).toBe('Antes de terminar el día: T0, T1, T2, T3 y 2 más');
  });

  it('builds stable dedupe keys', () => {
    expect(dedupeKey('daily', today)).toBe('daily:2026-11-26');
  });
});
