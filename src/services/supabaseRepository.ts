import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import type {
  ActivityLog,
  Apartment,
  CalendarEvent,
  Category,
  Chore,
  ChoreAssignment,
  ChoreCompletion,
  Expense,
  ExpenseShare,
  Invitation,
  InvitationPreview,
  MaintenanceReport,
  Member,
  Profile,
  RotationSettings,
  Settlement,
  ShoppingItem,
  Snapshot,
  UUID,
} from '@/domain/types';
import { getSupabase } from '@/lib/supabase';
import type { Repository, SessionUser } from './repository';

const PAGE = 1000;
const PHOTO_BUCKET = 'maintenance-photos';
const REALTIME_TABLES = [
  'apartment_members',
  'chores',
  'chore_assignments',
  'chore_completions',
  'expenses',
  'settlements',
  'calendar_events',
  'shopping_items',
  'maintenance_reports',
  'activity_logs',
] as const;

function check<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw result.error;
  return result.data;
}

const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** PostgREST caps responses (1000 rows by default): page through larger tables. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getSupabase();
  }

  // ---------------------------------------------------------------- auth
  async getSession(): Promise<SessionUser | null> {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    return user ? { id: user.id, email: user.email ?? null } : null;
  }

  onAuthChange(cb: (user: SessionUser | null, event: string) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      cb(user ? { id: user.id, email: user.email ?? null } : null, event);
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(input: { email: string; password: string; displayName: string; locale: 'es' | 'en' }) {
    const { data, error } = await this.sb.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName, locale: input.locale },
        emailRedirectTo: `${env.appUrl}/login`,
      },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await this.sb.auth.signOut();
    if (error) throw error;
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/reset-password` });
    if (error) throw error;
  }

  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- profile
  async getProfile(userId: UUID): Promise<Profile | null> {
    return check(await this.sb.from('profiles').select('*').eq('id', userId).maybeSingle()) as Profile | null;
  }

  async updateProfile(userId: UUID, patch: Partial<Pick<Profile, 'display_name' | 'avatar_color' | 'locale'>>) {
    check(await this.sb.from('profiles').update(patch).eq('id', userId));
  }

  // ---------------------------------------------------------------- apartments
  async listMyApartments(userId: UUID): Promise<Apartment[]> {
    const rows = check(
      await this.sb.from('apartment_members').select('apartment:apartments(*)').eq('user_id', userId).is('left_at', null),
    ) as unknown as { apartment: Apartment | null }[];
    return rows.map((r) => r.apartment).filter((a): a is Apartment => a !== null);
  }

  async createApartment(name: string, currency: string): Promise<UUID> {
    return check(await this.sb.rpc('create_apartment', { p_name: name, p_currency: currency })) as UUID;
  }

  async updateApartment(id: UUID, patch: Partial<Pick<Apartment, 'name' | 'currency' | 'max_members'>>) {
    check(await this.sb.from('apartments').update(patch).eq('id', id));
  }

  async deleteApartment(id: UUID) {
    check(await this.sb.from('apartments').delete().eq('id', id));
  }

  async previewInvitation(code: string): Promise<InvitationPreview | null> {
    const rows = check(await this.sb.rpc('invitation_preview', { p_code: code })) as InvitationPreview[] | null;
    return rows?.[0] ?? null;
  }

  async acceptInvitation(code: string): Promise<UUID> {
    return check(await this.sb.rpc('accept_invitation', { p_code: code })) as UUID;
  }

  async createInvitation(apartmentId: UUID, opts: { days: number; maxUses: number }): Promise<Invitation> {
    const expires = new Date(Date.now() + opts.days * 86_400_000).toISOString();
    return check(
      await this.sb
        .from('invitations')
        .insert({ apartment_id: apartmentId, expires_at: expires, max_uses: opts.maxUses })
        .select('*')
        .single(),
    ) as Invitation;
  }

  async revokeInvitation(id: UUID) {
    check(await this.sb.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', id));
  }

  async leaveApartment(apartmentId: UUID) {
    check(await this.sb.rpc('leave_apartment', { p_apartment: apartmentId }));
  }

  async removeMember(apartmentId: UUID, userId: UUID) {
    check(await this.sb.rpc('remove_member', { p_apartment: apartmentId, p_user: userId }));
  }

  async transferOwnership(apartmentId: UUID, userId: UUID) {
    check(await this.sb.rpc('transfer_ownership', { p_apartment: apartmentId, p_user: userId }));
  }

  async loadSnapshot(apartmentId: UUID): Promise<Snapshot> {
    const sb = this.sb;
    const byApt = (table: string, select = '*') => sb.from(table).select(select).eq('apartment_id', apartmentId);

    const [
      apartment,
      members,
      invitations,
      categories,
      rotation,
      chores,
      assignments,
      completions,
      expenses,
      shares,
      settlements,
      events,
      shopping,
      reports,
      activity,
    ] = await Promise.all([
      sb.from('apartments').select('*').eq('id', apartmentId).single().then(check),
      byApt('apartment_members', '*, profile:profiles(id, display_name, avatar_color)').order('joined_at').then(check),
      byApt('invitations').is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).then(check),
      byApt('categories').order('name').then(check),
      sb.from('rotation_settings').select('*').eq('apartment_id', apartmentId).single().then(check),
      byApt('chores').order('created_at').then(check),
      fetchAll((f, t) => byApt('chore_assignments').order('week_start', { ascending: false }).order('id').range(f, t)),
      fetchAll((f, t) => byApt('chore_completions').order('completed_at', { ascending: false }).order('id').range(f, t)),
      fetchAll((f, t) => byApt('expenses').order('spent_on', { ascending: false }).order('id').range(f, t)),
      fetchAll((f, t) => byApt('expense_shares').order('expense_id').order('user_id').range(f, t)),
      fetchAll((f, t) => byApt('settlements').order('settled_on', { ascending: false }).order('id').range(f, t)),
      fetchAll((f, t) => byApt('calendar_events').order('starts_at').order('id').range(f, t)),
      fetchAll((f, t) => byApt('shopping_items').order('created_at', { ascending: false }).order('id').range(f, t)),
      byApt('maintenance_reports').order('created_at', { ascending: false }).then(check),
      byApt('activity_logs').order('created_at', { ascending: false }).limit(300).then(check),
    ]);

    type Row = Record<string, unknown>;
    return {
      apartment: apartment as Apartment,
      members: members as unknown as Member[],
      invitations: invitations as unknown as Invitation[],
      categories: categories as unknown as Category[],
      rotation: rotation as RotationSettings,
      chores: chores as unknown as Chore[],
      assignments: assignments as unknown as ChoreAssignment[],
      completions: completions as unknown as ChoreCompletion[],
      expenses: (expenses as unknown as Row[]).map((e) => ({ ...e, amount: Number(e.amount) })) as unknown as Expense[],
      shares: (shares as unknown as Row[]).map((s) => ({ ...s, amount: Number(s.amount) })) as unknown as ExpenseShare[],
      settlements: (settlements as unknown as Row[]).map((s) => ({ ...s, amount: Number(s.amount) })) as unknown as Settlement[],
      events: (events as unknown as Row[]).map((e) => ({ ...e, amount: toNum(e.amount) })) as unknown as CalendarEvent[],
      shopping: (shopping as unknown as Row[]).map((s) => ({
        ...s,
        quantity: Number(s.quantity),
        estimated_price: toNum(s.estimated_price),
      })) as unknown as ShoppingItem[],
      reports: reports as unknown as MaintenanceReport[],
      activity: activity as unknown as ActivityLog[],
      fetchedAt: new Date().toISOString(),
    };
  }

  subscribe(apartmentId: UUID, onChange: () => void) {
    const channel = this.sb.channel(`apartment:${apartmentId}`);
    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `apartment_id=eq.${apartmentId}` }, onChange);
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  // ---------------------------------------------------------------- categories
  async createCategory(apartmentId: UUID, input: Pick<Category, 'scope' | 'name' | 'color'>): Promise<Category> {
    return check(await this.sb.from('categories').insert({ apartment_id: apartmentId, ...input }).select('*').single()) as Category;
  }
  async updateCategory(id: UUID, patch: Partial<Pick<Category, 'name' | 'color'>>) {
    check(await this.sb.from('categories').update(patch).eq('id', id));
  }
  async deleteCategory(id: UUID) {
    check(await this.sb.from('categories').delete().eq('id', id));
  }

  // ---------------------------------------------------------------- chores
  async createChore(apartmentId: UUID, input: Parameters<Repository['createChore']>[1]): Promise<Chore> {
    return check(await this.sb.from('chores').insert({ apartment_id: apartmentId, ...input }).select('*').single()) as Chore;
  }
  async updateChore(id: UUID, patch: Parameters<Repository['updateChore']>[1]) {
    check(await this.sb.from('chores').update(patch).eq('id', id));
  }
  async updateRotation(apartmentId: UUID, patch: Parameters<Repository['updateRotation']>[1]) {
    check(await this.sb.from('rotation_settings').update(patch).eq('apartment_id', apartmentId));
  }
  async insertAssignments(rows: Parameters<Repository['insertAssignments']>[0]) {
    if (rows.length === 0) return;
    // ignoreDuplicates: two roomies generating the same week at once is harmless
    check(await this.sb.from('chore_assignments').upsert(rows, { onConflict: 'chore_id,week_start,occurrence', ignoreDuplicates: true }));
  }
  async deletePendingAssignments(apartmentId: UUID, weekStart: string, opts: { choreId?: UUID; onwards?: boolean } = {}) {
    let q = this.sb.from('chore_assignments').delete().eq('apartment_id', apartmentId).eq('status', 'pending');
    q = opts.onwards ? q.gte('week_start', weekStart) : q.eq('week_start', weekStart);
    if (opts.choreId) q = q.eq('chore_id', opts.choreId);
    check(await q);
  }
  async completeAssignment(apartmentId: UUID, assignmentId: UUID, note: string | null) {
    check(await this.sb.from('chore_completions').insert({ apartment_id: apartmentId, assignment_id: assignmentId, note }));
  }
  async uncompleteAssignment(assignmentId: UUID) {
    check(await this.sb.from('chore_completions').delete().eq('assignment_id', assignmentId));
  }
  async setAssignmentSkipped(assignmentId: UUID, skipped: boolean) {
    check(
      await this.sb
        .from('chore_assignments')
        .update({ status: skipped ? 'skipped' : 'pending' })
        .eq('id', assignmentId)
        .neq('status', 'done'),
    );
  }
  async swapAssignments(a: UUID, b: UUID) {
    check(await this.sb.rpc('swap_assignments', { p_a: a, p_b: b }));
  }

  // ---------------------------------------------------------------- finances
  private expenseArgs(input: Parameters<Repository['createExpense']>[1]) {
    return {
      p_description: input.description,
      p_amount: input.amount,
      p_paid_by: input.paid_by,
      p_spent_on: input.spent_on,
      p_participants: input.participants,
      p_category: input.category_id,
      p_notes: input.notes,
      p_maintenance_report: input.maintenance_report_id,
    };
  }
  async createExpense(apartmentId: UUID, input: Parameters<Repository['createExpense']>[1]) {
    return check(await this.sb.rpc('create_expense', { p_apartment: apartmentId, ...this.expenseArgs(input) })) as UUID;
  }
  async updateExpense(id: UUID, input: Parameters<Repository['updateExpense']>[1]) {
    check(await this.sb.rpc('update_expense', { p_expense: id, ...this.expenseArgs(input) }));
  }
  async deleteExpense(id: UUID) {
    check(await this.sb.from('expenses').delete().eq('id', id));
  }
  async createSettlement(apartmentId: UUID, input: Parameters<Repository['createSettlement']>[1]) {
    check(await this.sb.from('settlements').insert({ apartment_id: apartmentId, ...input }));
  }
  async deleteSettlement(id: UUID) {
    check(await this.sb.from('settlements').delete().eq('id', id));
  }

  // ---------------------------------------------------------------- calendar
  async createEvent(apartmentId: UUID, input: Parameters<Repository['createEvent']>[1]) {
    check(await this.sb.from('calendar_events').insert({ apartment_id: apartmentId, ...input }));
  }
  async updateEvent(id: UUID, input: Parameters<Repository['updateEvent']>[1]) {
    check(await this.sb.from('calendar_events').update(input).eq('id', id));
  }
  async deleteEvent(id: UUID) {
    check(await this.sb.from('calendar_events').delete().eq('id', id));
  }

  // ---------------------------------------------------------------- shopping
  async createShoppingItem(apartmentId: UUID, input: Parameters<Repository['createShoppingItem']>[1]) {
    check(await this.sb.from('shopping_items').insert({ apartment_id: apartmentId, ...input }));
  }
  async updateShoppingItem(id: UUID, input: Parameters<Repository['updateShoppingItem']>[1]) {
    check(await this.sb.from('shopping_items').update(input).eq('id', id));
  }
  async setPurchased(item: { id: UUID }, purchased: boolean, userId: UUID) {
    const patch = purchased
      ? { status: 'purchased', purchased_by: userId, purchased_at: new Date().toISOString() }
      : { status: 'pending', purchased_by: null, purchased_at: null };
    check(await this.sb.from('shopping_items').update(patch).eq('id', item.id));
  }
  async deleteShoppingItem(id: UUID) {
    check(await this.sb.from('shopping_items').delete().eq('id', id));
  }

  // ---------------------------------------------------------------- maintenance
  async createReport(apartmentId: UUID, input: Parameters<Repository['createReport']>[1]) {
    return check(
      await this.sb.from('maintenance_reports').insert({ apartment_id: apartmentId, ...input }).select('*').single(),
    ) as MaintenanceReport;
  }
  async updateReport(id: UUID, input: Parameters<Repository['updateReport']>[1]) {
    check(await this.sb.from('maintenance_reports').update(input).eq('id', id));
  }
  async deleteReport(id: UUID) {
    check(await this.sb.from('maintenance_reports').delete().eq('id', id));
  }
  async uploadPhoto(apartmentId: UUID, reportId: UUID, file: Blob) {
    const path = `${apartmentId}/${reportId}/${crypto.randomUUID()}.jpg`;
    const { error } = await this.sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }
  async photoUrl(path: string) {
    const { data, error } = await this.sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
  async deletePhoto(path: string) {
    const { error } = await this.sb.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) throw error;
  }
}
