-- Demo accounts react to, comment on and repost each other's tickets (removed with scrub_demo()).

create or replace function private.demo_social(p_ticket uuid)
returns void language plpgsql volatile set search_path = '' as $$
declare
  t record;
  lines text[] := array[
    'Tailing 🔥', 'Lock it in', 'Fade.', 'Bold call', 'Hammer it 🔨', 'Nah I''m on the other side',
    'Book it', 'Let''s ride', 'Already tailed', 'You''ve been cold lately…', 'Love this number', 'Pass on this one',
    'Sweat incoming 😅', 'Cash it', 'Free money', 'Line moved already', 'Too much juice for me', 'Riding with you'];
begin
  select k.id, k.user_id, k.created_at, k.starts_at into t from public.tickets k where k.id = p_ticket;

  insert into public.ticket_reactions (ticket_id, user_id, kind, created_at)
  select t.id, d.user_id, case when random() < 0.82 then 'like' else 'dislike' end, t.created_at + interval '20 minutes'
  from private.demo_personas d where d.user_id <> t.user_id and random() < 0.55
  on conflict do nothing;

  insert into public.ticket_comments (ticket_id, user_id, body, created_at)
  select t.id, d.user_id, lines[1 + floor(random() * cardinality(lines))],
         least(t.starts_at, t.created_at + make_interval(mins => 5 + floor(random() * 120)::int))
  from private.demo_personas d where d.user_id <> t.user_id and random() < 0.18;

  insert into public.ticket_reposts (ticket_id, user_id, created_at)
  select t.id, d.user_id, t.created_at + interval '30 minutes'
  from private.demo_personas d where d.user_id <> t.user_id and random() < 0.07
  on conflict do nothing;
end;
$$;
revoke execute on function private.demo_social(uuid) from public, anon, authenticated;

-- Hourly job: also give new demo tickets some social activity.
do $$
declare src text;
begin
  select pg_get_functiondef('private.demo_tick()'::regprocedure) into src;
  if position('demo_social' in src) = 0 then
    src := regexp_replace(src, E'\\nend;\\s*\\$function\\$\\s*$',
      E'\n  perform private.demo_social(k.id) from public.tickets k\n    join private.demo_personas p on p.user_id = k.user_id\n   where not k.is_practice and k.created_at > now() - interval ''3 hours''\n     and not exists (select 1 from public.ticket_reactions r where r.ticket_id = k.id)\n     and not exists (select 1 from public.ticket_comments c where c.ticket_id = k.id);\nend;\n$function$');
    if position('demo_social' in src) = 0 then raise exception 'demo_tick not updated'; end if;
    execute src;
  end if;
end $$;

-- Backfill existing demo tickets.
select private.demo_social(k.id) from public.tickets k join private.demo_personas p on p.user_id = k.user_id
where not k.is_practice;
