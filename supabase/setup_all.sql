-- RoomieHub: todas las migraciones en un solo archivo (generado). Solo para un proyecto NUEVO y vacío.

-- ===== 20261124000001_schema.sql =====
-- RoomieHub · 0001 · Schema
-- Tables, keys, constraints and indexes. Every household table carries apartment_id and
-- references its parents through COMPOSITE foreign keys (apartment_id, id) so a row can
-- never point to data from another apartment, even if a client forges ids.
-- Money is stored as BIGINT whole units of the apartment currency (COP has no cents in practice).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Human-friendly, crypto-random invitation code (10 chars, ~50 bits, no ambiguous chars).
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols
  raw bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  result text := '';
  i int := 0;
begin
  -- bytes 6 and 8 of a v4 uuid carry version/variant bits; skip them for uniform randomness
  while length(result) < 10 loop
    if i % 16 not in (6, 8) then
      result := result || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
    end if;
    i := i + 1;
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_color  text not null default 'teal'
                check (avatar_color in ('teal', 'violet', 'coral', 'amber', 'sky', 'rose', 'lime', 'slate')),
  locale        text not null default 'es' check (locale in ('es', 'en')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Apartments & membership
-- ---------------------------------------------------------------------------
create table public.apartments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  currency     text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  timezone     text not null default 'America/Bogota',
  max_members  smallint not null default 3 check (max_members between 1 and 10),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger apartments_updated_at before update on public.apartments
  for each row execute function public.set_updated_at();

-- Members are never hard-deleted while they have history: leaving sets left_at.
create table public.apartment_members (
  apartment_id  uuid not null references public.apartments (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  primary key (apartment_id, user_id)
);

create index apartment_members_user_idx on public.apartment_members (user_id) where left_at is null;

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid not null references public.apartments (id) on delete cascade,
  code          text not null unique default public.generate_invite_code()
                check (code ~ '^[A-Z0-9]{10}$'),
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  max_uses      smallint not null default 2 check (max_uses between 1 and 10),
  uses          smallint not null default 0 check (uses >= 0),
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint invitations_uses_le_max check (uses <= max_uses),
  constraint invitations_expiry_window check (expires_at <= created_at + interval '30 days')
);

create index invitations_apartment_idx on public.invitations (apartment_id);

-- ---------------------------------------------------------------------------
-- Categories (customisable per apartment and module)
-- ---------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid not null references public.apartments (id) on delete cascade,
  scope         text not null check (scope in ('chore', 'expense', 'shopping')),
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  color         text not null default 'slate'
                check (color in ('teal', 'violet', 'coral', 'amber', 'sky', 'rose', 'lime', 'slate')),
  created_at    timestamptz not null default now(),
  unique (apartment_id, id)
);

create unique index categories_unique_name on public.categories (apartment_id, scope, lower(name));

-- ---------------------------------------------------------------------------
-- Chores & weekly rotation
-- ---------------------------------------------------------------------------
create table public.chores (
  id               uuid primary key default gen_random_uuid(),
  apartment_id     uuid not null references public.apartments (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 100),
  description      text check (char_length(description) <= 500),
  category_id      uuid,
  frequency        text not null default 'weekly'
                   check (frequency in ('daily', 'twice_weekly', 'weekly', 'biweekly', 'monthly')),
  due_weekday      smallint not null default 7 check (due_weekday between 1 and 7), -- ISO: 1 = Monday
  rotation_offset  smallint not null default 0 check (rotation_offset >= 0),
  effort           smallint not null default 2 check (effort between 1 and 5),
  active           boolean not null default true,
  archived_at      timestamptz,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (apartment_id, id),
  foreign key (apartment_id, category_id) references public.categories (apartment_id, id) on delete set null (category_id)
);

create index chores_apartment_idx on public.chores (apartment_id) where archived_at is null;
create trigger chores_updated_at before update on public.chores
  for each row execute function public.set_updated_at();

create table public.rotation_settings (
  apartment_id          uuid primary key references public.apartments (id) on delete cascade,
  member_order          uuid[] not null default '{}',
  anchor_week           date not null default (date_trunc('week', now())::date),
  auto_generate         boolean not null default true,
  repetition_threshold  smallint not null default 3 check (repetition_threshold between 2 and 10),
  last_generated_week   date,
  updated_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at            timestamptz not null default now(),
  constraint rotation_anchor_is_monday check (extract(isodow from anchor_week) = 1)
);

create trigger rotation_settings_updated_at before update on public.rotation_settings
  for each row execute function public.set_updated_at();

