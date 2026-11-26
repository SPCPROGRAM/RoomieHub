-- RoomieHub · 0007 · Privileges for the server role
-- New Supabase projects don't grant table privileges to service_role automatically either.
-- The "notify" Edge Function uses service_role (it bypasses RLS by design, server-side only)
-- and failed with "permission denied for table chore_assignments". Safe to run more than once.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
