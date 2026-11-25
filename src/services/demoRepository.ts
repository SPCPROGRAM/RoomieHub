/**
 * Demo backend: fictitious household kept in localStorage of THIS browser only.
 * It reproduces the server rules (equal split, completion sync, activity log, invitations)
 * so the whole app can be explored without a Supabase project. Nothing here is sent anywhere.
 */
import { startOfWeek, todayISO } from '@/domain/dates';
import { splitEqually } from '@/domain/money';
import type { ActivityLog, Apartment, Category, Invitation, Member, Snapshot, UUID } from '@/domain/types';
import { newId, newInviteCode } from '@/lib/id';
import { createDemoDB, DEMO_USERS, type DemoDB } from './demoSeed';
import { AppError } from './errors';
import type { Repository, SessionUser } from './repository';

const DB_KEY = 'rh.demo.db';
const SESSION_KEY = 'rh.demo.session';

const nowIso = () => new Date().toISOString();

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  private db: DemoDB;
  private authListeners = new Set<(u: SessionUser | null, e: string) => void>();
  private dataListeners = new Set<() => void>();
  private photos = new Map<string, string>();

  constructor(private readonly storage: Storage = window.localStorage) {
    this.db = this.load();
  }

  // ---------------------------------------------------------------- persistence
  private load(): DemoDB {
    try {
      const raw = this.storage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDB;
        if (parsed.version === 1) return parsed;
      }
    } catch {
      // corrupted demo data: start over
    }
    const fresh = createDemoDB();
    this.storage.setItem(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }

  private commit() {
    try {
      this.storage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch {
      throw new AppError('storage_full');
    }
    this.dataListeners.forEach((l) => l());
  }

  /** Restore the original demo household. */
  reset() {
    this.db = createDemoDB();
    this.commit();
  }

  private uid(): UUID {
    const id = this.storage.getItem(SESSION_KEY);
    if (!id) throw new AppError('not_authenticated');
    return id;
  }

  private requireMember(apartmentId: UUID) {
    const me = this.uid();
    if (!this.db.members.some((m) => m.apartment_id === apartmentId && m.user_id === me && m.left_at === null)) {
      throw new AppError('forbidden');
    }
  }

  private log(apartmentId: UUID, entity_type: string, entity_id: UUID | null, action: string, summary: string | null, changes: ActivityLog['changes'] = null) {
    this.db.activity.push({
      id: this.db.nextActivityId++,
      apartment_id: apartmentId,
      actor_id: this.storage.getItem(SESSION_KEY),
      entity_type,
      entity_id,
      action,
      summary,
      changes,
      created_at: nowIso(),
    });
  }

  private diff<T extends object>(before: T, patch: Partial<T>): ActivityLog['changes'] {
    const changes: NonNullable<ActivityLog['changes']> = {};
    for (const [k, to] of Object.entries(patch)) {
      const from = (before as Record<string, unknown>)[k];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    }
    return Object.keys(changes).length ? changes : null;
  }

  private find<T extends { id: UUID }>(rows: T[], id: UUID): T {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new AppError('not_found');
    return row;
  }

  // ---------------------------------------------------------------- auth
  /** Demo "sign in": pick one of the three fictitious roomies. */
  signInAs(userId: UUID) {
    this.storage.setItem(SESSION_KEY, userId);
    const user = DEMO_USERS.find((u) => u.id === userId);
    this.authListeners.forEach((l) => l({ id: userId, email: user?.email ?? null }, 'SIGNED_IN'));
  }

  async getSession(): Promise<SessionUser | null> {
    const id = this.storage.getItem(SESSION_KEY);
    if (!id) return null;
    return { id, email: DEMO_USERS.find((u) => u.id === id)?.email ?? null };
  }

  onAuthChange(cb: (user: SessionUser | null, event: string) => void) {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  async signUp(): Promise<{ needsConfirmation: boolean }> {
    throw new AppError('demo_readonly_auth');
  }
  async signIn(): Promise<void> {
    throw new AppError('demo_readonly_auth');
  }
  async signOut() {
    this.storage.removeItem(SESSION_KEY);
    this.authListeners.forEach((l) => l(null, 'SIGNED_OUT'));
  }
  async requestPasswordReset() {
    throw new AppError('demo_readonly_auth');
  }
  async updatePassword() {
    throw new AppError('demo_readonly_auth');
  }

  // ---------------------------------------------------------------- profile
  async getProfile(userId: UUID) {
    return this.db.profiles.find((p) => p.id === userId) ?? null;
  }
  async updateProfile(userId: UUID, patch: Parameters<Repository['updateProfile']>[1]) {
    if (userId !== this.uid()) throw new AppError('forbidden');
    const p = this.find(this.db.profiles, userId);
    Object.assign(p, patch, { updated_at: nowIso() });
    this.commit();
  }

  // ---------------------------------------------------------------- apartments
  async listMyApartments(userId: UUID): Promise<Apartment[]> {
    const ids = new Set(this.db.members.filter((m) => m.user_id === userId && m.left_at === null).map((m) => m.apartment_id));
    return this.db.apartments.filter((a) => ids.has(a.id));
  }

  async createApartment(name: string, currency: string): Promise<UUID> {
    const me = this.uid();
    const id = newId();
    const ts = nowIso();
    this.db.apartments.push({ id, name, currency, timezone: 'America/Bogota', max_members: 3, created_by: me, created_at: ts, updated_at: ts });
    this.db.members.push({ apartment_id: id, user_id: me, role: 'owner', joined_at: ts, left_at: null });
    this.db.rotation.push({
      apartment_id: id,
      member_order: [me],
      anchor_week: startOfWeek(todayISO()),
      auto_generate: true,
      repetition_threshold: 3,
      last_generated_week: null,
      updated_at: ts,
    });
    const defaults: [Category['scope'], string, Category['color']][] = [
      ['chore', 'Limpieza', 'teal'],
      ['expense', 'Arriendo', 'violet'],
      ['expense', 'Servicios', 'sky'],
      ['expense', 'Mercado', 'teal'],
      ['expense', 'Otros', 'slate'],
      ['shopping', 'Despensa', 'amber'],
    ];
    for (const [scope, cname, color] of defaults) this.db.categories.push({ id: newId(), apartment_id: id, scope, name: cname, color, created_at: ts });
    this.log(id, 'apartment', id, 'created', name);
    this.commit();
    return id;
  }

  async updateApartment(id: UUID, patch: Parameters<Repository['updateApartment']>[1]) {
    const me = this.uid();
    if (!this.db.members.some((m) => m.apartment_id === id && m.user_id === me && m.role === 'owner')) throw new AppError('forbidden');
    Object.assign(this.find(this.db.apartments, id), patch, { updated_at: nowIso() });
    this.commit();
  }

  async deleteApartment(id: UUID) {
    const me = this.uid();
    if (!this.db.members.some((m) => m.apartment_id === id && m.user_id === me && m.role === 'owner')) throw new AppError('forbidden');
    const keep = <T extends { apartment_id: UUID }>(rows: T[]) => rows.filter((r) => r.apartment_id !== id);
    this.db.apartments = this.db.apartments.filter((a) => a.id !== id);
    this.db.members = keep(this.db.members);
    this.db.invitations = keep(this.db.invitations);
    this.db.categories = keep(this.db.categories);
    this.db.rotation = keep(this.db.rotation);
    this.db.chores = keep(this.db.chores);
    this.db.assignments = keep(this.db.assignments);
    this.db.completions = keep(this.db.completions);
    this.db.expenses = keep(this.db.expenses);
    this.db.shares = keep(this.db.shares);
    this.db.settlements = keep(this.db.settlements);
    this.db.events = keep(this.db.events);
    this.db.shopping = keep(this.db.shopping);
    this.db.reports = keep(this.db.reports);
    this.db.activity = keep(this.db.activity);
    this.commit();
  }

  async previewInvitation(code: string) {
    const inv = this.db.invitations.find((i) => i.code === code.trim().toUpperCase());
    if (!inv) return null;
    const apt = this.find(this.db.apartments, inv.apartment_id);
    return {
      apartment_name: apt.name,
      member_count: this.db.members.filter((m) => m.apartment_id === apt.id && m.left_at === null).length,
      max_members: apt.max_members,
      expires_at: inv.expires_at,
      valid: inv.revoked_at === null && inv.expires_at > nowIso() && inv.uses < inv.max_uses,
    };
  }

  async acceptInvitation(code: string): Promise<UUID> {
    const me = this.uid();
    const inv = this.db.invitations.find((i) => i.code === code.trim().toUpperCase());
    if (!inv) throw new AppError('invitation_not_found');
    const existing = this.db.members.find((m) => m.apartment_id === inv.apartment_id && m.user_id === me);
    if (existing && existing.left_at === null) return inv.apartment_id;
    if (inv.revoked_at || inv.expires_at <= nowIso() || inv.uses >= inv.max_uses) throw new AppError('invitation_invalid');
    const apt = this.find(this.db.apartments, inv.apartment_id);
    if (this.db.members.filter((m) => m.apartment_id === apt.id && m.left_at === null).length >= apt.max_members) throw new AppError('apartment_full');
    if (existing) Object.assign(existing, { left_at: null, role: 'member', joined_at: nowIso() });
    else this.db.members.push({ apartment_id: apt.id, user_id: me, role: 'member', joined_at: nowIso(), left_at: null });
    inv.uses++;
    const rot = this.db.rotation.find((r) => r.apartment_id === apt.id);
    if (rot) rot.member_order = [...rot.member_order.filter((x) => x !== me), me];
    this.log(apt.id, 'member', me, 'joined', this.db.profiles.find((p) => p.id === me)?.display_name ?? null);
    this.commit();
    return apt.id;
  }

  async createInvitation(apartmentId: UUID, opts: { days: number; maxUses: number }): Promise<Invitation> {
    this.requireMember(apartmentId);
    const inv: Invitation = {
      id: newId(),
      apartment_id: apartmentId,
      code: newInviteCode(),
      created_by: this.uid(),
      expires_at: new Date(Date.now() + opts.days * 86_400_000).toISOString(),
      max_uses: opts.maxUses,
      uses: 0,
      revoked_at: null,
      created_at: nowIso(),
    };
    this.db.invitations.push(inv);
    this.commit();
    return inv;
  }

  async revokeInvitation(id: UUID) {
    const inv = this.find(this.db.invitations, id);
    this.requireMember(inv.apartment_id);
    inv.revoked_at = nowIso();
    this.commit();
  }

  async leaveApartment(apartmentId: UUID) {
    const me = this.uid();
    const mem = this.db.members.find((m) => m.apartment_id === apartmentId && m.user_id === me && m.left_at === null);
    if (!mem) throw new AppError('not_a_member');
    const others = this.db.members.filter((m) => m.apartment_id === apartmentId && m.user_id !== me && m.left_at === null);
    if (mem.role === 'owner' && others.length > 0) throw new AppError('owner_must_transfer');
    mem.left_at = nowIso();
    const rot = this.db.rotation.find((r) => r.apartment_id === apartmentId);
    if (rot) rot.member_order = rot.member_order.filter((x) => x !== me);
    this.commit();
  }

  async removeMember(apartmentId: UUID, userId: UUID) {
    const me = this.uid();
    if (!this.db.members.some((m) => m.apartment_id === apartmentId && m.user_id === me && m.role === 'owner')) throw new AppError('forbidden');
    if (userId === me) throw new AppError('cannot_remove_self');
    const mem = this.db.members.find((m) => m.apartment_id === apartmentId && m.user_id === userId && m.left_at === null);
    if (mem) mem.left_at = nowIso();
    const rot = this.db.rotation.find((r) => r.apartment_id === apartmentId);
    if (rot) rot.member_order = rot.member_order.filter((x) => x !== userId);
    this.log(apartmentId, 'member', userId, 'removed', this.db.profiles.find((p) => p.id === userId)?.display_name ?? null);
    this.commit();
  }

  async transferOwnership(apartmentId: UUID, userId: UUID) {
    const me = this.uid();
    const mine = this.db.members.find((m) => m.apartment_id === apartmentId && m.user_id === me && m.role === 'owner');
    const target = this.db.members.find((m) => m.apartment_id === apartmentId && m.user_id === userId && m.left_at === null);
    if (!mine) throw new AppError('forbidden');
    if (!target) throw new AppError('not_a_member');
    mine.role = 'member';
    target.role = 'owner';
    this.commit();
  }

  async loadSnapshot(apartmentId: UUID): Promise<Snapshot> {
    this.requireMember(apartmentId);
    const me = this.uid();
    const of = <T extends { apartment_id: UUID }>(rows: T[]) => structuredClone(rows.filter((r) => r.apartment_id === apartmentId));
    const members: Member[] = of(this.db.members)
      .sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1))
      .map((m) => {
        const p = this.db.profiles.find((x) => x.id === m.user_id)!;
        return { ...m, profile: { id: p.id, display_name: p.display_name, avatar_color: p.avatar_color } };
      });
    const now = nowIso();
    return {
      apartment: structuredClone(this.find(this.db.apartments, apartmentId)),
      members,
      invitations: of(this.db.invitations).filter((i) => !i.revoked_at && i.expires_at > now).reverse(),
      categories: of(this.db.categories).sort((a, b) => a.name.localeCompare(b.name)),
      rotation: structuredClone(this.db.rotation.find((r) => r.apartment_id === apartmentId)!),
      chores: of(this.db.chores),
      assignments: of(this.db.assignments).sort((a, b) => (a.week_start < b.week_start ? 1 : -1)),
      completions: of(this.db.completions),
      expenses: of(this.db.expenses).sort((a, b) => (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0)),
      shares: of(this.db.shares),
      settlements: of(this.db.settlements).sort((a, b) => (a.settled_on < b.settled_on ? 1 : -1)),
      events: of(this.db.events).filter((e) => e.visibility === 'shared' || e.created_by === me).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)),
      shopping: of(this.db.shopping).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      reports: of(this.db.reports).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      activity: of(this.db.activity).sort((a, b) => b.id - a.id).slice(0, 300),
      fetchedAt: now,
    };
  }

  subscribe(_apartmentId: UUID, onChange: () => void) {
    this.dataListeners.add(onChange);
    return () => this.dataListeners.delete(onChange);
  }

  // ---------------------------------------------------------------- categories
  async createCategory(apartmentId: UUID, input: Pick<Category, 'scope' | 'name' | 'color'>) {
    this.requireMember(apartmentId);
    if (this.db.categories.some((c) => c.apartment_id === apartmentId && c.scope === input.scope && c.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError('duplicate');
    }
    const c: Category = { id: newId(), apartment_id: apartmentId, ...input, created_at: nowIso() };
    this.db.categories.push(c);
    this.commit();
    return c;
  }
  async updateCategory(id: UUID, patch: Partial<Pick<Category, 'name' | 'color'>>) {
    const c = this.find(this.db.categories, id);
    this.requireMember(c.apartment_id);
    Object.assign(c, patch);
    this.commit();
  }
  async deleteCategory(id: UUID) {
    const c = this.find(this.db.categories, id);
    this.requireMember(c.apartment_id);
    this.db.categories = this.db.categories.filter((x) => x.id !== id);
    for (const row of [...this.db.chores, ...this.db.expenses, ...this.db.shopping]) if (row.category_id === id) row.category_id = null;
    this.commit();
  }

  // ---------------------------------------------------------------- chores
  async createChore(apartmentId: UUID, input: Parameters<Repository['createChore']>[1]) {
    this.requireMember(apartmentId);
    const ts = nowIso();
    const chore = {
      id: newId(),
      apartment_id: apartmentId,
      rotation_offset: 0,
      active: true,
      ...input,
      archived_at: null,
      created_by: this.uid(),
      created_at: ts,
      updated_at: ts,
    };
    this.db.chores.push(chore);
    this.log(apartmentId, 'chore', chore.id, 'created', chore.title);
    this.commit();
    return structuredClone(chore);
  }

  async updateChore(id: UUID, patch: Parameters<Repository['updateChore']>[1]) {
    const c = this.find(this.db.chores, id);
    this.requireMember(c.apartment_id);
    const changes = this.diff(c, patch);
    Object.assign(c, patch, { updated_at: nowIso() });
    if (changes) this.log(c.apartment_id, 'chore', id, 'updated', c.title, changes);
    this.commit();
  }

  async updateRotation(apartmentId: UUID, patch: Parameters<Repository['updateRotation']>[1]) {
    this.requireMember(apartmentId);
    const r = this.db.rotation.find((x) => x.apartment_id === apartmentId);
    if (!r) throw new AppError('not_found');
    Object.assign(r, patch, { updated_at: nowIso() });
    this.commit();
  }

  async insertAssignments(rows: Parameters<Repository['insertAssignments']>[0]) {
    for (const r of rows) {
      this.requireMember(r.apartment_id);
      const exists = this.db.assignments.some((a) => a.chore_id === r.chore_id && a.week_start === r.week_start && a.occurrence === r.occurrence);
      if (exists) continue; // same as ON CONFLICT DO NOTHING
      this.db.assignments.push({ ...r, id: newId(), status: 'pending', completed_at: null, swapped_at: null, created_at: nowIso() });
    }
    this.commit();
  }

  async deletePendingAssignments(apartmentId: UUID, weekStart: string, opts: { choreId?: UUID; onwards?: boolean } = {}) {
    this.requireMember(apartmentId);
    const matches = (a: (typeof this.db.assignments)[number]) =>
      a.apartment_id === apartmentId &&
      a.status === 'pending' &&
      (opts.onwards ? a.week_start >= weekStart : a.week_start === weekStart) &&
      (!opts.choreId || a.chore_id === opts.choreId);
    this.db.assignments = this.db.assignments.filter((a) => !matches(a));
    this.commit();
  }

  async completeAssignment(apartmentId: UUID, assignmentId: UUID, note: string | null) {
    this.requireMember(apartmentId);
    const a = this.find(this.db.assignments, assignmentId);
    if (this.db.completions.some((c) => c.assignment_id === assignmentId)) throw new AppError('duplicate');
    const ts = nowIso();
    this.db.completions.push({ id: newId(), apartment_id: apartmentId, assignment_id: assignmentId, completed_by: this.uid(), completed_at: ts, note });
    a.status = 'done';
    a.completed_at = ts;
    this.log(apartmentId, 'chore_completion', assignmentId, 'completed', this.db.chores.find((c) => c.id === a.chore_id)?.title ?? null);
    this.commit();
  }

  async uncompleteAssignment(assignmentId: UUID) {
    const a = this.find(this.db.assignments, assignmentId);
    this.requireMember(a.apartment_id);
    this.db.completions = this.db.completions.filter((c) => c.assignment_id !== assignmentId);
    a.status = 'pending';
    a.completed_at = null;
    this.log(a.apartment_id, 'chore_completion', assignmentId, 'uncompleted', this.db.chores.find((c) => c.id === a.chore_id)?.title ?? null);
    this.commit();
  }

  async setAssignmentSkipped(assignmentId: UUID, skipped: boolean) {
    const a = this.find(this.db.assignments, assignmentId);
    this.requireMember(a.apartment_id);
    if (a.status === 'done') return;
    a.status = skipped ? 'skipped' : 'pending';
    this.commit();
  }

  async swapAssignments(aId: UUID, bId: UUID) {
    const a = this.find(this.db.assignments, aId);
    const b = this.find(this.db.assignments, bId);
    this.requireMember(a.apartment_id);
    if (a.apartment_id !== b.apartment_id || a.week_start !== b.week_start) throw new AppError('swap_requires_same_week');
    if (a.status !== 'pending' || b.status !== 'pending') throw new AppError('swap_requires_pending');
    if (a.assignee_id === b.assignee_id) throw new AppError('swap_same_person');
    const ts = nowIso();
    const title = (x: typeof a) => this.db.chores.find((c) => c.id === x.chore_id)?.title ?? null;
    this.log(a.apartment_id, 'chore_assignment', a.id, 'swapped', title(a), { assignee_id: { from: a.assignee_id, to: b.assignee_id } });
    this.log(a.apartment_id, 'chore_assignment', b.id, 'swapped', title(b), { assignee_id: { from: b.assignee_id, to: a.assignee_id } });
    [a.assignee_id, b.assignee_id] = [b.assignee_id, a.assignee_id];
    a.swapped_at = ts;
    b.swapped_at = ts;
    this.commit();
  }

  // ---------------------------------------------------------------- finances
  private writeShares(expenseId: UUID, apartmentId: UUID, amount: number, participants: UUID[]) {
    const active = new Set(this.db.members.filter((m) => m.apartment_id === apartmentId).map((m) => m.user_id));
    if (participants.some((p) => !active.has(p))) throw new AppError('reference');
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== expenseId);
    for (const s of splitEqually(amount, participants)) this.db.shares.push({ expense_id: expenseId, apartment_id: apartmentId, user_id: s.userId, amount: s.amount });
  }

  async createExpense(apartmentId: UUID, input: Parameters<Repository['createExpense']>[1]) {
    this.requireMember(apartmentId);
    if (input.participants.length === 0) throw new AppError('participants_required');
    const ts = nowIso();
    const { participants, ...fields } = input;
    const e = { id: newId(), apartment_id: apartmentId, ...fields, split_mode: 'equal' as const, created_by: this.uid(), created_at: ts, updated_at: ts };
    this.writeShares(e.id, apartmentId, e.amount, participants);
    this.db.expenses.push(e);
    this.log(apartmentId, 'expense', e.id, 'created', e.description);
    this.commit();
    return e.id;
  }

  async updateExpense(id: UUID, input: Parameters<Repository['updateExpense']>[1]) {
    const e = this.find(this.db.expenses, id);
    this.requireMember(e.apartment_id);
    if (input.participants.length === 0) throw new AppError('participants_required');
    const { participants, ...fields } = input;
    const changes = this.diff(e, fields);
    this.writeShares(id, e.apartment_id, input.amount, participants);
    Object.assign(e, fields, { updated_at: nowIso() });
    if (changes) this.log(e.apartment_id, 'expense', id, 'updated', e.description, changes);
    this.commit();
  }

  async deleteExpense(id: UUID) {
    const e = this.find(this.db.expenses, id);
    this.requireMember(e.apartment_id);
    this.db.expenses = this.db.expenses.filter((x) => x.id !== id);
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id);
    this.log(e.apartment_id, 'expense', id, 'deleted', e.description);
    this.commit();
  }

  async createSettlement(apartmentId: UUID, input: Parameters<Repository['createSettlement']>[1]) {
    this.requireMember(apartmentId);
    if (input.from_user === input.to_user) throw new AppError('constraint');
    const s = { id: newId(), apartment_id: apartmentId, ...input, created_by: this.uid(), created_at: nowIso() };
    this.db.settlements.push(s);
    this.log(apartmentId, 'settlement', s.id, 'created', String(s.amount));
    this.commit();
  }

  async deleteSettlement(id: UUID) {
    const s = this.find(this.db.settlements, id);
    this.requireMember(s.apartment_id);
    if (s.created_by !== this.uid()) throw new AppError('forbidden');
    this.db.settlements = this.db.settlements.filter((x) => x.id !== id);
    this.log(s.apartment_id, 'settlement', id, 'deleted', String(s.amount));
    this.commit();
  }

  // ---------------------------------------------------------------- calendar
  async createEvent(apartmentId: UUID, input: Parameters<Repository['createEvent']>[1]) {
    this.requireMember(apartmentId);
    const e = { id: newId(), apartment_id: apartmentId, ...input, created_by: this.uid(), created_at: nowIso() };
    this.db.events.push(e);
    if (e.visibility === 'shared') this.log(apartmentId, 'calendar_event', e.id, 'created', e.title);
    this.commit();
  }
  async updateEvent(id: UUID, input: Parameters<Repository['updateEvent']>[1]) {
    const e = this.find(this.db.events, id);
    this.requireMember(e.apartment_id);
    Object.assign(e, input);
    if (e.visibility === 'shared') this.log(e.apartment_id, 'calendar_event', id, 'updated', e.title);
    this.commit();
  }
  async deleteEvent(id: UUID) {
    const e = this.find(this.db.events, id);
    this.requireMember(e.apartment_id);
    this.db.events = this.db.events.filter((x) => x.id !== id);
    if (e.visibility === 'shared') this.log(e.apartment_id, 'calendar_event', id, 'deleted', e.title);
    this.commit();
  }

  // ---------------------------------------------------------------- shopping
  async createShoppingItem(apartmentId: UUID, input: Parameters<Repository['createShoppingItem']>[1]) {
    this.requireMember(apartmentId);
    const it = {
      id: newId(),
      apartment_id: apartmentId,
      ...input,
      status: 'pending' as const,
      added_by: this.uid(),
      purchased_by: null,
      purchased_at: null,
      created_at: nowIso(),
    };
    this.db.shopping.push(it);
    this.log(apartmentId, 'shopping_item', it.id, 'created', it.name);
    this.commit();
  }
  async updateShoppingItem(id: UUID, input: Parameters<Repository['updateShoppingItem']>[1]) {
    const it = this.find(this.db.shopping, id);
    this.requireMember(it.apartment_id);
    const changes = this.diff(it, input);
    Object.assign(it, input);
    if (changes) this.log(it.apartment_id, 'shopping_item', id, 'updated', it.name, changes);
    this.commit();
  }
  async setPurchased(item: { id: UUID }, purchased: boolean, userId: UUID) {
    const it = this.find(this.db.shopping, item.id);
    this.requireMember(it.apartment_id);
    const before = it.status;
    Object.assign(
      it,
      purchased
        ? { status: 'purchased', purchased_by: userId, purchased_at: nowIso() }
        : { status: 'pending', purchased_by: null, purchased_at: null },
    );
    this.log(it.apartment_id, 'shopping_item', it.id, 'status_changed', it.name, { status: { from: before, to: it.status } });
    this.commit();
  }
  async deleteShoppingItem(id: UUID) {
    const it = this.find(this.db.shopping, id);
    this.requireMember(it.apartment_id);
    this.db.shopping = this.db.shopping.filter((x) => x.id !== id);
    this.log(it.apartment_id, 'shopping_item', id, 'deleted', it.name);
    this.commit();
  }

  // ---------------------------------------------------------------- maintenance
  async createReport(apartmentId: UUID, input: Parameters<Repository['createReport']>[1]) {
    this.requireMember(apartmentId);
    const ts = nowIso();
    const r = {
      id: newId(),
      apartment_id: apartmentId,
      ...input,
      reported_by: this.uid(),
      photo_paths: [],
      resolved_at: input.status === 'resolved' || input.status === 'closed' ? ts : null,
      created_at: ts,
      updated_at: ts,
    };
    this.db.reports.push(r);
    this.log(apartmentId, 'maintenance_report', r.id, 'created', r.title);
    this.commit();
    return structuredClone(r);
  }
  async updateReport(id: UUID, input: Parameters<Repository['updateReport']>[1]) {
    const r = this.find(this.db.reports, id);
    this.requireMember(r.apartment_id);
    const changes = this.diff(r, input);
    Object.assign(r, input, { updated_at: nowIso() });
    if (input.status) {
      if ((r.status === 'resolved' || r.status === 'closed') && !r.resolved_at) r.resolved_at = nowIso();
      if (r.status === 'open' || r.status === 'in_progress') r.resolved_at = null;
    }
    if (changes) this.log(r.apartment_id, 'maintenance_report', id, changes.status ? 'status_changed' : 'updated', r.title, changes);
    this.commit();
  }
  async deleteReport(id: UUID) {
    const r = this.find(this.db.reports, id);
    this.requireMember(r.apartment_id);
    this.db.reports = this.db.reports.filter((x) => x.id !== id);
    for (const e of this.db.expenses) if (e.maintenance_report_id === id) e.maintenance_report_id = null;
    this.log(r.apartment_id, 'maintenance_report', id, 'deleted', r.title);
    this.commit();
  }

  /** Demo photos live in memory only (not persisted) to keep localStorage small. */
  async uploadPhoto(apartmentId: UUID, reportId: UUID, file: Blob) {
    this.requireMember(apartmentId);
    const path = `${apartmentId}/${reportId}/${newId()}.jpg`;
    this.photos.set(path, URL.createObjectURL(file));
    return path;
  }
  async photoUrl(path: string) {
    const url = this.photos.get(path);
    if (!url) throw new AppError('photo_unavailable');
    return url;
  }
  async deletePhoto(path: string) {
    const url = this.photos.get(path);
    if (url) URL.revokeObjectURL(url);
    this.photos.delete(path);
  }
}
