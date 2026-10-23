-- ScamShield network: the shared scam list.
-- Run this once in Supabase: SQL Editor > New query > paste everything > Run.
-- It is safe to run again (it won't duplicate anything).
--
-- What is stored: only scam clues (phone numbers, websites, emails, wallets,
-- usernames, group links), a scam category and an optional US state.
-- Nothing from the reporter's messages or Detective Report is stored.
-- Only the ScamShield server (service key) can read or write these tables.

create table if not exists public.indicators (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('phone','domain','url','email','wallet','telegram','cashtag')),
  value text not null,
  reporter_count integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (kind, value)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  case_id text,
  category text not null default 'other',
  state text,
  indicator_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.report_indicators (
  report_id bigint not null references public.reports (id) on delete cascade,
  indicator_id bigint not null references public.indicators (id) on delete cascade,
  primary key (report_id, indicator_id)
);

-- One row per person per clue, so the same person can't inflate a count.
create table if not exists public.indicator_reporters (
  indicator_id bigint not null references public.indicators (id) on delete cascade,
  user_id uuid not null,
  first_reported timestamptz not null default now(),
  primary key (indicator_id, user_id)
);

create index if not exists reports_user_time on public.reports (user_id, created_at);
create index if not exists report_indicators_indicator on public.report_indicators (indicator_id);

-- Lock the tables: no access from the apps directly, only through the server.
alter table public.indicators enable row level security;
alter table public.reports enable row level security;
alter table public.report_indicators enable row level security;
alter table public.indicator_reporters enable row level security;
revoke all on public.indicators, public.reports, public.report_indicators, public.indicator_reporters from anon, authenticated;

-- Save one shared report and its clues.
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
  return jsonb_build_object('report_id', v_report, 'indicators', v_count);
end;
$$;

-- Look clues up: how many people reported each one, since when, and as what kind of scam.
create or replace function public.lookup_indicators(p_items jsonb)
returns table (kind text, value text, reporter_count int, first_seen timestamptz, last_seen timestamptz, categories text[], states int)
language sql
stable
security definer
set search_path = public
as $$
  select i.kind, i.value, i.reporter_count, i.first_seen, i.last_seen,
         array(select distinct r.category from report_indicators ri join reports r on r.id = ri.report_id
               where ri.indicator_id = i.id and r.category is not null limit 3) as categories,
         (select count(distinct r.state)::int from report_indicators ri join reports r on r.id = ri.report_id
               where ri.indicator_id = i.id and r.state is not null) as states
  from indicators i
  join jsonb_to_recordset(p_items) as q(kind text, value text) on q.kind = i.kind and q.value = i.value;
$$;

-- Totals for the health page and the app.
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
    'states', (select count(distinct state) from reports where state is not null)
  );
$$;

revoke execute on function public.submit_report(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.lookup_indicators(jsonb) from public, anon, authenticated;
revoke execute on function public.network_stats() from public, anon, authenticated;
grant execute on function public.submit_report(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.lookup_indicators(jsonb) to service_role;
grant execute on function public.network_stats() to service_role;
