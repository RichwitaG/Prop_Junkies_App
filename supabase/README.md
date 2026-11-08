# Database (Supabase)

Project: `prop-junkies` · `https://bhdipbiapkafegmpljpa.supabase.co`

- `migrations/` — schema, applied in order. Applied so far: `0001_init.sql`, `0002_harden.sql`.
- `tests/rules_test.sql` — creates throwaway users, checks every rule (parlays, practice picks,
  locked picks, private money, suspension, who can grade/post), then rolls everything back.

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

Set both prototype switches in `app_config` to `false`:
- `allow_self_grading` — authors grading their own picks (replace with automatic grading from the sports data feed)
- `allow_free_subscriptions` — subscribing without paying (replace with real payments)
