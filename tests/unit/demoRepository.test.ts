import { beforeEach, describe, expect, it } from 'vitest';
import { DemoRepository } from '@/services/demoRepository';
import { createDemoDB, DEMO_APARTMENT_ID, DEMO_USERS } from '@/services/demoSeed';
import { computeBalances } from '@/domain/money';

const [V, M, S] = DEMO_USERS.map((u) => u.id) as [string, string, string];

describe('demo seed', () => {
  const db = createDemoDB(new Date('2026-11-24T12:00:00'));

  it('is clearly labelled as demo data', () => {
    expect(db.apartments[0]!.name).toMatch(/demo/i);
    expect(db.profiles.every((p) => p.display_name.includes('(demo)'))).toBe(true);
  });

  it('has consistent shares for every expense', () => {
    for (const e of db.expenses) {
      const sum = db.shares.filter((s) => s.expense_id === e.id).reduce((a, s) => a + s.amount, 0);
      expect(sum).toBe(e.amount);
    }
  });

  it('settles past months so balances only reflect the current month', () => {
    const balances = computeBalances([V, M, S], db.expenses, db.shares, db.settlements);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('DemoRepository', () => {
  let repo: DemoRepository;
  beforeEach(() => {
    repo = new DemoRepository(localStorage);
    repo.reset();
    repo.signInAs(V);
  });

  it('rejects data access for other apartments', async () => {
    await expect(repo.loadSnapshot('00000000-0000-4000-8000-000000000000')).rejects.toThrow('forbidden');
  });

  it('keeps assignment status in sync with completions', async () => {
    const snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    const pending = snap.assignments.find((a) => a.status === 'pending')!;
    await repo.completeAssignment(DEMO_APARTMENT_ID, pending.id, null);
    let after = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    expect(after.assignments.find((a) => a.id === pending.id)!.status).toBe('done');
    expect(after.activity[0]!.action).toBe('completed');
    await repo.uncompleteAssignment(pending.id);
    after = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    expect(after.assignments.find((a) => a.id === pending.id)!.status).toBe('pending');
  });

  it('enforces swap rules', async () => {
    const snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    const week = snap.assignments.find((a) => a.status === 'pending')!.week_start;
    const pending = snap.assignments.filter((a) => a.week_start === week && a.status === 'pending' && a.occurrence === 0);
    const a = pending[0]!;
    const b = pending.find((x) => x.assignee_id !== a.assignee_id)!;
    await repo.swapAssignments(a.id, b.id);
    const after = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    expect(after.assignments.find((x) => x.id === a.id)!.assignee_id).toBe(b.assignee_id);
    expect(after.assignments.find((x) => x.id === a.id)!.original_assignee_id).toBe(a.original_assignee_id);
    const done = after.assignments.find((x) => x.status === 'done')!;
    await expect(repo.swapAssignments(done.id, a.id)).rejects.toThrow();
  });

  it('only lets the creator delete a settlement', async () => {
    repo.signInAs(M);
    await repo.createSettlement(DEMO_APARTMENT_ID, { from_user: M, to_user: V, amount: 1000, settled_on: '2026-11-24', note: null });
    const snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    const mine = snap.settlements.find((s) => s.amount === 1000)!;
    repo.signInAs(S);
    await expect(repo.deleteSettlement(mine.id)).rejects.toThrow('forbidden');
  });

  it('runs the invitation flow with capacity limits', async () => {
    const id = await repo.createApartment('Nuevo', 'COP');
    const inv = await repo.createInvitation(id, { days: 7, maxUses: 2 });
    expect(await repo.previewInvitation(inv.code)).toMatchObject({ apartment_name: 'Nuevo', member_count: 1, valid: true });
    repo.signInAs(M);
    await repo.acceptInvitation(inv.code);
    repo.signInAs(S);
    await repo.acceptInvitation(inv.code);
    const snap = await repo.loadSnapshot(id);
    expect(snap.rotation.member_order).toEqual([V, M, S]);
    await expect(repo.acceptInvitation(inv.code)).resolves.toBe(id); // already a member: idempotent
  });
});
