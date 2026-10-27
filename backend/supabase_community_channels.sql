-- CashCow Community: one community with channels, shared by every CashCow app.
-- Run once in Supabase (SQL Editor > New query > paste > Run), AFTER
-- supabase_community.sql. Safe to run again.
-- Existing ScamShield posts become the "Scam Watch" channel; posts that were
-- tagged "App feedback" move to the "App Feedback" channel.

alter table public.community_posts add column if not exists channel text not null default 'scam';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_channel_check') then
    alter table public.community_posts add constraint community_posts_channel_check
      check (channel in ('general','scam','food','remedies','money','feedback'));
  end if;
end $$;
create index if not exists community_posts_channel on public.community_posts (channel, id desc);

-- One-time move of old "App feedback" posts (only ones still in Scam Watch).
update public.community_posts set channel = 'feedback' where topic = 'feedback' and channel = 'scam';

-- Lists now filter by channel (null = every channel).
drop function if exists public.community_list(uuid, boolean, text, bigint, int);
create or replace function public.community_list(p_viewer uuid, p_admin boolean, p_channel text, p_topic text, p_before bigint, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'channel', p.channel, 'topic', p.topic, 'title', p.title,
      'preview', left(p.body, 180), 'author', m.display_name, 'team', m.is_team,
      'replies', p.reply_count, 'created_at', p.created_at, 'last_activity', p.last_activity,
      'mine', p.user_id = p_viewer, 'hidden', p.hidden, 'needs_review', p.needs_review,
      'flags', case when p_admin then p.flag_count else null end
    ) as x
    from community_posts p join community_members m on m.user_id = p.user_id
    where (p_channel is null or p.channel = p_channel)
      and (p_topic is null or p.topic = p_topic)
      and (p_before is null or p.id < p_before)
      and (p_admin or not p.hidden or p.user_id = p_viewer)
    order by p.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) t;
$$;

create or replace function public.community_thread(p_viewer uuid, p_admin boolean, p_post bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'post', jsonb_build_object(
      'id', p.id, 'channel', p.channel, 'topic', p.topic, 'title', p.title, 'body', p.body, 'author', m.display_name, 'team', m.is_team,
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

-- New posts go into a channel.
drop function if exists public.community_post(uuid, text, text, text, boolean);
create or replace function public.community_post(p_user uuid, p_channel text, p_topic text, p_title text, p_body text, p_review boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from community_members where user_id = p_user) then raise exception 'not_member'; end if;
  if exists (select 1 from community_members where user_id = p_user and banned) then raise exception 'banned'; end if;
  if (select count(*) from community_posts where user_id = p_user and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into community_posts (user_id, channel, topic, title, body, hidden, needs_review)
  values (p_user, p_channel, p_topic, p_title, p_body, p_review, p_review) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.community_review_queue()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'channel', p.channel, 'title', p.title, 'body', left(p.body, 400),
                'author', m.display_name, 'flags', p.flag_count, 'created_at', p.created_at) order by p.id desc), '[]'::jsonb)
              from community_posts p join community_members m on m.user_id = p.user_id where p.needs_review),
    'replies', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'post_id', r.post_id, 'body', left(r.body, 400),
                'author', m.display_name, 'flags', r.flag_count, 'created_at', r.created_at) order by r.id desc), '[]'::jsonb)
              from community_replies r join community_members m on m.user_id = r.user_id where r.needs_review)
  );
$$;

revoke execute on function public.community_list(uuid, boolean, text, text, bigint, int) from public, anon, authenticated;
revoke execute on function public.community_post(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.community_list(uuid, boolean, text, text, bigint, int) to service_role;
grant execute on function public.community_post(uuid, text, text, text, text, boolean) to service_role;
