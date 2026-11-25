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
