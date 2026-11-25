/**
 * DEMO DATA — fictitious household used only by demo mode, stored in this browser's
 * localStorage. It is never sent to Supabase and never mixed with real accounts.
 */
import { addDays, startOfWeek, todayISO } from '@/domain/dates';
import { splitEqually } from '@/domain/money';
import { generateWeekAssignments } from '@/domain/rotation';
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
  MaintenanceReport,
  Member,
  Profile,
  RotationSettings,
  Settlement,
  ShoppingItem,
} from '@/domain/types';
import { newId } from '@/lib/id';

export const DEMO_APARTMENT_ID = 'de300000-0000-4000-8000-000000000001';
export const DEMO_USERS = [
  { id: 'de300000-0000-4000-8000-0000000000a1', display_name: 'Valentina (demo)', avatar_color: 'teal', email: 'valentina@demo.roomiehub' },
  { id: 'de300000-0000-4000-8000-0000000000b2', display_name: 'Mateo (demo)', avatar_color: 'violet', email: 'mateo@demo.roomiehub' },
  { id: 'de300000-0000-4000-8000-0000000000c3', display_name: 'Sofía (demo)', avatar_color: 'coral', email: 'sofia@demo.roomiehub' },
] as const;

export interface DemoDB {
  version: 1;
  profiles: Profile[];
  apartments: Apartment[];
  members: Omit<Member, 'profile'>[];
  invitations: Invitation[];
  categories: Category[];
  rotation: RotationSettings[];
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
  nextActivityId: number;
}

const at = (date: string, time = '10:00:00') => new Date(`${date}T${time}`).toISOString();

