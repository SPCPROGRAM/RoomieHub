// Supabase Edge Function "notify" (Deno). Sends Web Push notifications.
//   POST {"job":"daily"}                 — 07:00 Bogotá, called by pg_cron   (header x-cron-secret)
//   POST {"job":"due"}                   — 20:00 Bogotá, called by pg_cron   (header x-cron-secret)
//   POST {"job":"damage","report_id":…}  — on new damage report, DB trigger (header x-cron-secret)
//   POST {"job":"test"}                  — from the app, signed-in user      (Authorization: Bearer <user JWT>)
// Secrets (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {
  addDays,
  buildDailyDigest,
  buildDamageNotice,
  buildDueReminder,
  dedupeKey,
  localDate,
  testMessage,
  type Locale,
  type Message,
  type PendingItem,
  type Recipient,
} from './logic.ts';

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
};

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type ProfileRow = { id: string; locale: Locale; display_name: string; notify_daily: boolean; notify_due: boolean; notify_damage: boolean };

/** Send one message to every device of a user; drop subscriptions the push service says are gone. */
async function sendToUser(userId: string, message: Message): Promise<number> {
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 6 * 3600, urgency: 'normal' });
      sent++;
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', status, (e as Error).message);
    }
  }
  return sent;
}

/** Send each message at most once per (user, key): the delivery log makes cron re-runs harmless. */
async function deliver(messages: Map<string, Message>, keyFor: (userId: string) => string) {
  let users = 0;
  for (const [userId, message] of messages) {
    // no device yet: don't mark it as delivered, so a phone enabled later today still gets it
    const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (!count) continue;
    const { data, error } = await admin
      .from('notification_deliveries')
      .upsert({ user_id: userId, dedupe_key: keyFor(userId) }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
      .select('user_id');
    if (error || !data?.length) continue; // already sent
    if ((await sendToUser(userId, message)) > 0) users++;
  }
  return users;
}

/** Pending chore turns between two dates for active chores, with active assignees. */
async function pendingItems(from: string, to: string): Promise<PendingItem[]> {
  const { data, error } = await admin
    .from('chore_assignments')
    .select('assignee_id, due_date, apartment_id, chore:chores!inner(title, archived_at, active)')
    .eq('status', 'pending')
    .gte('due_date', from)
    .lte('due_date', to);
  if (error) throw error;
  type Row = { assignee_id: string; due_date: string; chore: { title: string; archived_at: string | null; active: boolean } };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.chore.archived_at === null && r.chore.active)
    .map((r) => ({ assignee_id: r.assignee_id, due_date: r.due_date, chore_title: r.chore.title }));
}

async function recipients(userIds: string[], flag: 'notify_daily' | 'notify_due' | 'notify_damage'): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const { data } = await admin.from('profiles').select('id, locale, notify_daily, notify_due, notify_damage').in('id', userIds);
  return ((data ?? []) as ProfileRow[]).filter((p) => p[flag] !== false).map((p) => ({ user_id: p.id, locale: p.locale === 'en' ? 'en' : 'es' }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { job?: string; report_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  try {
    // --- signed-in user asks for a test notification
    if (body.job === 'test') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ error: 'unauthorized' }, 401);
      const { data: profile } = await admin.from('profiles').select('locale').eq('id', data.user.id).maybeSingle();
      const sent = await sendToUser(data.user.id, testMessage(profile?.locale === 'en' ? 'en' : 'es'));
      return json({ sent });
    }

    // --- everything else is internal (cron / DB trigger)
    if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'unauthorized' }, 401);

    const today = localDate(new Date());

    if (body.job === 'daily' || body.job === 'due') {
      const items = await pendingItems(body.job === 'daily' ? addDays(today, -6) : today, today);
      const people = [...new Set(items.map((i) => i.assignee_id))];
      if (body.job === 'daily') {
        const messages = buildDailyDigest(items, await recipients(people, 'notify_daily'), today);
        return json({ job: 'daily', users: await deliver(messages, () => dedupeKey('daily', today)) });
      }
      const messages = buildDueReminder(items, await recipients(people, 'notify_due'), today);
      return json({ job: 'due', users: await deliver(messages, () => dedupeKey('due', today)) });
    }

    if (body.job === 'damage' && body.report_id) {
      const { data: report } = await admin.from('maintenance_reports').select('id, title, reported_by, priority, apartment_id').eq('id', body.report_id).maybeSingle();
      if (!report) return json({ error: 'not_found' }, 404);
      const { data: members } = await admin.from('apartment_members').select('user_id').eq('apartment_id', report.apartment_id).is('left_at', null);
      const { data: reporter } = await admin.from('profiles').select('display_name').eq('id', report.reported_by).maybeSingle();
      const people = (members ?? []).map((m: { user_id: string }) => m.user_id);
      const messages = buildDamageNotice(report, reporter?.display_name ?? 'RoomieHub', await recipients(people, 'notify_damage'));
      return json({ job: 'damage', users: await deliver(messages, () => dedupeKey('damage', report.id)) });
    }

    return json({ error: 'unknown_job' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'internal' }, 500);
  }
});

