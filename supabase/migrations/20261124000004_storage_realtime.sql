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
