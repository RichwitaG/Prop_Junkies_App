-- More sports, sport-specific markets, and a league for "all leagues" sports.
-- Keep in sync with src/domain/sports.ts.

alter table public.ticket_legs drop constraint ticket_legs_sport_check;
alter table public.ticket_legs drop constraint ticket_legs_market_check;

-- College basketball splits into men's and women's.
update public.ticket_legs set sport = 'NCAAM' where sport = 'NCAAB';
update private.demo_personas set sports = array_replace(sports, 'NCAAB', 'NCAAM');

alter table public.ticket_legs add constraint ticket_legs_sport_check check (sport in (
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAM', 'NCAAW', 'WNBA',
  'Soccer', 'Basketball', 'Ice Hockey', 'Tennis', 'Golf', 'UFC', 'Boxing', 'Table Tennis'));

alter table public.ticket_legs add constraint ticket_legs_market_check check (market in (
  'Spread', 'Moneyline', 'Total', 'Player Prop',
  'Set Spread', 'Total Sets', 'Total Games', 'Game Spread',
  'Outright Winner', 'Top 5', 'Top 10', 'Top 20', 'Head-to-Head',
  'Method of Victory', 'Total Rounds'));

alter table public.ticket_legs add column league text check (char_length(league) between 1 and 60);

-- post_ticket: accept a league per leg.
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

  insert into ticket_legs (ticket_id, position, sport, league, game, market, selection, odds, starts_at)
  select tid, (x.ord - 1)::smallint, x.l ->> 'sport', nullif(trim(x.l ->> 'league'), ''), x.l ->> 'game',
         x.l ->> 'market', x.l ->> 'selection', (x.l ->> 'odds')::int, (x.l ->> 'starts_at')::timestamptz
  from jsonb_array_elements(p -> 'legs') with ordinality as x (l, ord);

  if p ? 'stake_cents' then
    insert into ticket_money (ticket_id, user_id, stake_cents)
    values (tid, uid, (p ->> 'stake_cents')::bigint);
  end if;

  return tid;
end;
$$;

-- Demo generator: NCAAB is now NCAAM.
do $$
declare src text;
begin
  select pg_get_functiondef('private.demo_leg(text, text[], boolean)'::regprocedure) into src;
  execute replace(src, 'when ''NCAAB'' then', 'when ''NCAAM'' then');
end $$;
