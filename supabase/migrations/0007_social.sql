-- Social on tickets: like/dislike (public counts), comments, reposts, saves, plus report and block.
-- Practice tickets get none of this, and nobody can interact with a ticket they can't see.

create table public.ticket_reactions (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

create table public.ticket_reposts (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table public.ticket_saves (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table public.comment_reports (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.ticket_comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Can the signed-in user interact with this ticket? (visible to them and not practice)
-- Runs as the caller, so the tickets row rules decide visibility.
create or replace function private.can_interact(p_ticket uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.tickets t where t.id = p_ticket and not t.is_practice);
$$;

-- Public counts for every real ticket, including locked ones (counts never reveal the pick).
create or replace function private.ticket_social_counts()
returns table (ticket_id uuid, likes integer, dislikes integer, comments integer, reposts integer)
language sql stable security definer set search_path = '' as $$
  select t.id,
         (select count(*)::int from public.ticket_reactions r where r.ticket_id = t.id and r.kind = 'like'),
         (select count(*)::int from public.ticket_reactions r where r.ticket_id = t.id and r.kind = 'dislike'),
         (select count(*)::int from public.ticket_comments c where c.ticket_id = t.id),
         (select count(*)::int from public.ticket_reposts p where p.ticket_id = t.id)
  from public.tickets t
  where not t.is_practice;
$$;
revoke execute on all functions in schema private from public;
grant execute on function private.can_interact(uuid), private.ticket_social_counts() to anon, authenticated;
-- (earlier private helpers keep their existing grants)
grant execute on function private.is_selling(uuid), private.is_subscribed(uuid), private.subscriber_count(uuid),
  private.ticket_preview_rows() to anon, authenticated;

create view public.ticket_social with (security_invoker = true) as
  select * from private.ticket_social_counts();

alter table public.ticket_reactions enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_reposts enable row level security;
alter table public.ticket_saves enable row level security;
alter table public.comment_reports enable row level security;
alter table public.user_blocks enable row level security;

create policy "see own reactions" on public.ticket_reactions for select using (user_id = (select auth.uid()));
create policy "react" on public.ticket_reactions for insert
  with check (user_id = (select auth.uid()) and private.can_interact(ticket_id));
create policy "change reaction" on public.ticket_reactions for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove reaction" on public.ticket_reactions for delete using (user_id = (select auth.uid()));

create policy "read comments on visible tickets" on public.ticket_comments for select
  using (private.can_interact(ticket_id));
create policy "comment" on public.ticket_comments for insert
  with check (user_id = (select auth.uid()) and private.can_interact(ticket_id));
-- Authors delete their own comments; creators can clean up comments on their tickets.
create policy "delete comment" on public.ticket_comments for delete using (
  user_id = (select auth.uid())
  or exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
);

create policy "reposts are public" on public.ticket_reposts for select using (true);
create policy "repost" on public.ticket_reposts for insert with check (
  user_id = (select auth.uid()) and private.can_interact(ticket_id)
  and not exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
);
create policy "undo repost" on public.ticket_reposts for delete using (user_id = (select auth.uid()));

create policy "own saves" on public.ticket_saves for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "report a comment" on public.comment_reports for insert
  with check (reporter_id = (select auth.uid()));

create policy "own blocks" on public.user_blocks for all
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

revoke all on public.ticket_reactions, public.ticket_comments, public.ticket_reposts, public.ticket_saves,
  public.comment_reports, public.user_blocks from anon, authenticated;
grant select on public.ticket_comments, public.ticket_reposts, public.ticket_social to anon, authenticated;
grant select, insert, update, delete on public.ticket_reactions to authenticated;
grant insert, delete on public.ticket_comments, public.ticket_reposts to authenticated;
grant select, insert, delete on public.ticket_saves, public.user_blocks to authenticated;
grant insert on public.comment_reports to authenticated;
