# Database (Supabase)

Project: `prop-junkies` · `https://bhdipbiapkafegmpljpa.supabase.co`

- `migrations/` — schema, applied in order. Applied so far: `0001_init.sql`, `0002_harden.sql`, `0003_demo_accounts.sql`, `0004_more_sports.sql`, `0005_ticket_scanning.sql`.
- `seed/demo_seed.sql` — 11 DEMO bettors with ~4 months of history (applied). An hourly job (`demo-tick`) grades
  their finished picks and posts new ones so the feed stays alive.
- `tests/rules_test.sql` — creates throwaway users, checks every rule (parlays, practice picks,
  locked picks, private money, suspension, who can grade/post), then rolls everything back.

## Ticket scanning (`functions/scan-slip`)

A Supabase Edge Function that reads 1–8 screenshots of one ticket with Claude (`claude-opus-5-5`) and returns the
legs for the user to review. It never posts and never stores the screenshots.

- Needs the secret `ANTHROPIC_API_KEY` (Supabase → Edge Functions → Secrets).
- Signed-in users only; 25 scans per user per 24 hours (logged in `scan_usage` with token counts).
- `sports.json` is generated from `src/domain/sports.ts` — run `npx vite-node scripts/gen-scan-sports.ts` after
  changing sports or markets (a test fails if they drift).
- Deploy: `POST https://api.supabase.com/v1/projects/bhdipbiapkafegmpljpa/functions/deploy?slug=scan-slip` (multipart:
  `metadata` + `index.ts` + `sports.json`).

## What's in it

| Table | Who can see it |
| --- | --- |
| `profiles`, `creator_settings`, `follows`, `tails` | Everyone |
| `tickets`, `ticket_legs`, `ticket_revisions` | Author always. Others: free picks, all graded picks, and subscriber picks if subscribed. Practice picks: author only. |
| `ticket_previews` (view) | Everyone — game and sport only for locked picks, never the pick itself |
| `subscriptions` | The subscriber and the creator |
| `ticket_money`, `bankroll_entries` | Owner only. Signed-out visitors are denied outright. |

Picks are created only through `post_ticket()` and graded only through `grade_leg()`; nobody can
edit or insert ticket rows directly. Every change is written to `ticket_revisions`.

## Before launch

Remove the demo community and its hourly job:

```sql
select private.scrub_demo();
```

Set both prototype switches in `app_config` to `false`:
- `allow_self_grading` — authors grading their own picks (replace with automatic grading from the sports data feed)
- `allow_free_subscriptions` — subscribing without paying (replace with real payments)
