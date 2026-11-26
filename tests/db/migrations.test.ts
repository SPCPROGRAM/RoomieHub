// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d'; // outsider with their own apartment
const E = '00000000-0000-4000-8000-00000000000e'; // a fourth person trying to join

let t: TestDb;
let apt: string;
let otherApt: string;
let code: string;

async function expectError(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(A, 'ana@example.test', 'Ana');
  await t.createUser(B, 'bruno@example.test', 'Bruno');
  await t.createUser(C, 'caro@example.test', 'Caro');
  await t.createUser(D, 'dani@example.test', 'Dani');
  await t.createUser(E, 'eva@example.test', 'Eva');
}, 60000);

describe('schema & onboarding', () => {
  it('creates a profile for each new auth user', async () => {
    const rows = await t.admin<{ display_name: string }>('select display_name from profiles order by display_name');
    expect(rows.map((r) => r.display_name)).toEqual(['Ana', 'Bruno', 'Caro', 'Dani', 'Eva']);
  });

  it('creates an apartment with owner membership, rotation settings and default categories', async () => {
    const [row] = await t.as<{ id: string }>(A, `select public.create_apartment('Apto 301') as id`);
    apt = row!.id;
    const [other] = await t.as<{ id: string }>(D, `select public.create_apartment('Otro apto') as id`);
    otherApt = other!.id;

    const members = await t.admin('select role from apartment_members where apartment_id = $1', [apt]);
    expect(members).toEqual([{ role: 'owner' }]);
    const [rot] = await t.admin<{ member_order: string[] }>('select member_order from rotation_settings where apartment_id = $1', [apt]);
    expect(rot!.member_order).toEqual([A]);
    const cats = await t.admin('select 1 from categories where apartment_id = $1', [apt]);
    expect(cats.length).toBeGreaterThan(5);
  });

  it('lets members create invitations with a secure 10-char code', async () => {
    const [inv] = await t.as<{ code: string }>(A, `insert into invitations (apartment_id) values ($1) returning code`, [apt]);
    code = inv!.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it('does not let an outsider read the apartment or its invitations', async () => {
    expect(await t.as(D, 'select * from apartments where id = $1', [apt])).toEqual([]);
    expect(await t.as(D, 'select * from invitations where apartment_id = $1', [apt])).toEqual([]);
  });

  it('previews an invitation with only the apartment name and capacity', async () => {
    const [p] = await t.as<{ apartment_name: string; member_count: number; valid: boolean }>(
      B,
      'select * from public.invitation_preview($1)',
      [code.toLowerCase()],
    );
    expect(p).toMatchObject({ apartment_name: 'Apto 301', member_count: 1, valid: true });
  });

  it('lets the other two roomies join and appends them to the rotation', async () => {
    await t.as(B, 'select public.accept_invitation($1)', [code]);
    await t.as(C, 'select public.accept_invitation($1)', [code]);
    const [rot] = await t.admin<{ member_order: string[] }>('select member_order from rotation_settings where apartment_id = $1', [apt]);
    expect(rot!.member_order).toEqual([A, B, C]);
    const visible = await t.as(C, 'select user_id from apartment_members where apartment_id = $1', [apt]);
    expect(visible).toHaveLength(3);
  });

  it('is idempotent for existing members even after the code is used up', async () => {
    const [row] = await t.as<{ id: string }>(B, 'select public.accept_invitation($1) as id', [code]);
    expect(row!.id).toBe(apt);
  });

  it('rejects a used-up invitation and a full apartment', async () => {
    await expectError(t.as(E, 'select public.accept_invitation($1)', [code]), /invitation_invalid/);
    const [inv] = await t.as<{ code: string }>(A, `insert into invitations (apartment_id) values ($1) returning code`, [apt]);
    await expectError(t.as(E, 'select public.accept_invitation($1)', [inv!.code]), /apartment_full/);
  });

  it('forbids tampering with invitation use counts', async () => {
    await expectError(t.as(A, 'update invitations set uses = 0 where apartment_id = $1', [apt]), /permission denied/);
    await t.as(A, 'update invitations set revoked_at = now() where apartment_id = $1', [apt]);
  });

  it('shows roommates each other profiles but hides outsiders', async () => {
    const names = await t.as<{ display_name: string }>(B, 'select display_name from profiles order by 1');
    expect(names.map((n) => n.display_name)).toEqual(['Ana', 'Bruno', 'Caro']);
  });
});

describe('tenant isolation', () => {
  it('blocks an outsider from inserting into another apartment', async () => {
    await expectError(
      t.as(D, `insert into shopping_items (apartment_id, name) values ($1, 'Leche')`, [apt]),
      /row-level security/,
    );
  });

  it('blocks referencing a chore of another apartment through composite keys', async () => {
    const [chore] = await t.as<{ id: string }>(D, `insert into chores (apartment_id, title) values ($1, 'Ajena') returning id`, [otherApt]);
    await expectError(
      t.as(
        A,
        `insert into chore_assignments (apartment_id, chore_id, week_start, rotation_index, assignee_id, original_assignee_id, due_date)
         values ($1, $2, '2026-11-23', 0, $3, $3, '2026-11-29')`,
        [apt, chore!.id, A],
      ),
      /foreign key/,
    );
  });

  it('blocks assigning a non-member', async () => {
    const [chore] = await t.as<{ id: string }>(A, `insert into chores (apartment_id, title) values ($1, 'Baño') returning id`, [apt]);
    await expectError(
      t.as(
        A,
        `insert into chore_assignments (apartment_id, chore_id, week_start, rotation_index, assignee_id, original_assignee_id, due_date)
         values ($1, $2, '2026-11-23', 0, $3, $3, '2026-11-29')`,
        [apt, chore!.id, D],
      ),
      /foreign key/,
    );
  });

  it('does not let clients write to the activity log', async () => {
    await expectError(
      t.as(A, `insert into activity_logs (apartment_id, entity_type, action) values ($1, 'x', 'y')`, [apt]),
      /permission denied/,
    );
  });
});

describe('finances', () => {
  let expenseId: string;

  it('splits an expense exactly with residue distribution', async () => {
    const [row] = await t.as<{ id: string }>(
      A,
      `select public.create_expense($1, 'Mercado', 100000, $2, '2026-11-20', array[$2, $3, $4]::uuid[]) as id`,
      [apt, A, B, C],
    );
    expenseId = row!.id;
    const shares = await t.as<{ user_id: string; amount: string }>(
      B,
      'select user_id, amount from expense_shares where expense_id = $1 order by amount desc, user_id',
      [expenseId],
    );
    expect(shares.map((s) => Number(s.amount))).toEqual([33334, 33333, 33333]);
    expect(shares[0]!.user_id).toBe(A);
  });

  it('rejects shares that do not add up to the expense amount', async () => {
    // shares have no UPDATE policy: a direct edit silently matches no rows
    await t.as(B, `update expense_shares set amount = amount + 1 where expense_id = $1 and user_id = $2`, [expenseId, B]);
    const [s] = await t.admin<{ amount: string }>('select amount from expense_shares where expense_id = $1 and user_id = $2', [expenseId, B]);
    expect(Number(s!.amount)).toBe(33333);
    await expectError(
      t.as(
        A,
        `with e as (insert into expenses (apartment_id, description, amount, paid_by) values ($1, 'Roto', 900, $2) returning id)
         insert into expense_shares (expense_id, apartment_id, user_id, amount) select id, $1, $2, 100 from e`,
        [apt, A],
      ),
      /expense_shares_mismatch/,
    );
  });

  it('computes balances and settles them without counting settlements as spending', async () => {
    const balances = async () =>
      Object.fromEntries(
        (await t.as<{ user_id: string; balance: string }>(A, 'select user_id, balance from member_balances where apartment_id = $1', [apt])).map(
          (r) => [r.user_id, Number(r.balance)],
        ),
      );
    expect(await balances()).toEqual({ [A]: 66666, [B]: -33333, [C]: -33333 });

    await t.as(B, `insert into settlements (apartment_id, from_user, to_user, amount) values ($1, $2, $3, 33333)`, [apt, B, A]);
    await t.as(C, `insert into settlements (apartment_id, from_user, to_user, amount) values ($1, $2, $3, 33333)`, [apt, C, A]);
    expect(await balances()).toEqual({ [A]: 0, [B]: 0, [C]: 0 });

    const [spent] = await t.as<{ total: string }>(A, 'select sum(amount) total from expenses where apartment_id = $1', [apt]);
    expect(Number(spent!.total)).toBe(100000);
  });

  it('re-splits when an expense is updated', async () => {
    await t.as(A, `select public.update_expense($1, 'Mercado', 1000, $2, '2026-11-20', array[$2, $3]::uuid[])`, [expenseId, B, C]);
    const shares = await t.as<{ amount: string }>(A, 'select amount from expense_shares where expense_id = $1', [expenseId]);
    expect(shares.map((s) => Number(s.amount)).sort()).toEqual([500, 500]);
  });

  it('forbids rewriting who created an expense', async () => {
    await expectError(t.as(B, `update expenses set created_by = $2 where id = $1`, [expenseId, B]), /permission denied/);
  });
});

describe('chores', () => {
  let a1: string;
  let a2: string;

  it('syncs assignment status with completions and logs activity', async () => {
    const [chore] = await t.as<{ id: string }>(A, `insert into chores (apartment_id, title) values ($1, 'Cocina') returning id`, [apt]);
    const [chore2] = await t.as<{ id: string }>(A, `insert into chores (apartment_id, title) values ($1, 'Basura') returning id`, [apt]);
    const insert = `insert into chore_assignments (apartment_id, chore_id, week_start, rotation_index, assignee_id, original_assignee_id, due_date)
                    values ($1, $2, '2026-11-23', 0, $3, $3, '2026-11-29') returning id`;
    [{ id: a1 }] = (await t.as<{ id: string }>(A, insert, [apt, chore!.id, A])) as [{ id: string }];
    [{ id: a2 }] = (await t.as<{ id: string }>(A, insert, [apt, chore2!.id, B])) as [{ id: string }];

    await expectError(t.as(A, insert, [apt, chore!.id, A]), /duplicate key/);

    await t.as(B, `insert into chore_completions (apartment_id, assignment_id) values ($1, $2)`, [apt, a2]);
    const [done] = await t.admin<{ status: string }>('select status from chore_assignments where id = $1', [a2]);
    expect(done!.status).toBe('done');

    await t.as(B, `delete from chore_completions where assignment_id = $1`, [a2]);
    const [undone] = await t.admin<{ status: string }>('select status from chore_assignments where id = $1', [a2]);
    expect(undone!.status).toBe('pending');

    const log = await t.as<{ action: string }>(A, `select action from activity_logs where entity_type = 'chore_completion' order by id`);
    expect(log.map((l) => l.action)).toEqual(['completed', 'uncompleted']);
  });

  it('only lets you record your own completions', async () => {
    await expectError(
      t.as(A, `insert into chore_completions (apartment_id, assignment_id, completed_by) values ($1, $2, $3)`, [apt, a2, B]),
      /row-level security/,
    );
  });

  it('swaps two pending assignments of the same week and keeps the original assignee', async () => {
    await t.as(A, 'select public.swap_assignments($1, $2)', [a1, a2]);
    const rows = await t.admin<{ id: string; assignee_id: string; original_assignee_id: string }>(
      'select id, assignee_id, original_assignee_id from chore_assignments where id in ($1, $2)',
      [a1, a2],
    );
    const r1 = rows.find((r) => r.id === a1)!;
    expect(r1.assignee_id).toBe(B);
    expect(r1.original_assignee_id).toBe(A);
    const swaps = await t.as(A, `select 1 from activity_logs where action = 'swapped'`);
    expect(swaps).toHaveLength(2);
  });
});

describe('calendar, maintenance and membership', () => {
  it('hides private events from roommates', async () => {
    await t.as(A, `insert into calendar_events (apartment_id, title, starts_at, visibility) values ($1, 'Médico', now(), 'private')`, [apt]);
    await t.as(A, `insert into calendar_events (apartment_id, title, starts_at) values ($1, 'Pago arriendo', now())`, [apt]);
    expect(await t.as(B, 'select title from calendar_events')).toEqual([{ title: 'Pago arriendo' }]);
    expect(await t.as(A, 'select title from calendar_events')).toHaveLength(2);
  });

  it('tracks maintenance status changes with resolved timestamps and history', async () => {
    const [r] = await t.as<{ id: string }>(B, `insert into maintenance_reports (apartment_id, title) values ($1, 'Fuga en el lavaplatos') returning id`, [apt]);
    await t.as(A, `update maintenance_reports set status = 'resolved', responsible_id = $2 where id = $1`, [r!.id, A]);
    const [row] = await t.admin<{ resolved_at: string | null }>('select resolved_at from maintenance_reports where id = $1', [r!.id]);
    expect(row!.resolved_at).not.toBeNull();
    const [hist] = await t.as<{ action: string; changes: Record<string, { from: unknown; to: unknown }> }>(
      C,
      `select action, changes from activity_logs where entity_id = $1 and action = 'status_changed'`,
      [r!.id],
    );
    expect(hist!.changes.status).toEqual({ from: 'open', to: 'resolved' });
  });

  it('prevents the owner from leaving while others remain, and keeps history when a member leaves', async () => {
    await expectError(t.as(A, 'select public.leave_apartment($1)', [apt]), /owner_must_transfer/);
    await t.as(C, 'select public.leave_apartment($1)', [apt]);
    expect(await t.as(C, 'select * from expenses where apartment_id = $1', [apt])).toEqual([]);
    const [rot] = await t.admin<{ member_order: string[] }>('select member_order from rotation_settings where apartment_id = $1', [apt]);
    expect(rot!.member_order).toEqual([A, B]);
    // shares that reference C still exist: nothing historical was lost
    const shares = await t.admin('select 1 from expense_shares where user_id = $1', [C]);
    expect(shares.length).toBeGreaterThan(0);
  });

  it('only the owner can rename the apartment', async () => {
    await t.as(B, `update apartments set name = 'Hackeado' where id = $1`, [apt]);
    const [row] = await t.admin<{ name: string }>('select name from apartments where id = $1', [apt]);
    expect(row!.name).toBe('Apto 301');
  });

  it('lets the owner delete the apartment and everything in it', async () => {
    await t.as(D, 'delete from apartments where id = $1', [otherApt]);
    expect(await t.admin('select 1 from chores where apartment_id = $1', [otherApt])).toEqual([]);
  });
});

describe('push notifications', () => {
  const ENDPOINT = 'https://push.example.test/abc';

  it('registers a device through the RPC and keeps it private', async () => {
    await t.as(A, 'select public.save_push_subscription($1, $2, $3, $4)', [ENDPOINT, 'p256', 'authkey', 'Android']);
    expect(await t.as(A, 'select endpoint from push_subscriptions')).toEqual([{ endpoint: ENDPOINT }]);
    expect(await t.as(B, 'select endpoint from push_subscriptions')).toEqual([]);
  });

  it('moves a device to the new user when the same phone subscribes again', async () => {
    await t.as(B, 'select public.save_push_subscription($1, $2, $3, null)', [ENDPOINT, 'p256', 'authkey']);
    const [row] = await t.admin<{ user_id: string }>('select user_id from push_subscriptions where endpoint = $1', [ENDPOINT]);
    expect(row!.user_id).toBe(B);
  });

  it('does not allow writing subscriptions or the delivery log directly', async () => {
    await expectError(t.as(A, `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x', 'a', 'b')`, [A]), /permission denied/);
    await expectError(t.as(A, `select * from notification_deliveries`), /permission denied/);
  });

  it('lets each person change their own notification preferences', async () => {
    await t.as(A, 'update profiles set notify_daily = false where id = $1', [A]);
    const [p] = await t.admin<{ notify_daily: boolean; notify_due: boolean }>('select notify_daily, notify_due from profiles where id = $1', [A]);
    expect(p).toEqual({ notify_daily: false, notify_due: true });
  });

  it('never blocks a damage report when the notifier is not configured', async () => {
    const [r] = await t.as<{ id: string }>(B, `insert into maintenance_reports (apartment_id, title) values ($1, 'Grieta') returning id`, [apt]);
    expect(r!.id).toBeTruthy();
  });
});
describe('server role (Edge Functions)', () => {
  it('can read and write what the notifier needs (new projects grant nothing by default)', async () => {
    const [p] = await t.admin<Record<string, boolean>>(`
      select has_table_privilege('service_role', 'public.push_subscriptions', 'select,delete,update') as subs,
             has_table_privilege('service_role', 'public.notification_deliveries', 'select,insert') as deliveries,
             has_table_privilege('service_role', 'public.chore_assignments', 'select') as assignments,
             has_table_privilege('service_role', 'public.profiles', 'select') as profiles`);
    expect(p).toEqual({ subs: true, deliveries: true, assignments: true, profiles: true });
  });
});