export function createDemoDB(now: Date = new Date()): DemoDB {
  const today = todayISO(now);
  const thisWeek = startOfWeek(today);
  const anchor = addDays(thisWeek, -21);
  const apt = DEMO_APARTMENT_ID;
  const [v, m, s] = DEMO_USERS.map((u) => u.id) as [string, string, string];
  const created = at(addDays(anchor, -10));

  const db: DemoDB = {
    version: 1,
    profiles: DEMO_USERS.map((u) => ({
      id: u.id,
      display_name: u.display_name,
      avatar_color: u.avatar_color,
      locale: 'es',
      created_at: created,
      updated_at: created,
    })),
    apartments: [
      {
        id: apt,
        name: 'Apartamento demo · Chapinero',
        currency: 'COP',
        timezone: 'America/Bogota',
        max_members: 3,
        created_by: v,
        created_at: created,
        updated_at: created,
      },
    ],
    members: [v, m, s].map((id, i) => ({
      apartment_id: apt,
      user_id: id,
      role: i === 0 ? 'owner' : 'member',
      joined_at: at(addDays(anchor, -10 + i)),
      left_at: null,
    })),
    invitations: [],
    categories: [],
    rotation: [
      {
        apartment_id: apt,
        member_order: [v, m, s],
        anchor_week: anchor,
        auto_generate: true,
        repetition_threshold: 3,
        last_generated_week: thisWeek,
        updated_at: created,
      },
    ],
    chores: [],
    assignments: [],
    completions: [],
    expenses: [],
    shares: [],
    settlements: [],
    events: [],
    shopping: [],
    reports: [],
    activity: [],
    nextActivityId: 1,
  };

  const cat = (scope: Category['scope'], name: string, color: Category['color']) => {
    const c: Category = { id: newId(), apartment_id: apt, scope, name, color, created_at: created };
    db.categories.push(c);
    return c.id;
  };
  const cClean = cat('chore', 'Limpieza', 'teal');
  const cKitchen = cat('chore', 'Cocina', 'amber');
  const cTrash = cat('chore', 'Basura y reciclaje', 'lime');
  const eRent = cat('expense', 'Arriendo', 'violet');
  const eUtil = cat('expense', 'Servicios', 'sky');
  const eFood = cat('expense', 'Mercado', 'teal');
  const eNet = cat('expense', 'Internet', 'coral');
  const eRepair = cat('expense', 'Reparaciones', 'rose');
  cat('expense', 'Otros', 'slate');
  const sPantry = cat('shopping', 'Despensa', 'amber');
  const sClean = cat('shopping', 'Aseo', 'sky');
  const sFresh = cat('shopping', 'Frescos', 'lime');

  const log = (actor: string | null, entity_type: string, entity_id: string | null, action: string, summary: string | null, ts: string, changes: ActivityLog['changes'] = null) => {
    db.activity.push({ id: db.nextActivityId++, apartment_id: apt, actor_id: actor, entity_type, entity_id, action, summary, changes, created_at: ts });
  };
  db.members.forEach((mem) => log(mem.user_id, 'member', mem.user_id, 'joined', DEMO_USERS.find((u) => u.id === mem.user_id)!.display_name, mem.joined_at));

  // -------- chores
  const chore = (title: string, category: string, frequency: Chore['frequency'], offset: number, effort: number, due = 7) => {
    const c: Chore = {
      id: newId(),
      apartment_id: apt,
      title,
      description: null,
      category_id: category,
      frequency,
      due_weekday: due,
      rotation_offset: offset,
      effort,
      active: true,
      archived_at: null,
      created_by: v,
      created_at: at(anchor, '08:00:00'),
      updated_at: at(anchor, '08:00:00'),
    };
    db.chores.push(c);
    log(v, 'chore', c.id, 'created', title, c.created_at);
    return c;
  };
  chore('Limpiar cocina y estufa', cKitchen, 'weekly', 0, 3, 6);
  chore('Limpiar baño', cClean, 'weekly', 1, 3, 6);
  chore('Sacar basura y reciclaje', cTrash, 'twice_weekly', 2, 1);
  chore('Barrer y trapear zonas comunes', cClean, 'weekly', 0, 2, 7);
  chore('Limpiar nevera', cKitchen, 'monthly', 1, 2, 5);

  for (let w = 0; w <= 3; w++) {
    const week = addDays(anchor, w * 7);
    const rows = generateWeekAssignments({ apartmentId: apt, weekStart: week, chores: db.chores, rotation: db.rotation[0]!, existing: [] });
    rows.forEach((r, i) => {
      const isPast = r.due_date < today;
      // demo: most past chores were done, a couple were missed so stats look realistic
      const missed = isPast && (w === 1 && i === 1);
      const done = isPast && !missed;
      const completedAt = done ? at(r.due_date, i % 3 === 0 ? '19:30:00' : '11:00:00') : null;
      const a: ChoreAssignment = {
        ...r,
        id: newId(),
        status: done ? 'done' : 'pending',
        completed_at: completedAt,
        swapped_at: null,
        created_at: at(week, '00:05:00'),
      };
      db.assignments.push(a);
      if (done && completedAt) {
        db.completions.push({ id: newId(), apartment_id: apt, assignment_id: a.id, completed_by: a.assignee_id, completed_at: completedAt, note: null });
        log(a.assignee_id, 'chore_completion', a.id, 'completed', db.chores.find((c) => c.id === a.chore_id)!.title, completedAt);
      }
    });
  }

  // -------- maintenance
  const leak: MaintenanceReport = {
    id: newId(),
    apartment_id: apt,
    title: 'Fuga debajo del lavaplatos',
    description: 'Gotea el sifón cuando se usa el lavaplatos. Pusimos un balde mientras tanto.',
    location: 'Cocina',
    status: 'in_progress',
    priority: 'high',
    occurred_on: addDays(today, -6),
    reported_by: m,
    responsible_id: v,
    photo_paths: [],
    resolved_at: null,
    created_at: at(addDays(today, -6), '21:10:00'),
    updated_at: at(addDays(today, -4), '09:00:00'),
  };
  const bulb: MaintenanceReport = {
    id: newId(),
    apartment_id: apt,
    title: 'Bombillo fundido en el pasillo',
    description: null,
    location: 'Pasillo',
    status: 'resolved',
    priority: 'low',
    occurred_on: addDays(today, -15),
    reported_by: s,
    responsible_id: s,
    photo_paths: [],
    resolved_at: at(addDays(today, -14), '18:00:00'),
    created_at: at(addDays(today, -15), '20:00:00'),
    updated_at: at(addDays(today, -14), '18:00:00'),
  };
  db.reports.push(leak, bulb);
  log(m, 'maintenance_report', leak.id, 'created', leak.title, leak.created_at);
  log(v, 'maintenance_report', leak.id, 'status_changed', leak.title, leak.updated_at, { status: { from: 'open', to: 'in_progress' } });
  log(s, 'maintenance_report', bulb.id, 'created', bulb.title, bulb.created_at);
  log(s, 'maintenance_report', bulb.id, 'status_changed', bulb.title, bulb.updated_at, { status: { from: 'open', to: 'resolved' } });

  // -------- expenses (4 months)
  const members3 = [v, m, s];
  const expense = (description: string, amount: number, paidBy: string, spentOn: string, category: string, reportId: string | null = null) => {
    const e: Expense = {
      id: newId(),
      apartment_id: apt,
      description,
      amount,
      category_id: category,
      paid_by: paidBy,
      spent_on: spentOn,
      split_mode: 'equal',
      notes: null,
      maintenance_report_id: reportId,
      created_by: paidBy,
      created_at: at(spentOn, '20:00:00'),
      updated_at: at(spentOn, '20:00:00'),
    };
    db.expenses.push(e);
    for (const sh of splitEqually(amount, members3)) db.shares.push({ expense_id: e.id, apartment_id: apt, user_id: sh.userId, amount: sh.amount });
    log(paidBy, 'expense', e.id, 'created', description, e.created_at);
  };
  const monthStart = (back: number) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - back, 1));
    return d.toISOString().slice(0, 10);
  };
  for (let back = 3; back >= 0; back--) {
    const ms = monthStart(back);
    const isCurrent = back === 0;
    expense('Arriendo', 2_400_000, v, addDays(ms, 1), eRent);
    expense('Energía', 148_350 + back * 6_100, m, addDays(ms, 9), eUtil);
    expense('Agua y alcantarillado', 96_200 + back * 3_400, s, addDays(ms, 11), eUtil);
    expense('Internet fibra 500 Mbps', 109_900, m, addDays(ms, 4), eNet);
    expense('Mercado grande', 287_400 - back * 12_500, s, addDays(ms, 6), eFood);
    if (!isCurrent || today >= addDays(ms, 18)) expense('Mercado de la semana', 94_750 + back * 4_200, v, addDays(ms, 18), eFood);
  }
  expense('Plomero: cambio de sifón', 85_000, v, addDays(today, -4), eRepair, leak.id);
  expense('Bombillo LED pasillo', 12_900, s, addDays(today, -14), eRepair, bulb.id);

  // settle every past month so only the current month is open
  for (let back = 3; back >= 1; back--) {
    const ms = monthStart(back);
    const last = addDays(monthStart(back - 1), -1);
    const monthExpenses = db.expenses.filter((e) => e.spent_on >= ms && e.spent_on <= last);
    const balance = new Map(members3.map((id) => [id, 0]));
    for (const e of monthExpenses) {
      balance.set(e.paid_by, balance.get(e.paid_by)! + e.amount);
      for (const sh of db.shares.filter((x) => x.expense_id === e.id)) balance.set(sh.user_id, balance.get(sh.user_id)! - sh.amount);
    }
    const creditors = [...balance].filter(([, b]) => b > 0);
    for (const [debtor, owed] of [...balance].filter(([, b]) => b < 0)) {
      let remaining = -owed;
      for (const c of creditors) {
        const pay = Math.min(remaining, c[1]);
        if (pay <= 0) continue;
        const st: Settlement = {
          id: newId(),
          apartment_id: apt,
          from_user: debtor,
          to_user: c[0],
          amount: pay,
          settled_on: addDays(monthStart(back - 1), 1),
          note: 'Transferencia (demo)',
          created_by: debtor,
          created_at: at(addDays(monthStart(back - 1), 1), '12:00:00'),
        };
        db.settlements.push(st);
        log(debtor, 'settlement', st.id, 'created', String(pay), st.created_at);
        c[1] -= pay;
        remaining -= pay;
      }
    }
  }

  // -------- calendar
  const event = (title: string, kind: CalendarEvent['kind'], date: string, opts: Partial<CalendarEvent> = {}) => {
    const e: CalendarEvent = {
      id: newId(),
      apartment_id: apt,
      title,
      description: null,
      kind,
      starts_at: at(date, '09:00:00'),
      ends_at: null,
      all_day: true,
      recurrence: 'none',
      remind_minutes_before: 1440,
      amount: null,
      visibility: 'shared',
      created_by: v,
      created_at: created,
      ...opts,
    };
    db.events.push(e);
  };
  event('Pago del arriendo', 'payment', monthStart(-1), { recurrence: 'monthly', amount: 2_400_000 });
  event('Factura de internet', 'payment', addDays(monthStart(-1), 4), { recurrence: 'monthly', amount: 109_900, created_by: m });
  event('Visita del plomero', 'maintenance', addDays(today, 2), { all_day: false, starts_at: at(addDays(today, 2), '08:00:00'), ends_at: at(addDays(today, 2), '10:00:00'), created_by: v });
  event('Cena de roomies', 'event', addDays(today, 5), { all_day: false, starts_at: at(addDays(today, 5), '19:30:00'), ends_at: at(addDays(today, 5), '22:00:00'), created_by: s, remind_minutes_before: 120 });
  event('Revisar lectura del contador de gas', 'reminder', addDays(today, 9), { created_by: m });

  // -------- shopping
  const item = (name: string, quantity: number, unit: string | null, category: string, addedBy: string, purchasedDaysAgo: number | null, assigned: string | null = null, price: number | null = null) => {
    const purchased = purchasedDaysAgo !== null;
    const it: ShoppingItem = {
      id: newId(),
      apartment_id: apt,
      name,
      quantity,
      unit,
      category_id: category,
      status: purchased ? 'purchased' : 'pending',
      assigned_to: assigned,
      estimated_price: price,
      notes: null,
      added_by: addedBy,
      purchased_by: purchased ? (assigned ?? addedBy) : null,
      purchased_at: purchased ? at(addDays(today, -purchasedDaysAgo), '17:00:00') : null,
      created_at: at(addDays(today, -(purchasedDaysAgo ?? 0) - 2), '08:00:00'),
    };
    db.shopping.push(it);
  };
  item('Leche deslactosada', 2, 'L', sFresh, s, null, m, 9_800);
  item('Huevos AA', 30, 'und', sFresh, v, null, m, 16_500);
  item('Detergente líquido', 1, 'L', sClean, m, null, null, 21_900);
  item('Café molido', 500, 'g', sPantry, v, null, s);
  item('Papel higiénico', 12, 'rollos', sClean, s, 3, v, 24_600);
  item('Arroz', 2, 'kg', sPantry, m, 6, m, 8_400);
  item('Bolsas de basura', 1, 'paquete', sClean, v, 9, s, 6_900);

  db.activity.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  db.activity.forEach((a, i) => (a.id = i + 1));
  db.nextActivityId = db.activity.length + 1;
  return db;
}
