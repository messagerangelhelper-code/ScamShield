-- ScamShield connection engine: links scam clues into operations.
-- Run this once in Supabase (SQL Editor > New query > paste > Run), AFTER
-- supabase_network.sql. Safe to run again.
--
-- How it works: clues reported in the same case are linked. Linked clues form
-- one "operation". When a new report shares any clue with an operation, its
-- other clues join that operation too, and operations that touch are merged.

alter table public.indicators add column if not exists operation_id bigint;
create index if not exists indicators_operation on public.indicators (operation_id);

-- Rebuilds every operation from scratch (used once now, and after any cleanup).
create or replace function public.rebuild_operations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer;
begin
  update indicators set operation_id = id;
  loop
    update indicators i set operation_id = s.m
    from (
      select ri1.indicator_id as iid, min(i2.operation_id) as m
      from report_indicators ri1
      join report_indicators ri2 on ri2.report_id = ri1.report_id
      join indicators i2 on i2.id = ri2.indicator_id
      group by ri1.indicator_id
    ) s
    where i.id = s.iid and s.m < i.operation_id;
    get diagnostics v_changed = row_count;
    exit when v_changed = 0;
  end loop;
  return (select count(distinct operation_id) from indicators);
end;
$$;

-- Joins one report's clues into an operation (merging operations if needed).
create or replace function public.link_report(p_report bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target bigint;
begin
  select least(min(i.id), min(i.operation_id)) into v_target
  from report_indicators ri join indicators i on i.id = ri.indicator_id
  where ri.report_id = p_report;
  if v_target is null then
    return null;
  end if;
  update indicators set operation_id = v_target
  where id in (select indicator_id from report_indicators where report_id = p_report)
     or operation_id in (
       select i.operation_id from report_indicators ri join indicators i on i.id = ri.indicator_id
       where ri.report_id = p_report and i.operation_id is not null
     );
  return v_target;
end;
$$;

-- Same as before, plus linking the new report into an operation.
create or replace function public.submit_report(
  p_user uuid, p_case text, p_category text, p_state text, p_indicators jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report bigint;
  v_item jsonb;
  v_ind bigint;
  v_rows int;
  v_count int := 0;
  v_op bigint;
begin
  if (select count(*) from reports where user_id = p_user and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into reports (user_id, case_id, category, state)
  values (p_user, nullif(p_case, ''), coalesce(nullif(p_category, ''), 'other'), nullif(p_state, ''))
  returning id into v_report;

  for v_item in select * from jsonb_array_elements(coalesce(p_indicators, '[]'::jsonb)) loop
    insert into indicators (kind, value)
    values (v_item->>'kind', left(v_item->>'value', 300))
    on conflict (kind, value) do update set last_seen = now()
    returning id into v_ind;

    insert into report_indicators (report_id, indicator_id) values (v_report, v_ind) on conflict do nothing;

    insert into indicator_reporters (indicator_id, user_id) values (v_ind, p_user)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      update indicators set reporter_count = reporter_count + 1 where id = v_ind;
    end if;
    v_count := v_count + 1;
  end loop;

  update reports set indicator_count = v_count where id = v_report;
  v_op := link_report(v_report);
  return jsonb_build_object('report_id', v_report, 'indicators', v_count, 'operation_id', v_op);
end;
$$;

-- Summary of one operation: what it's made of and how widely it's been reported.
create or replace function public.operation_summary(p_op bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ind as (select * from indicators where operation_id = p_op),
       rep as (select distinct r.* from reports r join report_indicators ri on ri.report_id = r.id
               where ri.indicator_id in (select id from ind))
  select jsonb_build_object(
    'operation_id', p_op,
    'clues', (select count(*) from ind),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from ind group by kind) k),
    'reports', (select count(*) from rep),
    'reporters', (select count(distinct user_id) from rep),
    'states', (select count(distinct state) from rep where state is not null),
    'categories', (select coalesce(jsonb_agg(category order by n desc), '[]'::jsonb)
                   from (select category, count(*) n from rep group by category) c),
    'first_seen', (select min(first_seen) from ind),
    'last_seen', (select max(last_seen) from ind)
  );
$$;

-- Lookup now also returns the operation each clue belongs to.
drop function if exists public.lookup_indicators(jsonb);
create or replace function public.lookup_indicators(p_items jsonb)
returns table (kind text, value text, reporter_count int, first_seen timestamptz, last_seen timestamptz,
               categories text[], states int, operation jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select i.kind, i.value, i.reporter_count, i.first_seen, i.last_seen,
         array(select distinct r.category from report_indicators ri join reports r on r.id = ri.report_id
               where ri.indicator_id = i.id and r.category is not null limit 3) as categories,
         (select count(distinct r.state)::int from report_indicators ri join reports r on r.id = ri.report_id
               where ri.indicator_id = i.id and r.state is not null) as states,
         case when (select count(*) from indicators o where o.operation_id = i.operation_id) > 1
              then operation_summary(i.operation_id) else null end as operation
  from indicators i
  join jsonb_to_recordset(p_items) as q(kind text, value text) on q.kind = i.kind and q.value = i.value;
$$;

-- The biggest operations, for the owner's view (and the enterprise dashboard later).
create or replace function public.top_operations(p_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(op order by (op->>'reporters')::int desc, (op->>'clues')::int desc), '[]'::jsonb)
  from (
    select operation_summary(operation_id) ||
           jsonb_build_object('members', (select jsonb_agg(jsonb_build_object('kind', kind, 'value', value, 'reporters', reporter_count) order by reporter_count desc)
                                          from indicators x where x.operation_id = g.operation_id)) as op
    from (select operation_id from indicators where operation_id is not null
          group by operation_id having count(*) > 1
          order by count(*) desc limit greatest(1, least(p_limit, 100))) g
  ) t;
$$;

revoke execute on function public.rebuild_operations() from public, anon, authenticated;
revoke execute on function public.link_report(bigint) from public, anon, authenticated;
revoke execute on function public.submit_report(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.operation_summary(bigint) from public, anon, authenticated;
revoke execute on function public.lookup_indicators(jsonb) from public, anon, authenticated;
revoke execute on function public.top_operations(int) from public, anon, authenticated;
grant execute on function public.rebuild_operations() to service_role;
grant execute on function public.link_report(bigint) to service_role;
grant execute on function public.submit_report(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.operation_summary(bigint) to service_role;
grant execute on function public.lookup_indicators(jsonb) to service_role;
grant execute on function public.top_operations(int) to service_role;

-- Totals now include how many operations have been found.
create or replace function public.network_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'indicators', (select count(*) from indicators),
    'reports', (select count(*) from reports),
    'reporters', (select count(distinct user_id) from reports),
    'states', (select count(distinct state) from reports where state is not null),
    'operations', (select count(*) from (select operation_id from indicators where operation_id is not null
                                         group by operation_id having count(*) > 1) o)
  );
$$;
revoke execute on function public.network_stats() from public, anon, authenticated;
grant execute on function public.network_stats() to service_role;

-- Link everything already reported.
select public.rebuild_operations();
