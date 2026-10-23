-- ScamShield community room: a members-only space for tips, scams people
-- spotted, questions and app feedback.
-- Run this once in Supabase (SQL Editor > New query > paste > Run).
-- Safe to run again.
--
-- Only the ScamShield server (secret key) can read or write these tables.
-- Members are shown by the display name they pick, never by email.

create table if not exists public.community_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  is_team boolean not null default false,
  banned boolean not null default false,
  joined_at timestamptz not null default now()
);
create unique index if not exists community_members_name on public.community_members (lower(display_name));

create table if not exists public.community_posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.community_members (user_id) on delete cascade,
  topic text not null default 'tips' check (topic in ('tips','spotted','question','feedback')),
  title text not null,
  body text not null,
  hidden boolean not null default false,
  needs_review boolean not null default false,
  flag_count integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index if not exists community_posts_recent on public.community_posts (id desc);
create index if not exists community_posts_user_time on public.community_posts (user_id, created_at);

create table if not exists public.community_replies (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.community_members (user_id) on delete cascade,
  body text not null,
  hidden boolean not null default false,
  needs_review boolean not null default false,
  flag_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_replies_post on public.community_replies (post_id, id);
create index if not exists community_replies_user_time on public.community_replies (user_id, created_at);

-- One flag per person per post or reply.
create table if not exists public.community_flags (
  kind text not null check (kind in ('post','reply')),
  target_id bigint not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (kind, target_id, user_id)
);

alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_flags enable row level security;
revoke all on public.community_members, public.community_posts, public.community_replies, public.community_flags
  from anon, authenticated;

-- Who am I in the community? Null when not joined yet.
create or replace function public.community_me(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('display_name', display_name, 'is_team', is_team, 'banned', banned)
  from community_members where user_id = p_user;
$$;

-- Join, or change display name.
create or replace function public.community_join(p_user uuid, p_name text, p_team boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from community_members where lower(display_name) = lower(p_name) and user_id <> p_user) then
    raise exception 'name_taken';
  end if;
  insert into community_members (user_id, display_name, is_team) values (p_user, p_name, p_team)
  on conflict (user_id) do update set display_name = excluded.display_name, is_team = excluded.is_team;
  return community_me(p_user);
end;
$$;

-- A page of posts, newest first. Hidden posts are shown only to their author and the team.
create or replace function public.community_list(p_viewer uuid, p_admin boolean, p_topic text, p_before bigint, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'topic', p.topic, 'title', p.title,
      'preview', left(p.body, 180), 'author', m.display_name, 'team', m.is_team,
      'replies', p.reply_count, 'created_at', p.created_at, 'last_activity', p.last_activity,
      'mine', p.user_id = p_viewer, 'hidden', p.hidden, 'needs_review', p.needs_review,
      'flags', case when p_admin then p.flag_count else null end
    ) as x
    from community_posts p join community_members m on m.user_id = p.user_id
    where (p_topic is null or p.topic = p_topic)
      and (p_before is null or p.id < p_before)
      and (p_admin or not p.hidden or p.user_id = p_viewer)
    order by p.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) t;
$$;

-- One post with its replies.
create or replace function public.community_thread(p_viewer uuid, p_admin boolean, p_post bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'post', jsonb_build_object(
      'id', p.id, 'topic', p.topic, 'title', p.title, 'body', p.body, 'author', m.display_name, 'team', m.is_team,
      'created_at', p.created_at, 'mine', p.user_id = p_viewer, 'hidden', p.hidden, 'needs_review', p.needs_review,
      'flagged', exists (select 1 from community_flags f where f.kind = 'post' and f.target_id = p.id and f.user_id = p_viewer),
      'flags', case when p_admin then p.flag_count else null end),
    'replies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'body', r.body, 'author', rm.display_name, 'team', rm.is_team, 'created_at', r.created_at,
        'mine', r.user_id = p_viewer, 'hidden', r.hidden, 'needs_review', r.needs_review,
        'flagged', exists (select 1 from community_flags f where f.kind = 'reply' and f.target_id = r.id and f.user_id = p_viewer),
        'flags', case when p_admin then r.flag_count else null end) order by r.id), '[]'::jsonb)
      from community_replies r join community_members rm on rm.user_id = r.user_id
      where r.post_id = p.id and (p_admin or not r.hidden or r.user_id = p_viewer))
  )
  from community_posts p join community_members m on m.user_id = p.user_id
  where p.id = p_post and (p_admin or not p.hidden or p.user_id = p_viewer);
$$;

