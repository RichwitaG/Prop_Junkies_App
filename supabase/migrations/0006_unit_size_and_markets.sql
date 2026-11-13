-- Private unit size (units are worked out from the dollar wager), a higher units cap,
-- and extra markets plus an "Other" catch-all.

-- Owner-only personal settings. Never shown to anyone else.
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  unit_size_cents bigint check (unit_size_cents between 100 and 100000000),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- A big play can be several units (e.g. $1,000 at 1u = $150 is 6.67u).
alter table public.tickets drop constraint tickets_units_check;
alter table public.tickets add constraint tickets_units_check check (units > 0 and units <= 25);

alter table public.ticket_legs drop constraint ticket_legs_market_check;
alter table public.ticket_legs add constraint ticket_legs_market_check check (market in (
  'Spread', 'Moneyline', 'Total', 'Player Prop',
  'Set Spread', 'Total Sets', 'Total Games', 'Game Spread',
  'Outright Winner', 'Top 5', 'Top 10', 'Top 20', 'Head-to-Head',
  'Method of Victory', 'Total Rounds',
  'Both Teams to Score', 'Double Chance', 'Draw No Bet', 'Half / Period', 'Game Prop',
  'Set Betting', 'Round Betting', 'Other'));
