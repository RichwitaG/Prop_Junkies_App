-- Demo accounts so the app doesn't look empty before launch.
-- Every demo profile has is_demo = true and shows a DEMO tag in the app.
-- Remove all of them (and stop the hourly job) with:  select private.scrub_demo();

alter table public.profiles add column is_demo boolean not null default false;

-- How each demo persona bets. Private: not reachable through the web API.
create table private.demo_personas (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Chance each leg wins.
  leg_skill numeric not null,
  sports text[] not null,
  markets text[] not null,
  -- Chance a ticket is a parlay.
  parlay_rate numeric not null default 0.05,
  -- Open picks to keep in the feed; 0 = never posts new picks.
  target_open integer not null default 2,
  -- Prefers plus-money prices.
  underdog boolean not null default false
);

-- One random leg in a persona's style.
create or replace function private.demo_leg(p_sport text, p_markets text[], p_underdog boolean)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  teams text[];
  props text[];
  spreads text[];
  total text;
  a text; h text; side text; mkt text; sel text; game text; o int;
begin
  case p_sport
    when 'NFL' then
      teams := '{Eagles,Cowboys,Chiefs,Bills,49ers,Rams,Lions,Packers,Ravens,Bengals,Steelers,Jets}';
      props := '{"QB o1.5 Pass TD","WR1 o74.5 Rec Yds","RB1 Anytime TD","RB1 o69.5 Rush Yds","TE1 o4.5 Rec"}';
      spreads := '{-3.5,+3.5,-6.5,+6.5,-1.5,+2.5,-7,+7}'; total := (array['41.5','44.5','47.5','49.5'])[1 + floor(random() * 4)];
    when 'NCAAF' then
      teams := '{Georgia,Alabama,"Ohio State",Michigan,Texas,Oregon,LSU,"Penn State"}';
      props := '{"QB o249.5 Pass Yds","RB1 Anytime TD","QB o2.5 Total TD"}';
      spreads := '{-7.5,+7.5,-3,+3,-10.5,+10.5}'; total := (array['48.5','52.5','55.5'])[1 + floor(random() * 3)];
    when 'NBA' then
      teams := '{Celtics,Knicks,Nuggets,Lakers,Thunder,Mavericks,Bucks,Heat,Warriors,Suns,Cavaliers,76ers}';
      props := '{"star o27.5 Pts","PG o8.5 Ast","C o11.5 Reb","star o2.5 3PM","wing o24.5 PRA"}';
      spreads := '{-4.5,+4.5,-2.5,+2.5,-7.5,+7.5,-1.5}'; total := (array['218.5','222.5','226.5','231.5'])[1 + floor(random() * 4)];
    when 'NCAAB' then
      teams := '{Duke,UNC,Kansas,Kentucky,UConn,Gonzaga,Houston,Purdue}';
      props := '{"Guard o18.5 Pts","Big o9.5 Reb"}';
      spreads := '{-5.5,+5.5,-2.5,+2.5,-8.5,+8.5}'; total := (array['138.5','142.5','147.5'])[1 + floor(random() * 3)];
    when 'MLB' then
      teams := '{Yankees,"Red Sox",Dodgers,Padres,Braves,Phillies,Astros,Mariners,Orioles,Cubs}';
      props := '{"Starter o6.5 K","Slugger o1.5 Total Bases","Leadoff o0.5 Runs","Slugger to Homer"}';
      spreads := '{-1.5,+1.5}'; total := (array['7.5','8.5','9.5'])[1 + floor(random() * 3)];
    when 'NHL' then
      teams := '{Oilers,Avalanche,Rangers,Bruins,Panthers,"Maple Leafs",Stars,"Golden Knights",Jets,Hurricanes}';
      props := '{"Center o1.5 Pts","Winger o3.5 SOG","Goalie o28.5 Saves","Winger Anytime Goal"}';
      spreads := '{-1.5,+1.5}'; total := (array['5.5','6.5'])[1 + floor(random() * 2)];
    else -- Soccer
      teams := '{Arsenal,Liverpool,"Man City",Chelsea,"Real Madrid",Barcelona,Inter,"Bayern Munich",PSG,Tottenham}';
      props := '{"Striker Anytime Goal","Winger o1.5 SOT","Both Teams To Score"}';
      spreads := '{-0.5,+0.5,-1.5,+1.5}'; total := '2.5';
  end case;

  a := teams[1 + floor(random() * cardinality(teams))];
  loop
    h := teams[1 + floor(random() * cardinality(teams))];
    exit when h <> a;
  end loop;
  game := a || case when p_sport = 'Soccer' then ' vs ' else ' @ ' end || h;
  side := case when random() < 0.5 then a else h end;
  mkt := p_markets[1 + floor(random() * cardinality(p_markets))];

  if mkt = 'Spread' then
    sel := side || ' ' || spreads[1 + floor(random() * cardinality(spreads))];
    o := (array[-110, -110, -105, -115, -120, 100])[1 + floor(random() * 6)];
  elsif mkt = 'Moneyline' then
    sel := side || ' ML';
    o := case when p_underdog or random() < 0.4 then (array[115, 130, 145, 160, 185, 210])[1 + floor(random() * 6)]
              else (array[-125, -140, -155, -175, -200])[1 + floor(random() * 5)] end;
  elsif mkt = 'Total' then
    sel := (case when random() < 0.5 then 'Over ' else 'Under ' end) || total;
    o := (array[-110, -110, -105, -115, -120])[1 + floor(random() * 5)];
  else
    sel := props[1 + floor(random() * cardinality(props))];
    if sel not like 'Both%' then sel := side || ' ' || sel; end if;
    o := case when p_underdog then (array[120, 150, 175, 220, 260])[1 + floor(random() * 5)]
              else (array[-115, -125, -110, 105, 120])[1 + floor(random() * 5)] end;
  end if;

  return jsonb_build_object('sport', p_sport, 'game', game, 'market', mkt, 'selection', sel, 'odds', o);
