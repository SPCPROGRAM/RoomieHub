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