-- New post. Limit: 5 posts a day per member.
create or replace function public.community_post(p_user uuid, p_topic text, p_title text, p_body text, p_review boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from community_members where user_id = p_user) then raise exception 'not_member'; end if;
  if exists (select 1 from community_members where user_id = p_user and banned) then raise exception 'banned'; end if;
  if (select count(*) from community_posts where user_id = p_user and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into community_posts (user_id, topic, title, body, hidden, needs_review)
  values (p_user, p_topic, p_title, p_body, p_review, p_review) returning id into v_id;
  return v_id;
end;
$$;

-- New reply. Limit: 30 replies a day per member.
create or replace function public.community_reply(p_user uuid, p_post bigint, p_body text, p_review boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from community_members where user_id = p_user) then raise exception 'not_member'; end if;
  if exists (select 1 from community_members where user_id = p_user and banned) then raise exception 'banned'; end if;
  if not exists (select 1 from community_posts where id = p_post and not hidden) then raise exception 'not_found'; end if;
  if (select count(*) from community_replies where user_id = p_user and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into community_replies (post_id, user_id, body, hidden, needs_review)
  values (p_post, p_user, p_body, p_review, p_review) returning id into v_id;
  if not p_review then
    update community_posts set reply_count = reply_count + 1, last_activity = now() where id = p_post;
  end if;
  return v_id;
end;
$$;

-- Flag a post or reply. Three flags from different members hide it until the team reviews it.
create or replace function public.community_flag(p_user uuid, p_kind text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows int; v_count int;
begin
  insert into community_flags (kind, target_id, user_id) values (p_kind, p_id, p_user) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if p_kind = 'post' then
    update community_posts set flag_count = flag_count + v_rows where id = p_id returning flag_count into v_count;
    if v_count >= 3 then update community_posts set hidden = true, needs_review = true where id = p_id; end if;
  else
    update community_replies set flag_count = flag_count + v_rows where id = p_id returning flag_count into v_count;
    if v_count >= 3 then
      update community_replies set hidden = true, needs_review = true where id = p_id and not hidden;
      if found then
        update community_posts set reply_count = greatest(0, reply_count - 1)
        where id = (select post_id from community_replies where id = p_id);
      end if;
    end if;
  end if;
  return jsonb_build_object('flags', coalesce(v_count, 0));
end;
$$;

-- Team: hide or show a post or reply (showing also clears its flags).
create or replace function public.community_moderate(p_kind text, p_id bigint, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_was boolean; v_post bigint;
begin
  if p_kind = 'post' then
    update community_posts set hidden = p_hidden, needs_review = false,
      flag_count = case when p_hidden then flag_count else 0 end where id = p_id;
    if not p_hidden then delete from community_flags where kind = 'post' and target_id = p_id; end if;
  else
    select hidden, post_id into v_was, v_post from community_replies where id = p_id;
    update community_replies set hidden = p_hidden, needs_review = false,
      flag_count = case when p_hidden then flag_count else 0 end where id = p_id;
    if not p_hidden then delete from community_flags where kind = 'reply' and target_id = p_id; end if;
    if v_was is distinct from p_hidden then
      update community_posts set reply_count = greatest(0, reply_count + case when p_hidden then -1 else 1 end)
      where id = v_post;
    end if;
  end if;
end;
$$;

-- Delete your own post or reply (the team can delete anything).
create or replace function public.community_delete(p_user uuid, p_admin boolean, p_kind text, p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_post bigint; v_hidden boolean;
begin
  if p_kind = 'post' then
    delete from community_posts where id = p_id and (p_admin or user_id = p_user);
    delete from community_flags where kind = 'post' and target_id = p_id;
    return found;
  end if;
  delete from community_replies where id = p_id and (p_admin or user_id = p_user) returning post_id, hidden into v_post, v_hidden;
  if v_post is null then return false; end if;
  delete from community_flags where kind = 'reply' and target_id = p_id;
  if not v_hidden then
    update community_posts set reply_count = greatest(0, reply_count - 1) where id = v_post;
  end if;
  return true;
end;
$$;

-- Team: stop (or allow) the author of a post or reply from posting.
create or replace function public.community_ban(p_kind text, p_id bigint, p_banned boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if p_kind = 'post' then select user_id into v_user from community_posts where id = p_id;
  else select user_id into v_user from community_replies where id = p_id; end if;
  if v_user is null then return false; end if;
  update community_members set banned = p_banned where user_id = v_user and not is_team;
  if p_banned then
    update community_posts set hidden = true where user_id = v_user;
    update community_replies set hidden = true where user_id = v_user;
    update community_posts p set reply_count = (select count(*) from community_replies r where r.post_id = p.id and not r.hidden);
  end if;
  return true;
end;
$$;

-- Team: everything waiting for review (flagged three times, or held by the safety check).
create or replace function public.community_review_queue()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'body', left(p.body, 400),
                'author', m.display_name, 'flags', p.flag_count, 'created_at', p.created_at) order by p.id desc), '[]'::jsonb)
              from community_posts p join community_members m on m.user_id = p.user_id where p.needs_review),
    'replies', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'post_id', r.post_id, 'body', left(r.body, 400),
                'author', m.display_name, 'flags', r.flag_count, 'created_at', r.created_at) order by r.id desc), '[]'::jsonb)
              from community_replies r join community_members m on m.user_id = r.user_id where r.needs_review)
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'community_me(uuid)', 'community_join(uuid, text, boolean)',
    'community_list(uuid, boolean, text, bigint, int)', 'community_thread(uuid, boolean, bigint)',
    'community_post(uuid, text, text, text, boolean)', 'community_reply(uuid, bigint, text, boolean)',
    'community_flag(uuid, text, bigint)', 'community_moderate(text, bigint, boolean)',
    'community_delete(uuid, boolean, text, bigint)', 'community_ban(text, bigint, boolean)',
    'community_review_queue()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
