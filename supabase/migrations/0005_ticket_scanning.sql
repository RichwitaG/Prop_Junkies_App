-- Ticket scanning: longer parlays and a per-user scan log (for daily limits and cost tracking).

-- Parlays up to 25 legs (sportsbooks commonly allow 20–25).
alter table public.ticket_legs drop constraint ticket_legs_position_check;
alter table public.ticket_legs add constraint ticket_legs_position_check check (position between 0 and 24);

do $$
declare src text;
begin
  select pg_get_functiondef('public.post_ticket(jsonb)'::regprocedure) into src;
  src := replace(src, 'if n < 1 or n > 15 then raise exception ''A ticket needs between 1 and 15 legs''',
                      'if n < 1 or n > 25 then raise exception ''A ticket needs between 1 and 25 legs''');
  if position('n > 25' in src) = 0 then raise exception 'post_ticket not updated'; end if;
  execute src;
end $$;

-- One row per scan. Written only by the scan-slip server function; users can read their own.
-- Screenshots themselves are never stored.
create table public.scan_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  images integer not null,
  ok boolean not null,
  input_tokens integer,
  output_tokens integer
);
create index scan_usage_user_idx on public.scan_usage (user_id, created_at desc);
alter table public.scan_usage enable row level security;
create policy "see own scans" on public.scan_usage for select using (user_id = (select auth.uid()));
revoke all on public.scan_usage from anon, authenticated;
grant select on public.scan_usage to authenticated;
