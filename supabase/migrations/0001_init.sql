-- Prop Junkies: initial database schema.
--
-- Design rules (see CLAUDE.md):
--  * A ticket is one pick: a single bet or a parlay of several legs. A parlay counts as ONE
--    result: any losing leg = a loss; every remaining leg must win for a win.
--  * Practice tickets never count toward hit rate, standing or leaderboards, and are private.
--  * Money (stakes, returns, bankroll) lives in owner-only tables and is never public.
--  * Picks can't be edited by their author once posted; every change made by the system is
--    recorded in ticket_revisions.
--  * Standing thresholds mirror src/domain/standing.ts — keep the two in sync.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table public.app_config (
  id boolean primary key default true check (id),
  -- Prototype only: lets authors grade their own legs until the sports data feed grades them.
  -- MUST be false before launch.
  allow_self_grading boolean not null default true,
  -- Prototype only: lets users "subscribe" without paying until payments exist.
  -- MUST be false before launch.
  allow_free_subscriptions boolean not null default true
);
insert into public.app_config default values;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_color text not null default '#6366f1' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.creator_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  price_cents integer not null default 999 check (price_cents between 499 and 9999),
  perks text[] not null default '{}' check (cardinality(perks) <= 10),
  updated_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.subscriptions (
  subscriber_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  started_at timestamptz not null default now(),
  primary key (subscriber_id, creator_id),
  check (subscriber_id <> creator_id)
);

-- ---------------------------------------------------------------------------
-- Picks
-- ---------------------------------------------------------------------------

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_practice boolean not null default false,
  access text not null default 'free' check (access in ('free', 'subscribers')),
  -- Whole-ticket American odds (the parlay price for multi-leg tickets).
  odds integer not null check (abs(odds) >= 100),
  units numeric(4, 2) not null check (units > 0 and units <= 5),
  analysis text not null default '' check (char_length(analysis) <= 500),
  status text not null default 'pending' check (status in ('pending', 'win', 'loss', 'push', 'void')),
  -- Earliest leg start; the ticket locks at this time.
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  graded_at timestamptz
);
create index tickets_user_idx on public.tickets (user_id, graded_at desc);
create index tickets_pending_idx on public.tickets (starts_at) where status = 'pending';

create table public.ticket_legs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  position smallint not null check (position between 0 and 14),
  sport text not null check (sport in ('NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'Soccer')),
  game text not null check (char_length(game) between 1 and 80),
  market text not null check (market in ('Spread', 'Moneyline', 'Total', 'Player Prop')),
  selection text not null check (char_length(selection) between 1 and 80),
  odds integer check (odds is null or abs(odds) >= 100),
  starts_at timestamptz not null,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'push', 'void')),
  graded_at timestamptz,
  unique (ticket_id, position)
);

create table public.ticket_revisions (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  leg_id uuid references public.ticket_legs (id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb not null
);
create index ticket_revisions_ticket_idx on public.ticket_revisions (ticket_id, changed_at);

create table public.tails (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Private money (owner-only, never public)
-- ---------------------------------------------------------------------------

create table public.ticket_money (
  ticket_id uuid primary key references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stake_cents bigint not null check (stake_cents > 0),
  returned_cents bigint check (returned_cents >= 0)
);

create table public.bankroll_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('starting', 'deposit', 'withdrawal', 'adjustment')),
  amount_cents bigint not null,
  note text not null default '' check (char_length(note) <= 300),
  at timestamptz not null default now()
);
create index bankroll_entries_user_idx on public.bankroll_entries (user_id, at);

-- ---------------------------------------------------------------------------
-- Rules (security definer so they can read every ticket when evaluating standing)
-- ---------------------------------------------------------------------------