create table public.chore_assignments (
  id                    uuid primary key default gen_random_uuid(),
  apartment_id          uuid not null references public.apartments (id) on delete cascade,
  chore_id              uuid not null,
  week_start            date not null check (extract(isodow from week_start) = 1),
  occurrence            smallint not null default 0 check (occurrence between 0 and 6),
  rotation_index        integer not null check (rotation_index >= 0),
  assignee_id           uuid not null,
  original_assignee_id  uuid not null,
  due_date              date not null,
  status                text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  completed_at          timestamptz,
  swapped_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (apartment_id, id),
  -- idempotent generation: a chore occurrence exists at most once per week
  unique (chore_id, week_start, occurrence),
  foreign key (apartment_id, chore_id) references public.chores (apartment_id, id) on delete cascade,
  foreign key (apartment_id, assignee_id) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, original_assignee_id) references public.apartment_members (apartment_id, user_id),
  constraint assignment_due_in_week check (due_date between week_start and week_start + 6),
  constraint assignment_done_has_time check (status <> 'done' or completed_at is not null)
);

create index chore_assignments_week_idx on public.chore_assignments (apartment_id, week_start);
create index chore_assignments_assignee_idx on public.chore_assignments (apartment_id, assignee_id);
create trigger chore_assignments_updated_at before update on public.chore_assignments
  for each row execute function public.set_updated_at();

create table public.chore_completions (
  id             uuid primary key default gen_random_uuid(),
  apartment_id   uuid not null references public.apartments (id) on delete cascade,
  assignment_id  uuid not null unique,
  completed_by   uuid not null default auth.uid(),
  completed_at   timestamptz not null default now(),
  note           text check (char_length(note) <= 300),
  foreign key (apartment_id, assignment_id) references public.chore_assignments (apartment_id, id) on delete cascade,
  foreign key (apartment_id, completed_by) references public.apartment_members (apartment_id, user_id)
);

create index chore_completions_apartment_idx on public.chore_completions (apartment_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- Maintenance reports (declared before expenses: repairs link to them)
-- ---------------------------------------------------------------------------
create table public.maintenance_reports (
  id              uuid primary key default gen_random_uuid(),
  apartment_id    uuid not null references public.apartments (id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  description     text check (char_length(description) <= 2000),
  location        text check (char_length(location) <= 80),
  status          text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  occurred_on     date not null default current_date,
  reported_by     uuid not null default auth.uid(),
  responsible_id  uuid,
  photo_paths     text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (apartment_id, id),
  foreign key (apartment_id, reported_by) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, responsible_id) references public.apartment_members (apartment_id, user_id)
);

create index maintenance_reports_apartment_idx on public.maintenance_reports (apartment_id, status);
create trigger maintenance_reports_updated_at before update on public.maintenance_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Finances
-- ---------------------------------------------------------------------------
create table public.expenses (
  id                     uuid primary key default gen_random_uuid(),
  apartment_id           uuid not null references public.apartments (id) on delete cascade,
  description            text not null check (char_length(btrim(description)) between 1 and 120),
  amount                 bigint not null check (amount > 0 and amount <= 1000000000000),
  category_id            uuid,
  paid_by                uuid not null,
  spent_on               date not null default current_date,
  split_mode             text not null default 'equal' check (split_mode in ('equal')),
  notes                  text check (char_length(notes) <= 500),
  maintenance_report_id  uuid,
  created_by             uuid not null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (apartment_id, id),
  foreign key (apartment_id, category_id) references public.categories (apartment_id, id) on delete set null (category_id),
  foreign key (apartment_id, paid_by) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, maintenance_report_id)
    references public.maintenance_reports (apartment_id, id) on delete set null (maintenance_report_id)
);

create index expenses_apartment_date_idx on public.expenses (apartment_id, spent_on desc);
create index expenses_report_idx on public.expenses (maintenance_report_id) where maintenance_report_id is not null;
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

create table public.expense_shares (
  expense_id    uuid not null,
  apartment_id  uuid not null,
  user_id       uuid not null,
  amount        bigint not null check (amount >= 0),
  primary key (expense_id, user_id),
  foreign key (apartment_id, expense_id) references public.expenses (apartment_id, id) on delete cascade,
  foreign key (apartment_id, user_id) references public.apartment_members (apartment_id, user_id)
);

create index expense_shares_user_idx on public.expense_shares (apartment_id, user_id);

