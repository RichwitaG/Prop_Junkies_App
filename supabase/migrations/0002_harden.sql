-- Tighten security per the Supabase security advisor.
--  * Helper functions used by row rules move to a "private" schema the web API doesn't expose,
--    so they can't be called directly as endpoints.
--  * Public views run with the caller's permissions; the few things they need to look past
--    row rules for (teaser info, subscriber counts) go through narrow private functions.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---- helpers -------------------------------------------------------------

create or replace function private.is_selling(p_creator uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.enabled from public.creator_settings c where c.user_id = p_creator), false)
     and (select s.status from public.leader_standing(p_creator) s) in ('good', 'warning');
$$;

create or replace function private.is_subscribed(p_creator uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.subscriber_id = (select auth.uid()) and s.creator_id = p_creator and s.status = 'active'
  );
$$;

create or replace function private.subscriber_count(p_creator uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.subscriptions s
  where s.creator_id = p_creator and s.status = 'active';
$$;

-- Teaser rows for every real ticket: never the selection, odds or write-up.
create or replace function private.ticket_preview_rows()
returns table (id uuid, user_id uuid, access text, status text, starts_at timestamptz,
               created_at timestamptz, leg_count integer, sports text[], games text[])
language sql stable security definer set search_path = '' as $$
  select t.id, t.user_id, t.access, t.status, t.starts_at, t.created_at,
         count(l.id)::int, array_agg(distinct l.sport), array_agg(l.game order by l.position)
  from public.tickets t
  join public.ticket_legs l on l.ticket_id = t.id
  where not t.is_practice
  group by t.id;
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated;

create or replace function public.parlay_odds(p_odds integer[])
returns integer language sql immutable set search_path = '' as $$
  with dec as (
    select exp(sum(ln(case when o > 0 then 1 + o / 100.0 else 1 + 100.0 / abs(o) end))) as d,
           bool_or(o is null) as missing
    from unnest(p_odds) as o
  )
  select case when missing or d is null then null
              when d >= 2 then round((d - 1) * 100)::int
              else round(-100 / (d - 1))::int end
  from dec;
$$;

-- ---- rules now use the private helpers ------------------------------------

drop policy "view tickets" on public.tickets;
create policy "view tickets" on public.tickets for select using (
  user_id = (select auth.uid())
  or (not is_practice and (
        access = 'free'
        or status <> 'pending'
        or not private.is_selling(user_id)
        or private.is_subscribed(user_id)))
);

drop policy "subscribe (prototype, no payment)" on public.subscriptions;
create policy "subscribe (prototype, no payment)" on public.subscriptions for insert
  with check (subscriber_id = (select auth.uid()) and status = 'active'
              and (select allow_free_subscriptions from public.app_config)
              and private.is_selling(creator_id));

create or replace function public.post_ticket(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  n int := jsonb_array_length(coalesce(p -> 'legs', '[]'::jsonb));
  first_start timestamptz;
  acc text := coalesce(p ->> 'access', 'free');
  practice boolean := coalesce((p ->> 'is_practice')::boolean, false);
  price int;
begin
  if uid is null then raise exception 'Sign in to post picks'; end if;
  if n < 1 or n > 15 then raise exception 'A ticket needs between 1 and 15 legs'; end if;
  if not practice and (select status from leader_standing(uid)) = 'suspended' then
    raise exception 'Suspended leaders cannot post picks';
  end if;
  if acc = 'subscribers' and not private.is_selling(uid) then
    raise exception 'Turn on subscriptions to post subscriber-only picks';
  end if;

  select min((l ->> 'starts_at')::timestamptz) into first_start
  from jsonb_array_elements(p -> 'legs') as l;
  if first_start is null or first_start <= now() then
    raise exception 'Picks must be posted before the game starts';
  end if;

  price := coalesce((p ->> 'odds')::int,
                    case when n = 1 then (p -> 'legs' -> 0 ->> 'odds')::int
                         else parlay_odds(array(select (l ->> 'odds')::int
                                                from jsonb_array_elements(p -> 'legs') as l)) end);
  if price is null then raise exception 'Enter the ticket odds'; end if;

  insert into tickets (user_id, is_practice, access, odds, units, analysis, starts_at)
  values (uid, practice, acc, price, (p ->> 'units')::numeric, coalesce(p ->> 'analysis', ''), first_start)
  returning id into tid;

  insert into ticket_legs (ticket_id, position, sport, game, market, selection, odds, starts_at)
  select tid, (x.ord - 1)::smallint, x.l ->> 'sport', x.l ->> 'game', x.l ->> 'market',
         x.l ->> 'selection', (x.l ->> 'odds')::int, (x.l ->> 'starts_at')::timestamptz
  from jsonb_array_elements(p -> 'legs') with ordinality as x (l, ord);

  if p ? 'stake_cents' then
    insert into ticket_money (ticket_id, user_id, stake_cents)
    values (tid, uid, (p ->> 'stake_cents')::bigint);
  end if;

  return tid;
end;
$$;

-- ---- views run as the caller ----------------------------------------------

drop view public.ticket_previews;
create view public.ticket_previews with (security_invoker = true) as
  select * from private.ticket_preview_rows();

drop view public.creator_public;
create view public.creator_public with (security_invoker = true) as
  select c.user_id, c.price_cents, c.perks,
         private.is_selling(c.user_id) as is_selling,
         private.subscriber_count(c.user_id) as subscriber_count
  from public.creator_settings c;

grant select on public.ticket_previews, public.creator_public to anon, authenticated;

drop function public.is_selling(uuid);
drop function public.is_subscribed(uuid);