-- Standing over the last 50 decided (win/loss) non-practice tickets; ranked after 20.
create or replace function public.leader_standing(p_user uuid)
returns table (decided integer, window_size integer, window_hit_rate numeric, status text)
language sql stable security definer set search_path = public as $$
  with d as (
    select t.status,
           row_number() over (order by t.graded_at desc nulls last, t.id) as rn,
           count(*) over () as n
    from tickets t
    where t.user_id = p_user and not t.is_practice and t.status in ('win', 'loss')
  ), agg as (
    select coalesce(max(n), 0)::int as decided,
           (count(*) filter (where rn <= 50))::int as window_size,
           (count(*) filter (where rn <= 50 and status = 'win'))::numeric
             / nullif(count(*) filter (where rn <= 50), 0) as window_hit_rate
    from d
  )
  select decided, window_size, window_hit_rate,
         case when decided < 20 or window_hit_rate is null then 'provisional'
              when window_hit_rate < 0.30 then 'suspended'
              when window_hit_rate < 0.40 then 'warning'
              else 'good' end
  from agg;
$$;

-- Creator is currently selling: subscriptions on and standing allows charging.
create or replace function public.is_selling(p_creator uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from creator_settings where user_id = p_creator), false)
     and (select status from leader_standing(p_creator)) in ('good', 'warning');
$$;

create or replace function public.is_subscribed(p_creator uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions
    where subscriber_id = auth.uid() and creator_id = p_creator and status = 'active'
  );
$$;

-- Combine leg odds into one American price (null if any leg has no odds).
create or replace function public.parlay_odds(p_odds integer[])
returns integer language sql immutable as $$
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- New sign-up → profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, handle, display_name)
  values (new.id,
          'user_' || left(replace(new.id::text, '-', ''), 10),
          coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'New member'));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- A leg result changed → recompute the ticket (parlay = one result).
create or replace function public.refresh_ticket_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select case when bool_or(result = 'loss') then 'loss'
              when bool_or(result = 'pending') then 'pending'
              when bool_or(result = 'win') then 'win'
              when bool_and(result = 'void') then 'void'
              else 'push' end
    into s
  from ticket_legs where ticket_id = new.ticket_id;

  update tickets
     set status = s,
         graded_at = case when s = 'pending' then null else now() end
   where id = new.ticket_id and status is distinct from s;
  return null;
end;
$$;
create trigger ticket_legs_refresh_status
  after update of result on public.ticket_legs
  for each row when (old.result is distinct from new.result)
  execute function public.refresh_ticket_status();