-- Settlements are payments between roomies. They are NOT expenses, so they never
-- inflate spending statistics; they only move balances.
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid not null references public.apartments (id) on delete cascade,
  from_user     uuid not null,
  to_user       uuid not null,
  amount        bigint not null check (amount > 0 and amount <= 1000000000000),
  settled_on    date not null default current_date,
  note          text check (char_length(note) <= 300),
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint settlement_distinct_users check (from_user <> to_user),
  foreign key (apartment_id, from_user) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, to_user) references public.apartment_members (apartment_id, user_id)
);

create index settlements_apartment_idx on public.settlements (apartment_id, settled_on desc);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id                     uuid primary key default gen_random_uuid(),
  apartment_id           uuid not null references public.apartments (id) on delete cascade,
  title                  text not null check (char_length(btrim(title)) between 1 and 120),
  description            text check (char_length(description) <= 1000),
  kind                   text not null default 'event' check (kind in ('event', 'payment', 'reminder', 'maintenance')),
  starts_at              timestamptz not null,
  ends_at                timestamptz,
  all_day                boolean not null default false,
  recurrence             text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  remind_minutes_before  integer check (remind_minutes_before between 0 and 43200),
  amount                 bigint check (amount is null or amount > 0),
  visibility             text not null default 'shared' check (visibility in ('shared', 'private')),
  created_by             uuid not null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint event_end_after_start check (ends_at is null or ends_at >= starts_at),
  foreign key (apartment_id, created_by) references public.apartment_members (apartment_id, user_id)
);

create index calendar_events_range_idx on public.calendar_events (apartment_id, starts_at);
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Shopping list
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id               uuid primary key default gen_random_uuid(),
  apartment_id     uuid not null references public.apartments (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  quantity         numeric(10, 2) not null default 1 check (quantity > 0 and quantity <= 9999),
  unit             text check (char_length(unit) <= 16),
  category_id      uuid,
  status           text not null default 'pending' check (status in ('pending', 'purchased')),
  assigned_to      uuid,
  estimated_price  bigint check (estimated_price is null or estimated_price >= 0),
  notes            text check (char_length(notes) <= 300),
  added_by         uuid not null default auth.uid(),
  purchased_by     uuid,
  purchased_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint shopping_purchase_consistency check (
    (status = 'pending' and purchased_at is null) or (status = 'purchased' and purchased_at is not null)
  ),
  foreign key (apartment_id, category_id) references public.categories (apartment_id, id) on delete set null (category_id),
  foreign key (apartment_id, assigned_to) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, purchased_by) references public.apartment_members (apartment_id, user_id),
  foreign key (apartment_id, added_by) references public.apartment_members (apartment_id, user_id)
);

create index shopping_items_apartment_idx on public.shopping_items (apartment_id, status);
create trigger shopping_items_updated_at before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log (written only by triggers / security-definer code)
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id            bigint generated always as identity primary key,
  apartment_id  uuid not null references public.apartments (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  summary       text,
  changes       jsonb,
  created_at    timestamptz not null default now()
);

create index activity_logs_apartment_idx on public.activity_logs (apartment_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- ===== 20261124000002_functions.sql =====
-- RoomieHub · 0002 · Functions, RPCs and triggers

-- ---------------------------------------------------------------------------
-- Membership helpers used by RLS. SECURITY DEFINER avoids recursive RLS checks on
-- apartment_members; search_path is pinned to prevent hijacking.
-- ---------------------------------------------------------------------------
create or replace function public.is_member(p_apartment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members m
    where m.apartment_id = p_apartment
      and m.user_id = (select auth.uid())
      and m.left_at is null
  );
$$;

create or replace function public.is_owner(p_apartment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members m
    where m.apartment_id = p_apartment
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.left_at is null
  );
$$;

-- True when the current user is an active member of an apartment where p_user is (or was) a member.
create or replace function public.shares_apartment_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.apartment_members me
    join public.apartment_members other on other.apartment_id = me.apartment_id
    where me.user_id = (select auth.uid())
      and me.left_at is null
      and other.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile bootstrap on sign-up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'es');
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    left(coalesce(v_name, split_part(coalesce(new.email, 'roomie'), '@', 1), 'Roomie'), 60),
    case when v_locale in ('es', 'en') then v_locale else 'es' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Apartments & invitations
