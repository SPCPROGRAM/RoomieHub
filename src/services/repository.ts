import type {
  Apartment,
  CalendarEvent,
  Category,
  CategoryScope,
  Chore,
  ChoreFrequency,
  ISODate,
  Invitation,
  InvitationPreview,
  Locale,
  MaintenanceReport,
  NewAssignment,
  PaletteColor,
  Profile,
  ReportPriority,
  ReportStatus,
  RotationSettings,
  ShoppingItem,
  Snapshot,
  UUID,
} from '@/domain/types';

export type DataMode = 'supabase' | 'demo';

export interface SessionUser {
  id: UUID;
  email: string | null;
}

export interface ChoreInput {
  title: string;
  description: string | null;
  category_id: UUID | null;
  frequency: ChoreFrequency;
  due_weekday: number;
  effort: number;
  rotation_offset?: number;
  active?: boolean;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  paid_by: UUID;
  spent_on: ISODate;
  category_id: UUID | null;
  participants: UUID[];
  notes: string | null;
  maintenance_report_id: UUID | null;
}

export interface SettlementInput {
  from_user: UUID;
  to_user: UUID;
  amount: number;
  settled_on: ISODate;
  note: string | null;
}

export type EventInput = Omit<CalendarEvent, 'id' | 'apartment_id' | 'created_by' | 'created_at'>;

export interface ShoppingInput {
  name: string;
  quantity: number;
  unit: string | null;
  category_id: UUID | null;
  assigned_to: UUID | null;
  estimated_price: number | null;
  notes: string | null;
}

export interface ReportInput {
  title: string;
  description: string | null;
  location: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  occurred_on: ISODate;
  responsible_id: UUID | null;
}

/**
 * Data access contract. The Supabase implementation talks to the real backend (RLS enforced
 * server side); the demo implementation keeps fictitious data in this browser only.
 * Every method either resolves after the server confirmed the change, or rejects.
 */
export interface Repository {
  readonly mode: DataMode;

  // auth
  getSession(): Promise<SessionUser | null>;
  onAuthChange(cb: (user: SessionUser | null, event: string) => void): () => void;
  signUp(input: { email: string; password: string; displayName: string; locale: Locale }): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;

  // profile
  getProfile(userId: UUID): Promise<Profile | null>;
  updateProfile(userId: UUID, patch: Partial<Pick<Profile, 'display_name' | 'avatar_color' | 'locale' | 'notify_daily' | 'notify_due' | 'notify_damage'>>): Promise<void>;

  // push notifications (this device)
  savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string; userAgent: string | null }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  /** Ask the server to send a test notification to all of my devices; resolves to how many got it. */
  sendTestNotification(): Promise<number>;

  // apartments & membership
  listMyApartments(userId: UUID): Promise<Apartment[]>;
  createApartment(name: string, currency: string): Promise<UUID>;
  updateApartment(id: UUID, patch: Partial<Pick<Apartment, 'name' | 'currency' | 'max_members'>>): Promise<void>;
  deleteApartment(id: UUID): Promise<void>;
  previewInvitation(code: string): Promise<InvitationPreview | null>;
  acceptInvitation(code: string): Promise<UUID>;
  createInvitation(apartmentId: UUID, opts: { days: number; maxUses: number }): Promise<Invitation>;
  revokeInvitation(id: UUID): Promise<void>;
  leaveApartment(apartmentId: UUID): Promise<void>;
  removeMember(apartmentId: UUID, userId: UUID): Promise<void>;
  transferOwnership(apartmentId: UUID, userId: UUID): Promise<void>;

  loadSnapshot(apartmentId: UUID): Promise<Snapshot>;
  /** Notify when another device changes this apartment's data. */
  subscribe(apartmentId: UUID, onChange: () => void): () => void;

  // categories
  createCategory(apartmentId: UUID, input: { scope: CategoryScope; name: string; color: PaletteColor }): Promise<Category>;
  updateCategory(id: UUID, patch: { name?: string; color?: PaletteColor }): Promise<void>;
  deleteCategory(id: UUID): Promise<void>;

  // chores & rotation
  createChore(apartmentId: UUID, input: ChoreInput): Promise<Chore>;
  updateChore(id: UUID, patch: Partial<ChoreInput> & { archived_at?: string | null }): Promise<void>;
  updateRotation(apartmentId: UUID, patch: Partial<Pick<RotationSettings, 'member_order' | 'anchor_week' | 'auto_generate' | 'repetition_threshold' | 'last_generated_week'>>): Promise<void>;
  insertAssignments(rows: NewAssignment[]): Promise<void>;
  /** Remove PENDING assignments from `weekStart` on (only that week unless `onwards`), optionally of one chore. Done ones stay. */
  deletePendingAssignments(apartmentId: UUID, weekStart: ISODate, opts?: { choreId?: UUID; onwards?: boolean }): Promise<void>;
  completeAssignment(apartmentId: UUID, assignmentId: UUID, note: string | null): Promise<void>;
  uncompleteAssignment(assignmentId: UUID): Promise<void>;
  setAssignmentSkipped(assignmentId: UUID, skipped: boolean): Promise<void>;
  swapAssignments(a: UUID, b: UUID): Promise<void>;

  // finances
  createExpense(apartmentId: UUID, input: ExpenseInput): Promise<UUID>;
  updateExpense(id: UUID, input: ExpenseInput): Promise<void>;
  deleteExpense(id: UUID): Promise<void>;
  createSettlement(apartmentId: UUID, input: SettlementInput): Promise<void>;
  deleteSettlement(id: UUID): Promise<void>;

  // calendar
  createEvent(apartmentId: UUID, input: EventInput): Promise<void>;
  updateEvent(id: UUID, input: EventInput): Promise<void>;
  deleteEvent(id: UUID): Promise<void>;

  // shopping
  createShoppingItem(apartmentId: UUID, input: ShoppingInput): Promise<void>;
  updateShoppingItem(id: UUID, input: Partial<ShoppingInput>): Promise<void>;
  setPurchased(item: Pick<ShoppingItem, 'id'>, purchased: boolean, userId: UUID): Promise<void>;
  deleteShoppingItem(id: UUID): Promise<void>;

  // maintenance
  createReport(apartmentId: UUID, input: ReportInput): Promise<MaintenanceReport>;
  updateReport(id: UUID, input: Partial<ReportInput> & { photo_paths?: string[] }): Promise<void>;
  deleteReport(id: UUID): Promise<void>;
  uploadPhoto(apartmentId: UUID, reportId: UUID, file: Blob): Promise<string>;
  photoUrl(path: string): Promise<string>;
  deletePhoto(path: string): Promise<void>;
}
