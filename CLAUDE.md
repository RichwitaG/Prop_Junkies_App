# Working with Rich on Prop Junkies

- Whenever something goes wrong or needs fixing (deploys, GitHub, errors, settings), include a short
  "In plain English" explanation of what happened and how the fix works, written so a 5th grader
  could follow it. Use everyday comparisons, avoid jargon, keep it to a few sentences.
- Live site: https://richwitag.github.io/Prop_Junkies_App/ (rebuilt automatically on every push by
  .github/workflows/deploy.yml).

## Product decisions (agreed with Rich)

- Prop Junkies is the base app; BETSCAN (Rich's partner's app, full permission to reuse) features get rebuilt into it.
- Parlays count as ONE ticket toward a record: every leg must win for a win; any losing leg = 1 loss.
- Practice ("paper") picks are allowed but NEVER count toward hit rate, standing or leaderboards.
- Bankroll and all personal financial info are ALWAYS private. Never show balances publicly.
- Verified picks (slip-scan badge): skipped for now.
- Still needed: a sports data provider whose terms allow showing data publicly.
- The repo is public: never commit API keys or secrets.

## Supabase

- Project `prop-junkies`: https://bhdipbiapkafegmpljpa.supabase.co (publishable key is safe to commit; secret/service_role keys never).
- Schema lives in `supabase/migrations/`; apply new files in order via the Management API
  (`POST https://api.supabase.com/v1/projects/bhdipbiapkafegmpljpa/database/query`, token injected by the session proxy).
- After any schema change, run `supabase/tests/rules_test.sql` and the security advisor.
