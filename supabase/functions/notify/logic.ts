// Pure logic for the "notify" Edge Function: no Deno/network APIs, so it is unit-tested with Vitest
// (tests/unit/notifyLogic.test.ts) and imported by index.ts at runtime.

export type Locale = 'es' | 'en';

export interface Message {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PendingItem {
  assignee_id: string;
  chore_title: string;
  due_date: string; // YYYY-MM-DD
}

export interface Recipient {
  user_id: string;
  locale: Locale;
}

/** Calendar date (YYYY-MM-DD) in a time zone, e.g. Colombia. */
export function localDate(now: Date, timeZone = 'America/Bogota'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function listTitles(titles: string[], locale: Locale, max = 4): string {
  const unique = [...new Set(titles)];
  const shown = unique.slice(0, max);
  const rest = unique.length - shown.length;
  const more = rest > 0 ? (locale === 'en' ? ` and ${rest} more` : ` y ${rest} más`) : '';
  return shown.join(', ') + more;
}

/**
 * 07:00 digest: what each person has due today, plus anything still pending from the last
 * 6 days. People with nothing pending get NO notification (silence is the default).
 */
export function buildDailyDigest(items: PendingItem[], recipients: Recipient[], today: string): Map<string, Message> {
  const result = new Map<string, Message>();
  const from = addDays(today, -6);
  for (const r of recipients) {
    const mine = items.filter((i) => i.assignee_id === r.user_id && i.due_date <= today && i.due_date >= from);
    if (mine.length === 0) continue;
    const dueToday = mine.filter((i) => i.due_date === today).map((i) => i.chore_title);
    const overdue = mine.filter((i) => i.due_date < today).map((i) => i.chore_title);
    const es = r.locale !== 'en';
    const parts: string[] = [];
    if (dueToday.length) parts.push(listTitles(dueToday, r.locale));
    if (overdue.length) parts.push((es ? 'Atrasadas: ' : 'Overdue: ') + listTitles(overdue, r.locale, 3));
    result.set(r.user_id, {
      title: dueToday.length ? (es ? 'Hoy te toca' : 'Today you have') : es ? 'Tienes tareas atrasadas' : 'You have overdue chores',
      body: parts.join(' · '),
      url: '/chores',
      tag: `daily-${today}`,
    });
  }
  return result;
}

/** 20:00 reminder: only chores due TODAY that are still pending (there is still time to do them). */
export function buildDueReminder(items: PendingItem[], recipients: Recipient[], today: string): Map<string, Message> {
  const result = new Map<string, Message>();
  for (const r of recipients) {
    const mine = items.filter((i) => i.assignee_id === r.user_id && i.due_date === today).map((i) => i.chore_title);
    if (mine.length === 0) continue;
    const es = r.locale !== 'en';
    result.set(r.user_id, {
      title: es ? 'Aún pendiente' : 'Still pending',
      body: (es ? 'Antes de terminar el día: ' : 'Before the day ends: ') + listTitles(mine, r.locale),
      url: '/chores',
      tag: `due-${today}`,
    });
  }
  return result;
}

/** New damage report: everyone in the apartment except the person who reported it. */
export function buildDamageNotice(
  report: { id: string; title: string; reported_by: string; priority: string },
  reporterName: string,
  recipients: Recipient[],
): Map<string, Message> {
  const result = new Map<string, Message>();
  for (const r of recipients) {
    if (r.user_id === report.reported_by) continue;
    const es = r.locale !== 'en';
    const urgent = report.priority === 'urgent' || report.priority === 'high';
    result.set(r.user_id, {
      title: urgent ? (es ? 'Daño importante reportado' : 'Important damage reported') : es ? 'Nuevo reporte de daño' : 'New damage report',
      body: `${reporterName}: ${report.title}`,
      url: '/maintenance',
      tag: `damage-${report.id}`,
    });
  }
  return result;
}

export function testMessage(locale: Locale): Message {
  return locale === 'en'
    ? { title: 'Notifications are on', body: 'RoomieHub will notify you on this device.', url: '/settings', tag: 'test' }
    : { title: 'Notificaciones activadas', body: 'RoomieHub te avisará en este dispositivo.', url: '/settings', tag: 'test' };
}

/** Key stored in notification_deliveries so each notice is sent at most once per person. */
export function dedupeKey(job: 'daily' | 'due' | 'damage', ref: string): string {
  return `${job}:${ref}`;
}
