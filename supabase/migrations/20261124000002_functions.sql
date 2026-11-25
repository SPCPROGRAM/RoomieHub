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
