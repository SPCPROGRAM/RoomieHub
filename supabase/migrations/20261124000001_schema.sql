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