-- Keep a permanent record of every change.
create or replace function public.record_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'tickets' then
    insert into ticket_revisions (ticket_id, changed_by, before, after)
    values (new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  else
    insert into ticket_revisions (ticket_id, leg_id, changed_by, before, after)
    values (new.ticket_id, new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;
create trigger tickets_revision after update on public.tickets
  for each row when (old is distinct from new) execute function public.record_revision();
create trigger ticket_legs_revision after update on public.ticket_legs
  for each row when (old is distinct from new) execute function public.record_revision();

-- ---------------------------------------------------------------------------
-- Actions the app calls (RPC)
-- ---------------------------------------------------------------------------

-- Post a ticket with its legs in one step. Tickets can't be inserted directly.
-- p = { is_practice?, access?, odds?, units, analysis?, stake_cents?,
--       legs: [{ sport, game, market, selection, odds?, starts_at }] }
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
  if acc = 'subscribers' and not is_selling(uid) then
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

-- Prototype only (see app_config.allow_self_grading): author grades their own leg.
create or replace function public.grade_leg(p_leg uuid, p_result text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (select allow_self_grading from app_config) then
    raise exception 'Picks are graded automatically from game results';
  end if;
  if p_result not in ('pending', 'win', 'loss', 'push', 'void') then
    raise exception 'Invalid result';
  end if;
  update ticket_legs l
     set result = p_result,
         graded_at = case when p_result = 'pending' then null else now() end
    from tickets t
   where l.id = p_leg and t.id = l.ticket_id and t.user_id = auth.uid();
  if not found then raise exception 'Leg not found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public read-only views
-- ---------------------------------------------------------------------------

-- Teaser for subscriber-only picks: what game, never the selection, odds or write-up.
create view public.ticket_previews as
  select t.id, t.user_id, t.access, t.status, t.starts_at, t.created_at,
         count(l.id)::int as leg_count,
         array_agg(distinct l.sport) as sports,
         array_agg(l.game order by l.position) as games
  from public.tickets t
  join public.ticket_legs l on l.ticket_id = t.id
  where not t.is_practice
  group by t.id;

create view public.creator_public as
  select c.user_id, c.price_cents, c.perks,
         public.is_selling(c.user_id) as is_selling,
         (select count(*)::int from public.subscriptions s
           where s.creator_id = c.user_id and s.status = 'active') as subscriber_count
  from public.creator_settings c;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.creator_settings enable row level security;
alter table public.follows enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_legs enable row level security;
alter table public.ticket_revisions enable row level security;
alter table public.tails enable row level security;
alter table public.ticket_money enable row level security;
alter table public.bankroll_entries enable row level security;

create policy "config is public" on public.app_config for select using (true);

create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and verified = false);

create policy "creator settings are public" on public.creator_settings for select using (true);
create policy "create own creator settings" on public.creator_settings for insert
  with check (user_id = auth.uid());
create policy "edit own creator settings" on public.creator_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "follows are public" on public.follows for select using (true);
create policy "follow" on public.follows for insert with check (follower_id = auth.uid());
create policy "unfollow" on public.follows for delete using (follower_id = auth.uid());

create policy "see own subscriptions" on public.subscriptions for select
  using (subscriber_id = auth.uid() or creator_id = auth.uid());
create policy "subscribe (prototype, no payment)" on public.subscriptions for insert
  with check (subscriber_id = auth.uid() and status = 'active'
              and (select allow_free_subscriptions from public.app_config)
              and public.is_selling(creator_id));
create policy "cancel subscription" on public.subscriptions for delete
  using (subscriber_id = auth.uid());

-- Who can see a ticket's full details:
--   the author; or, for real (non-practice) tickets: free picks, graded picks (records are
--   always public), picks from creators who aren't selling, and the creator's subscribers.
create policy "view tickets" on public.tickets for select using (
  user_id = auth.uid()
  or (not is_practice and (
        access = 'free'
        or status <> 'pending'
        or not public.is_selling(user_id)
        or public.is_subscribed(user_id)))
);
create policy "delete own ticket before it starts" on public.tickets for delete
  using (user_id = auth.uid() and status = 'pending' and starts_at > now());

create policy "view legs of visible tickets" on public.ticket_legs for select
  using (exists (select 1 from public.tickets t where t.id = ticket_id));

create policy "view revisions of visible tickets" on public.ticket_revisions for select
  using (exists (select 1 from public.tickets t where t.id = ticket_id));

create policy "tails are public" on public.tails for select using (true);
create policy "tail a visible open pick" on public.tails for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.tickets t
              where t.id = ticket_id and t.user_id <> auth.uid()
                and t.status = 'pending' and t.starts_at > now() and not t.is_practice)
);
create policy "untail" on public.tails for delete using (user_id = auth.uid());

create policy "own ticket money" on public.ticket_money for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create policy "own bankroll" on public.bankroll_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (RLS above decides which rows)
-- ---------------------------------------------------------------------------

-- Supabase grants everything by default; start from nothing and allow only what's listed.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.app_config, public.profiles, public.creator_settings, public.follows,
  public.tickets, public.ticket_legs, public.ticket_revisions, public.tails,
  public.ticket_previews, public.creator_public to anon, authenticated;
grant update (handle, display_name, bio, avatar_color) on public.profiles to authenticated;
grant insert, update on public.creator_settings to authenticated;
grant insert, delete on public.follows, public.tails to authenticated;
grant select, insert, delete on public.subscriptions to authenticated;
grant delete on public.tickets to authenticated;
grant select, insert, update, delete on public.ticket_money, public.bankroll_entries to authenticated;
grant usage on all sequences in schema public to authenticated;

revoke execute on function public.post_ticket(jsonb), public.grade_leg(uuid, text) from public, anon;
grant execute on function public.post_ticket(jsonb), public.grade_leg(uuid, text) to authenticated;
revoke execute on function public.handle_new_user(), public.refresh_ticket_status(),
  public.record_revision() from public, anon, authenticated;
