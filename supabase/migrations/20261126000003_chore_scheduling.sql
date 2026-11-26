-- RoomieHub · 0008 · Flexible chore scheduling
--   frequency 'custom_days'  -> specific weekdays (e.g. Mon/Wed/Fri = "día por medio")
--   rotation_mode 'weekly'          -> same person for the whole cycle (original behaviour)
--                 'per_occurrence'  -> each occurrence goes to the next person ("hoy yo, mañana otro")
--                 'fixed'           -> always the same person (fixed_assignee_id)
-- Existing chores keep working unchanged (defaults). Safe to run more than once.

alter table public.chores
  add column if not exists schedule_days smallint[] not null default '{}',
  add column if not exists rotation_mode text not null default 'weekly',
  add column if not exists fixed_assignee_id uuid;

alter table public.chores drop constraint if exists chores_frequency_check;
alter table public.chores add constraint chores_frequency_check
  check (frequency in ('daily', 'twice_weekly', 'weekly', 'biweekly', 'monthly', 'custom_days'));

alter table public.chores drop constraint if exists chores_rotation_mode_check;
alter table public.chores add constraint chores_rotation_mode_check
  check (rotation_mode in ('weekly', 'per_occurrence', 'fixed'));

alter table public.chores drop constraint if exists chores_schedule_days_check;
alter table public.chores add constraint chores_schedule_days_check
  check (
    schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and (frequency <> 'custom_days' or cardinality(schedule_days) between 1 and 7)
  );

alter table public.chores drop constraint if exists chores_fixed_assignee_check;
alter table public.chores add constraint chores_fixed_assignee_check
  check (rotation_mode <> 'fixed' or fixed_assignee_id is not null);

alter table public.chores drop constraint if exists chores_fixed_assignee_fkey;
alter table public.chores add constraint chores_fixed_assignee_fkey
  foreign key (apartment_id, fixed_assignee_id) references public.apartment_members (apartment_id, user_id);
