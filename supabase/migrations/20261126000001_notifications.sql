-- RoomieHub · 0006 · Push notifications
-- Devices subscribe (one row per browser/phone), each person chooses which notices to get,
-- and a scheduled Edge Function ("notify") sends them. Secrets (function URL + shared secret)
-- live in Supabase Vault, never in this file.

-- ---------------------------------------------------------------------------
-- Preferences (per person)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_daily  boolean not null default true,  -- 7:00 "today you have…"
  add column if not exists notify_due    boolean not null default true,  -- 20:00 "still pending…"
  add column if not exists notify_damage boolean not null default true;  -- new damage report

-- ---------------------------------------------------------------------------
-- Push subscriptions (per device)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  endpoint         text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh           text not null check (char_length(p256dh) <= 200),
  auth             text not null check (char_length(auth) <= 100),
  user_agent       text check (char_length(user_agent) <= 300),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_select on public.push_subscriptions;
drop policy if exists push_delete on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- writes go through save_push_subscription() only
grant select, delete on public.push_subscriptions to authenticated;
revoke insert, update on public.push_subscriptions from authenticated;
revoke all on public.push_subscriptions from anon;

-- Register (or move) a device to the current user. A phone that changes hands moves its
-- subscription to the new owner instead of failing on the unique endpoint.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery log: makes every scheduled run idempotent (one daily digest per person per day…)
-- Only the Edge Function (service role) reads/writes it.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  dedupe_key  text not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- New damage report -> call the Edge Function right away (via pg_net).
-- Never blocks or fails the insert: if anything is missing, it simply does nothing.
-- ---------------------------------------------------------------------------
create or replace function public.notify_new_damage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'roomiehub_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'roomiehub_cron_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('job', 'damage', 'report_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists maintenance_reports_notify on public.maintenance_reports;
create trigger maintenance_reports_notify
  after insert on public.maintenance_reports
  for each row execute function public.notify_new_damage();

-- ---------------------------------------------------------------------------
-- Schedules (Supabase only: needs pg_cron + pg_net). Times are UTC; Colombia is UTC-5:
--   12:00 UTC = 07:00 Bogotá (daily digest) · 01:00 UTC = 20:00 Bogotá (still pending)
-- ---------------------------------------------------------------------------
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;

    perform cron.schedule('roomiehub-daily', '0 12 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'roomiehub_notify_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
                   (select decrypted_secret from vault.decrypted_secrets where name = 'roomiehub_cron_secret')),
        body := '{"job":"daily"}'::jsonb)
    $job$);

    perform cron.schedule('roomiehub-due', '0 1 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'roomiehub_notify_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
                   (select decrypted_secret from vault.decrypted_secrets where name = 'roomiehub_cron_secret')),
        body := '{"job":"due"}'::jsonb)
    $job$);
  end if;
end;
$outer$;