-- ---------------------------------------------------------------------------
create or replace function public.create_apartment(p_name text, p_currency text default 'COP')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.apartment_members where user_id = v_uid and left_at is null) >= 5 then
    raise exception 'too_many_apartments' using errcode = 'P0001';
  end if;

  insert into public.apartments (name, currency, created_by)
  values (btrim(p_name), upper(coalesce(p_currency, 'COP')), v_uid)
  returning id into v_id;

  insert into public.apartment_members (apartment_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.rotation_settings (apartment_id, member_order, updated_by) values (v_id, array[v_uid], v_uid);

  -- sensible default categories; fully editable afterwards
  insert into public.categories (apartment_id, scope, name, color) values
    (v_id, 'chore', 'Limpieza', 'teal'),
    (v_id, 'chore', 'Cocina', 'amber'),
    (v_id, 'chore', 'Basura y reciclaje', 'lime'),
    (v_id, 'expense', 'Arriendo', 'violet'),
    (v_id, 'expense', 'Servicios', 'sky'),
    (v_id, 'expense', 'Mercado', 'teal'),
    (v_id, 'expense', 'Internet', 'coral'),
    (v_id, 'expense', 'Reparaciones', 'rose'),
    (v_id, 'expense', 'Otros', 'slate'),
    (v_id, 'shopping', 'Despensa', 'amber'),
    (v_id, 'shopping', 'Aseo', 'sky'),
    (v_id, 'shopping', 'Frescos', 'lime');

  insert into public.activity_logs (apartment_id, actor_id, entity_type, entity_id, action, summary)
  values (v_id, v_uid, 'apartment', v_id, 'created', btrim(p_name));

  return v_id;
end;
$$;

-- What a would-be member may learn from a code before joining: the apartment name and capacity.
create or replace function public.invitation_preview(p_code text)
returns table (apartment_name text, member_count integer, max_members integer, expires_at timestamptz, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.name,
         (select count(*)::int from public.apartment_members m where m.apartment_id = a.id and m.left_at is null),
         a.max_members::int,
         i.expires_at,
         (i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses)
  from public.invitations i
  join public.apartments a on a.id = i.apartment_id
  where i.code = upper(btrim(p_code))
    and auth.uid() is not null;
$$;

create or replace function public.accept_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_active int;
  v_max int;
  v_existing public.apartment_members%rowtype;
  v_was_member boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv from public.invitations where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  select * into v_existing from public.apartment_members
  where apartment_id = v_inv.apartment_id and user_id = v_uid;
  v_was_member := found;
  if v_was_member and v_existing.left_at is null then
    return v_inv.apartment_id; -- already a member: idempotent, does not consume a use
  end if;

  if v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.uses >= v_inv.max_uses then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  select count(*), max(a.max_members) into v_active, v_max
  from public.apartment_members m join public.apartments a on a.id = m.apartment_id
  where m.apartment_id = v_inv.apartment_id and m.left_at is null;
  if v_active >= v_max then
    raise exception 'apartment_full' using errcode = 'P0001';
  end if;

  if v_was_member then
    update public.apartment_members set left_at = null, role = 'member', joined_at = now()
    where apartment_id = v_inv.apartment_id and user_id = v_uid;
  else
    insert into public.apartment_members (apartment_id, user_id, role)
    values (v_inv.apartment_id, v_uid, 'member');
  end if;

  update public.invitations set uses = uses + 1 where id = v_inv.id;

  update public.rotation_settings
  set member_order = array_append(array_remove(member_order, v_uid), v_uid), updated_by = v_uid
  where apartment_id = v_inv.apartment_id;

  return v_inv.apartment_id;
end;
$$;

create or replace function public.leave_apartment(p_apartment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_others int;
begin
  select role into v_role from public.apartment_members
  where apartment_id = p_apartment and user_id = v_uid and left_at is null;
  if v_role is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select count(*) into v_others from public.apartment_members
  where apartment_id = p_apartment and user_id <> v_uid and left_at is null;
  if v_role = 'owner' and v_others > 0 then
    raise exception 'owner_must_transfer' using errcode = 'P0001';
  end if;

  update public.apartment_members set left_at = now() where apartment_id = p_apartment and user_id = v_uid;
  update public.rotation_settings set member_order = array_remove(member_order, v_uid)
  where apartment_id = p_apartment;
end;
$$;

create or replace function public.remove_member(p_apartment uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_apartment) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;
  update public.apartment_members set left_at = now()
  where apartment_id = p_apartment and user_id = p_user and left_at is null;
  update public.rotation_settings set member_order = array_remove(member_order, p_user)
  where apartment_id = p_apartment;
  insert into public.activity_logs (apartment_id, actor_id, entity_type, entity_id, action, summary)
  values (p_apartment, auth.uid(), 'member', p_user, 'removed',
          (select display_name from public.profiles where id = p_user));
end;
$$;

create or replace function public.transfer_ownership(p_apartment uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_apartment) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.apartment_members
                 where apartment_id = p_apartment and user_id = p_user and left_at is null) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  update public.apartment_members set role = 'member' where apartment_id = p_apartment and user_id = auth.uid();
  update public.apartment_members set role = 'owner' where apartment_id = p_apartment and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chores
-- ---------------------------------------------------------------------------
-- Swap who does two pending assignments of the same week. Runs with the caller's
-- privileges, so RLS still applies.
create or replace function public.swap_assignments(p_a uuid, p_b uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.chore_assignments%rowtype;
  b public.chore_assignments%rowtype;
begin
  select * into a from public.chore_assignments where id = p_a for update;
  select * into b from public.chore_assignments where id = p_b for update;
  if a.id is null or b.id is null then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if a.apartment_id <> b.apartment_id or a.week_start <> b.week_start then
    raise exception 'swap_requires_same_week' using errcode = 'P0001';
  end if;
  if a.status <> 'pending' or b.status <> 'pending' then
    raise exception 'swap_requires_pending' using errcode = 'P0001';
  end if;
  if a.assignee_id = b.assignee_id then
    raise exception 'swap_same_person' using errcode = 'P0001';
  end if;
  update public.chore_assignments set assignee_id = b.assignee_id, swapped_at = now() where id = a.id;
  update public.chore_assignments set assignee_id = a.assignee_id, swapped_at = now() where id = b.id;
end;
$$;

-- Completing / un-completing keeps chore_assignments.status in step with chore_completions.
create or replace function public.sync_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.chore_assignments
    set status = 'done', completed_at = new.completed_at
    where id = new.assignment_id;
    return new;
  else
    update public.chore_assignments
    set status = 'pending', completed_at = null
    where id = old.assignment_id and status = 'done';
    return old;
  end if;
end;
$$;

create trigger chore_completions_sync
  after insert or delete on public.chore_completions
  for each row execute function public.sync_assignment_status();

-- ---------------------------------------------------------------------------
-- Finances
-- ---------------------------------------------------------------------------
-- Equal split in whole units. The remainder (amount mod n) is given, one unit each,
-- to the first participants in the given order, so the shares always add up exactly.
-- Mirrors splitEqually() in src/domain/money.ts (both are tested).
create or replace function public.split_equally(p_amount bigint, p_participants uuid[])
returns table (user_id uuid, amount bigint)
language sql
immutable
set search_path = ''
as $$
  select p.uid,
         (p_amount / cardinality(p_participants)) + case when p.ord <= (p_amount % cardinality(p_participants)) then 1 else 0 end
  from unnest(p_participants) with ordinality as p(uid, ord);
$$;

-- Deferred constraint: at commit, every expense's shares must sum to its amount.
create or replace function public.check_expense_shares()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_expense uuid;
  v_amount bigint;
  v_sum bigint;
begin
  v_expense := case when tg_table_name = 'expenses' then (v_row ->> 'id')::uuid
                    else (v_row ->> 'expense_id')::uuid end;
  select amount into v_amount from public.expenses where id = v_expense;
  if v_amount is null then
    return null; -- expense deleted: shares cascade
  end if;
  select coalesce(sum(amount), 0) into v_sum from public.expense_shares where expense_id = v_expense;
  if v_sum <> v_amount then
    raise exception 'expense_shares_mismatch: shares % <> amount %', v_sum, v_amount using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expense_shares_sum_check
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function public.check_expense_shares();

create constraint trigger expense_amount_sum_check
  after insert or update of amount on public.expenses
  deferrable initially deferred
  for each row execute function public.check_expense_shares();

create or replace function public.create_expense(
  p_apartment uuid,
  p_description text,
  p_amount bigint,
  p_paid_by uuid,
  p_spent_on date,
  p_participants uuid[],
  p_category uuid default null,
  p_notes text default null,
  p_maintenance_report uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_participants is null or cardinality(p_participants) = 0 then
    raise exception 'participants_required' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(p_participants) x) <> cardinality(p_participants) then
    raise exception 'participants_duplicated' using errcode = 'P0001';
  end if;

  insert into public.expenses (apartment_id, description, amount, paid_by, spent_on, category_id, notes, maintenance_report_id)
  values (p_apartment, btrim(p_description), p_amount, p_paid_by, coalesce(p_spent_on, current_date),
          p_category, nullif(btrim(p_notes), ''), p_maintenance_report)
  returning id into v_id;

  insert into public.expense_shares (expense_id, apartment_id, user_id, amount)
  select v_id, p_apartment, s.user_id, s.amount from public.split_equally(p_amount, p_participants) s;

  return v_id;
end;
$$;

create or replace function public.update_expense(
  p_expense uuid,
  p_description text,
  p_amount bigint,
  p_paid_by uuid,
  p_spent_on date,
  p_participants uuid[],
  p_category uuid default null,
  p_notes text default null,
  p_maintenance_report uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_apartment uuid;
begin
  if p_participants is null or cardinality(p_participants) = 0 then
    raise exception 'participants_required' using errcode = 'P0001';
  end if;
  select apartment_id into v_apartment from public.expenses where id = p_expense for update;
  if v_apartment is null then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  update public.expenses
  set description = btrim(p_description), amount = p_amount, paid_by = p_paid_by,
      spent_on = p_spent_on, category_id = p_category, notes = nullif(btrim(p_notes), ''),
      maintenance_report_id = p_maintenance_report
  where id = p_expense;

  delete from public.expense_shares where expense_id = p_expense;
  insert into public.expense_shares (expense_id, apartment_id, user_id, amount)
  select p_expense, v_apartment, s.user_id, s.amount from public.split_equally(p_amount, p_participants) s;
end;
$$;

-- Net balance per member: positive = the others owe them, negative = they owe.
-- security_invoker makes the view obey the caller's RLS.
create or replace view public.member_balances
with (security_invoker = true)
as
select m.apartment_id,
       m.user_id,
       coalesce(paid.total, 0) - coalesce(owed.total, 0)
         + coalesce(sent.total, 0) - coalesce(recv.total, 0) as balance
from public.apartment_members m
left join (select apartment_id, paid_by, sum(amount) total from public.expenses group by 1, 2) paid
  on paid.apartment_id = m.apartment_id and paid.paid_by = m.user_id
left join (select apartment_id, user_id, sum(amount) total from public.expense_shares group by 1, 2) owed
  on owed.apartment_id = m.apartment_id and owed.user_id = m.user_id
left join (select apartment_id, from_user, sum(amount) total from public.settlements group by 1, 2) sent
  on sent.apartment_id = m.apartment_id and sent.from_user = m.user_id
left join (select apartment_id, to_user, sum(amount) total from public.settlements group by 1, 2) recv
  on recv.apartment_id = m.apartment_id and recv.to_user = m.user_id;

-- ---------------------------------------------------------------------------
-- Maintenance: keep resolved_at coherent with status
-- ---------------------------------------------------------------------------
create or replace function public.maintenance_status_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status in ('open', 'in_progress') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger maintenance_reports_status_ts
  before insert or update of status on public.maintenance_reports
  for each row execute function public.maintenance_status_timestamps();

-- ---------------------------------------------------------------------------
-- Activity log triggers: server-side, so history cannot be skipped or forged by clients.
-- ---------------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_entity text := tg_argv[0];
  v_action text;
  v_changes jsonb;
  v_summary text;
  v_key text;
begin
  v_action := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_summary := coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'description');

  if tg_op = 'UPDATE' then
    v_changes := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'created_at') and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    if v_entity = 'chore_assignment' then
      if v_changes ? 'assignee_id' then
        v_action := 'swapped';
      else
        return null; -- status changes are logged through chore_completions
      end if;
    elsif v_changes ? 'status' then
      v_action := 'status_changed';
    end if;
  elsif v_entity = 'chore_completion' then
    v_action := case tg_op when 'INSERT' then 'completed' else 'uncompleted' end;
    select c.title into v_summary
    from public.chore_assignments a join public.chores c on c.id = a.chore_id
    where a.id = (v_row ->> 'assignment_id')::uuid;
  elsif v_entity = 'settlement' then
    v_summary := v_row ->> 'amount';
  elsif v_entity = 'member' then
    v_summary := (select display_name from public.profiles where id = (v_row ->> 'user_id')::uuid);
    v_action := case tg_op when 'INSERT' then 'joined' else v_action end;
  end if;

  if v_entity = 'chore_assignment' then
    select c.title into v_summary from public.chores c where c.id = (v_row ->> 'chore_id')::uuid;
  end if;

  -- private calendar events are not broadcast to the household feed
  if v_entity = 'calendar_event' and (v_row ->> 'visibility') = 'private' then
    return null;
  end if;

  -- when the whole apartment is being deleted, its log goes with it
  if not exists (select 1 from public.apartments where id = (v_row ->> 'apartment_id')::uuid) then
    return null;
  end if;

  insert into public.activity_logs (apartment_id, actor_id, entity_type, entity_id, action, summary, changes)
  values (
    (v_row ->> 'apartment_id')::uuid,
    auth.uid(),
    v_entity,
    case when v_entity = 'member' then (v_row ->> 'user_id')::uuid else (v_row ->> 'id')::uuid end,
    v_action,
    left(v_summary, 200),
    v_changes
  );
  return null;
end;
$$;

create trigger log_chores after insert or update or delete on public.chores
  for each row execute function public.log_activity('chore');
create trigger log_chore_assignments after update on public.chore_assignments
  for each row execute function public.log_activity('chore_assignment');
create trigger log_chore_completions after insert or delete on public.chore_completions
  for each row execute function public.log_activity('chore_completion');
create trigger log_expenses after insert or update or delete on public.expenses
  for each row execute function public.log_activity('expense');
create trigger log_settlements after insert or delete on public.settlements
  for each row execute function public.log_activity('settlement');
create trigger log_calendar_events after insert or update or delete on public.calendar_events
  for each row execute function public.log_activity('calendar_event');
create trigger log_shopping_items after insert or update or delete on public.shopping_items
  for each row execute function public.log_activity('shopping_item');
create trigger log_maintenance_reports after insert or update or delete on public.maintenance_reports
  for each row execute function public.log_activity('maintenance_report');
create trigger log_members after insert on public.apartment_members
  for each row execute function public.log_activity('member');

-- ---------------------------------------------------------------------------
-- Function privileges: RPCs are for signed-in users only.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_apartment(text, text) from public, anon;
revoke execute on function public.invitation_preview(text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.leave_apartment(uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke execute on function public.swap_assignments(uuid, uuid) from public, anon;
revoke execute on function public.create_expense(uuid, text, bigint, uuid, date, uuid[], uuid, text, uuid) from public, anon;
revoke execute on function public.update_expense(uuid, text, bigint, uuid, date, uuid[], uuid, text, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.create_apartment(text, text) to authenticated;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.leave_apartment(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.swap_assignments(uuid, uuid) to authenticated;
grant execute on function public.create_expense(uuid, text, bigint, uuid, date, uuid[], uuid, text, uuid) to authenticated;
grant execute on function public.update_expense(uuid, text, bigint, uuid, date, uuid[], uuid, text, uuid) to authenticated;

-- ===== 20261124000003_rls.sql =====
-- RoomieHub · 0003 · Row Level Security
-- Multi-tenant isolation: a user only sees and changes rows of apartments where they are an
-- ACTIVE member. The frontend is never trusted; these policies are the security boundary.

alter table public.profiles            enable row level security;
alter table public.apartments          enable row level security;
alter table public.apartment_members   enable row level security;
alter table public.invitations         enable row level security;
alter table public.categories          enable row level security;
alter table public.chores              enable row level security;
alter table public.rotation_settings   enable row level security;
alter table public.chore_assignments   enable row level security;
alter table public.chore_completions   enable row level security;
alter table public.maintenance_reports enable row level security;
alter table public.expenses            enable row level security;
alter table public.expense_shares      enable row level security;
alter table public.settlements         enable row level security;
alter table public.calendar_events     enable row level security;
alter table public.shopping_items      enable row level security;
alter table public.activity_logs       enable row level security;

-- Anonymous visitors get nothing from the data API.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_apartment_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- apartments (created only through create_apartment())
-- ---------------------------------------------------------------------------
create policy apartments_select on public.apartments for select to authenticated
  using (public.is_member(id));
create policy apartments_update on public.apartments for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy apartments_delete on public.apartments for delete to authenticated
  using (public.is_owner(id));

-- ---------------------------------------------------------------------------
-- apartment_members (joins/leaves only through RPCs)
-- ---------------------------------------------------------------------------
create policy members_select on public.apartment_members for select to authenticated
  using (public.is_member(apartment_id));

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_member(apartment_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_member(apartment_id) and created_by = (select auth.uid()) and uses = 0 and revoked_at is null);
-- Only revoking is allowed from the client; use counts are maintained by accept_invitation().
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_member(apartment_id)) with check (public.is_member(apartment_id));
revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Household tables: full CRUD for active members of the apartment.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'chores', 'chore_assignments', 'maintenance_reports', 'shopping_items'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(apartment_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(apartment_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(apartment_id)) with check (public.is_member(apartment_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_member(apartment_id))', t || '_delete', t);
  end loop;
end;
$$;

-- rotation_settings: one row per apartment, created by create_apartment()
create policy rotation_select on public.rotation_settings for select to authenticated
  using (public.is_member(apartment_id));
create policy rotation_update on public.rotation_settings for update to authenticated
  using (public.is_member(apartment_id)) with check (public.is_member(apartment_id));

-- chore_completions: you record your own completions
create policy completions_select on public.chore_completions for select to authenticated
  using (public.is_member(apartment_id));
create policy completions_insert on public.chore_completions for insert to authenticated
  with check (public.is_member(apartment_id) and completed_by = (select auth.uid()));
create policy completions_delete on public.chore_completions for delete to authenticated
  using (public.is_member(apartment_id));

-- expenses: anyone in the household may record or correct an expense; creator is stamped.
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_member(apartment_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_member(apartment_id) and created_by = (select auth.uid()));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_member(apartment_id)) with check (public.is_member(apartment_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.is_member(apartment_id));
-- Column privileges: the creator stamp and the tenant column can never be rewritten.
revoke update on public.expenses from authenticated;
grant update (description, amount, paid_by, spent_on, category_id, notes, maintenance_report_id)
  on public.expenses to authenticated;

create policy shares_select on public.expense_shares for select to authenticated
  using (public.is_member(apartment_id));
create policy shares_insert on public.expense_shares for insert to authenticated
  with check (public.is_member(apartment_id));
create policy shares_delete on public.expense_shares for delete to authenticated
  using (public.is_member(apartment_id));

-- settlements are immutable records: create or delete (to undo a mistake), never edit.
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_member(apartment_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (public.is_member(apartment_id) and created_by = (select auth.uid()));
create policy settlements_delete on public.settlements for delete to authenticated
  using (public.is_member(apartment_id) and created_by = (select auth.uid()));

-- calendar: shared events visible to the household, private ones only to their creator
create policy events_select on public.calendar_events for select to authenticated
  using (public.is_member(apartment_id) and (visibility = 'shared' or created_by = (select auth.uid())));
create policy events_insert on public.calendar_events for insert to authenticated
  with check (public.is_member(apartment_id) and created_by = (select auth.uid()));
create policy events_update on public.calendar_events for update to authenticated
  using (public.is_member(apartment_id) and (visibility = 'shared' or created_by = (select auth.uid())))
  with check (public.is_member(apartment_id));
create policy events_delete on public.calendar_events for delete to authenticated
  using (public.is_member(apartment_id) and (visibility = 'shared' or created_by = (select auth.uid())));

-- activity log: read-only for members (written by triggers)
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_member(apartment_id));
revoke insert, update, delete on public.activity_logs from authenticated;

-- ===== 20261124000004_storage_realtime.sql =====
-- RoomieHub · 0004 · Storage (maintenance photos) and Realtime

-- Extract the apartment id from an object path "<apartment_id>/<report_id>/<file>".
-- Returns null instead of raising when the path is malformed.
create or replace function public.storage_apartment_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('maintenance-photos', 'maintenance-photos', false, 5242880,
            array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "maintenance photos read" on storage.objects for select to authenticated
      using (bucket_id = 'maintenance-photos' and public.is_member(public.storage_apartment_id(name)))$p$;
    execute $p$create policy "maintenance photos insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'maintenance-photos' and public.is_member(public.storage_apartment_id(name)))$p$;
    execute $p$create policy "maintenance photos delete" on storage.objects for delete to authenticated
      using (bucket_id = 'maintenance-photos' and public.is_member(public.storage_apartment_id(name)))$p$;
  end if;
end;
$$;

-- Realtime: other roomies' changes refresh open apps. RLS applies to realtime events.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'apartment_members', 'chores', 'chore_assignments', 'chore_completions', 'expenses',
      'settlements', 'calendar_events', 'shopping_items', 'maintenance_reports', 'activity_logs'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ===== 20261125000001_grants.sql =====
-- RoomieHub · 0005 · Explicit table privileges
-- Newer Supabase projects no longer grant privileges on new public tables to the API roles
-- automatically. Grant them explicitly to signed-in users only; RLS still decides WHICH rows.
-- Safe to run more than once.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Re-apply the column/command restrictions from 0003 (a table-wide grant would widen them).
revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

revoke update on public.expenses from authenticated;
grant update (description, amount, paid_by, spent_on, category_id, notes, maintenance_report_id)
  on public.expenses to authenticated;

revoke insert, update, delete on public.activity_logs from authenticated;
revoke insert, update, delete on public.member_balances from authenticated;

-- Anonymous visitors still get nothing.
revoke all on all tables in schema public from anon;

-- Tables added by future migrations get the same baseline (they must still enable RLS).
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