end;
$$;

-- Create one demo ticket. Graded tickets get their results immediately.
create or replace function private.demo_make_ticket(p_user uuid, p_starts timestamptz, p_graded boolean)
returns uuid language plpgsql volatile set search_path = '' as $$
declare
  per private.demo_personas;
  n int;
  legs jsonb := '[]'::jsonb;
  leg jsonb;
  r text;
  st text;
  tid uuid;
  i int;
  acc text := 'free';
  notes text[] := array[
    'Line moved since open — sharp money agrees.', 'Matchup edge here. Lean into the volume.',
    'Back-to-back spot for the other side.', 'Model has this a couple points off the market.',
    'Injury report is a mess for the other side.', 'Weather is pushing this one.',
    'Pace-up spot, both teams play fast.', 'Buy-low spot after a bad week.', '', '', ''];
begin
  select * into per from private.demo_personas where user_id = p_user;
  n := case when random() < per.parlay_rate then 2 + floor(random() * 3)::int else 1 end;

  for i in 1..n loop
    leg := private.demo_leg(per.sports[1 + floor(random() * cardinality(per.sports))], per.markets, per.underdog);
    r := case when not p_graded then 'pending'
              when random() < 0.03 then 'push'
              when random() < per.leg_skill then 'win' else 'loss' end;
    legs := legs || jsonb_build_array(leg || jsonb_build_object('result', r));
  end loop;

  st := case when not p_graded then 'pending'
             when exists (select 1 from jsonb_array_elements(legs) l where l ->> 'result' = 'loss') then 'loss'
             when exists (select 1 from jsonb_array_elements(legs) l where l ->> 'result' = 'win') then 'win'
             else 'push' end;

  if (select enabled from public.creator_settings where user_id = p_user) and random() < 0.6 then
    acc := 'subscribers';
  end if;

  insert into public.tickets (user_id, access, odds, units, analysis, status, starts_at, created_at, graded_at)
  values (
    p_user, acc,
    case when n = 1 then (legs -> 0 ->> 'odds')::int
         else public.parlay_odds(array(select (l ->> 'odds')::int from jsonb_array_elements(legs) l)) end,
    (array[0.5, 1, 1, 1, 1.5, 2])[1 + floor(random() * 6)],
    notes[1 + floor(random() * cardinality(notes))],
    st, p_starts, p_starts - make_interval(hours => 2 + floor(random() * 20)::int),
    case when p_graded then p_starts + interval '3 hours' end)
  returning id into tid;

  insert into public.ticket_legs (ticket_id, position, sport, game, market, selection, odds, starts_at, result, graded_at)
  select tid, (x.ord - 1)::smallint, x.l ->> 'sport', x.l ->> 'game', x.l ->> 'market', x.l ->> 'selection',
         (x.l ->> 'odds')::int, p_starts, x.l ->> 'result',
         case when p_graded then p_starts + interval '3 hours' end
  from jsonb_array_elements(legs) with ordinality as x (l, ord);

  -- A few other demo accounts tail it.
  insert into public.tails (ticket_id, user_id, created_at)
  select tid, d.user_id, p_starts - interval '1 hour'
  from private.demo_personas d
  where d.user_id <> p_user and random() < 0.25;

  return tid;
end;
$$;

-- Hourly: grade finished demo picks and keep a few open demo picks in the feed.
create or replace function private.demo_tick()
returns void language plpgsql volatile set search_path = '' as $$
declare
  t record;
  per record;
  open_count int;
begin
  for t in
    select l.id as leg_id, p.leg_skill
    from public.ticket_legs l
    join public.tickets k on k.id = l.ticket_id
    join private.demo_personas p on p.user_id = k.user_id
    where l.result = 'pending' and l.starts_at < now() - interval '3 hours'
  loop
    update public.ticket_legs
       set result = case when random() < 0.03 then 'push' when random() < t.leg_skill then 'win' else 'loss' end,
           graded_at = now()
     where id = t.leg_id;
  end loop;

  for per in select * from private.demo_personas where target_open > 0 loop
    continue when (select s.status from public.leader_standing(per.user_id) s) = 'suspended';
    select count(*) into open_count from public.tickets
     where user_id = per.user_id and status = 'pending' and starts_at > now();
    while open_count < per.target_open loop
      perform private.demo_make_ticket(per.user_id, now() + make_interval(hours => 3 + floor(random() * 45)::int), false);
      open_count := open_count + 1;
    end loop;
  end loop;
end;
$$;

-- Delete every demo account and everything they posted, and stop the hourly job.
create or replace function private.scrub_demo()
returns integer language plpgsql volatile set search_path = '' as $$
declare n int;
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'demo-tick';
  delete from auth.users where id in (select id from public.profiles where is_demo);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.demo_leg(text, text[], boolean), private.demo_make_ticket(uuid, timestamptz, boolean),
  private.demo_tick(), private.scrub_demo() from public, anon, authenticated;

revoke all on private.demo_personas from public, anon, authenticated;

create extension if not exists pg_cron;
