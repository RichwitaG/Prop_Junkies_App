-- Demo fix: never date demo tickets, comments or reactions in the future.
do $$
declare src text;
begin
  select pg_get_functiondef('private.demo_make_ticket(uuid, timestamptz, boolean)'::regprocedure) into src;
  src := replace(src, 'st, p_starts, p_starts - make_interval(hours => 2 + floor(random() * 20)::int),',
                      'st, p_starts, least(now() - make_interval(mins => floor(random() * 90)::int), p_starts - make_interval(hours => 2 + floor(random() * 20)::int)),');
  if position('least(now()' in src) = 0 then raise exception 'demo_make_ticket not updated'; end if;
  execute src;

  select pg_get_functiondef('private.demo_social(uuid)'::regprocedure) into src;
  src := replace(src, 'least(t.starts_at, t.created_at + make_interval(mins => 5 + floor(random() * 120)::int))',
                      'least(now(), t.starts_at, t.created_at + make_interval(mins => 5 + floor(random() * 120)::int))');
  src := replace(src, 't.created_at + interval ''20 minutes''', 'least(now(), t.created_at + interval ''20 minutes'')');
  src := replace(src, 't.created_at + interval ''30 minutes''', 'least(now(), t.created_at + interval ''30 minutes'')');
  if position('least(now(), t.starts_at' in src) = 0 then raise exception 'demo_social not updated'; end if;
  execute src;
end $$;

update public.tickets set created_at = now() - interval '1 hour' where created_at > now();
update public.ticket_comments set created_at = now() - make_interval(mins => floor(random() * 50)::int) where created_at > now();
update public.ticket_reactions set created_at = now() - interval '30 minutes' where created_at > now();
update public.ticket_reposts set created_at = now() - interval '30 minutes' where created_at > now();
