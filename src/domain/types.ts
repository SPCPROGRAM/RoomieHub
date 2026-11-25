// Domain entities. Field names mirror the database columns (snake_case) so rows from
// Supabase can be used directly without a mapping layer.

export type UUID = string;
/** ISO calendar date, YYYY-MM-DD (no time zone). */
export type ISODate = string;
/** ISO timestamp with zone. */
export type ISODateTime = string;

export const PALETTE = ['teal', 'violet', 'coral', 'amber', 'sky', 'rose', 'lime', 'slate'] as const;
export type PaletteColor = (typeof PALETTE)[number];

export type Locale = 'es' | 'en';

export interface Profile {
  id: UUID;
  display_name: string;
  avatar_color: PaletteColor;
  locale: Locale;
  /** Push preferences (absent in old demo data: treat as on). */
  notify_daily?: boolean;
  notify_due?: boolean;
  notify_damage?: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Apartment {
  id: UUID;
  name: string;
  currency: string;
  timezone: string;
  max_members: number;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MemberRole = 'owner' | 'member';

export interface Member {
  apartment_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: ISODateTime;
  left_at: ISODateTime | null;
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_color'>;
}

export interface Invitation {
  id: UUID;
  apartment_id: UUID;
  code: string;
  created_by: UUID;
  expires_at: ISODateTime;
  max_uses: number;
  uses: number;
  revoked_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface InvitationPreview {
  apartment_name: string;
  member_count: number;
  max_members: number;
  expires_at: ISODateTime;
  valid: boolean;
}

export type CategoryScope = 'chore' | 'expense' | 'shopping';

export interface Category {
  id: UUID;
  apartment_id: UUID;
  scope: CategoryScope;
  name: string;
  color: PaletteColor;
  created_at: ISODateTime;
}

export type ChoreFrequency = 'daily' | 'twice_weekly' | 'weekly' | 'biweekly' | 'monthly';

export interface Chore {
  id: UUID;
  apartment_id: UUID;
  title: string;
  description: string | null;
  category_id: UUID | null;
  frequency: ChoreFrequency;
  /** ISO weekday 1 (Monday) … 7 (Sunday). */
  due_weekday: number;
  rotation_offset: number;
  effort: number;
  active: boolean;
  archived_at: ISODateTime | null;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RotationSettings {
  apartment_id: UUID;
  member_order: UUID[];
  anchor_week: ISODate;
  auto_generate: boolean;
  repetition_threshold: number;
  last_generated_week: ISODate | null;
  updated_at: ISODateTime;
}

export type AssignmentStatus = 'pending' | 'done' | 'skipped';

export interface ChoreAssignment {
  id: UUID;
  apartment_id: UUID;
  chore_id: UUID;
  week_start: ISODate;
  occurrence: number;
  rotation_index: number;
  assignee_id: UUID;
  original_assignee_id: UUID;
  due_date: ISODate;
  status: AssignmentStatus;
  completed_at: ISODateTime | null;
  swapped_at: ISODateTime | null;
  created_at: ISODateTime;
}

export type NewAssignment = Omit<ChoreAssignment, 'id' | 'status' | 'completed_at' | 'swapped_at' | 'created_at'>;

export interface ChoreCompletion {
  id: UUID;
  apartment_id: UUID;
  assignment_id: UUID;
  completed_by: UUID;
  completed_at: ISODateTime;
  note: string | null;
}

export interface Expense {
  id: UUID;
  apartment_id: UUID;
  description: string;
  amount: number;
  category_id: UUID | null;
  paid_by: UUID;
  spent_on: ISODate;
  split_mode: 'equal';
  notes: string | null;
  maintenance_report_id: UUID | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ExpenseShare {
  expense_id: UUID;
  apartment_id: UUID;
  user_id: UUID;
  amount: number;
}

export interface Settlement {
  id: UUID;
  apartment_id: UUID;
  from_user: UUID;
  to_user: UUID;
  amount: number;
  settled_on: ISODate;
  note: string | null;
  created_by: UUID;
  created_at: ISODateTime;
}

export type EventKind = 'event' | 'payment' | 'reminder' | 'maintenance';
export type Recurrence = 'none' | 'weekly' | 'monthly';

export interface CalendarEvent {
  id: UUID;
  apartment_id: UUID;
  title: string;
  description: string | null;
  kind: EventKind;
  starts_at: ISODateTime;
  ends_at: ISODateTime | null;
  all_day: boolean;
  recurrence: Recurrence;
  remind_minutes_before: number | null;
  amount: number | null;
  visibility: 'shared' | 'private';
  created_by: UUID;
  created_at: ISODateTime;
}

export interface ShoppingItem {
  id: UUID;
  apartment_id: UUID;
  name: string;
  quantity: number;
  unit: string | null;
  category_id: UUID | null;
  status: 'pending' | 'purchased';
  assigned_to: UUID | null;
  estimated_price: number | null;
  notes: string | null;
  added_by: UUID;
  purchased_by: UUID | null;
  purchased_at: ISODateTime | null;
  created_at: ISODateTime;
}

export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ReportPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceReport {
  id: UUID;
  apartment_id: UUID;
  title: string;
  description: string | null;
  location: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  occurred_on: ISODate;
  reported_by: UUID;
  responsible_id: UUID | null;
  photo_paths: string[];
  resolved_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ActivityLog {
  id: number;
  apartment_id: UUID;
  actor_id: UUID | null;
  entity_type: string;
  entity_id: UUID | null;
  action: string;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: ISODateTime;
}

/** Everything the app needs for one apartment, loaded at once (households are small). */
export interface Snapshot {
  apartment: Apartment;
  members: Member[];
  invitations: Invitation[];
  categories: Category[];
  rotation: RotationSettings;
  chores: Chore[];
  assignments: ChoreAssignment[];
  completions: ChoreCompletion[];
  expenses: Expense[];
  shares: ExpenseShare[];
  settlements: Settlement[];
  events: CalendarEvent[];
  shopping: ShoppingItem[];
  reports: MaintenanceReport[];
  activity: ActivityLog[];
  fetchedAt: ISODateTime;
}
