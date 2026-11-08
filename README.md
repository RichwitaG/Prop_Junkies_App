# Prop Junkies

A creator platform for sports bettors, like Patreon or OnlyFans for picks.
Creators post picks and sell monthly subscriptions; fans follow for free, subscribe
for premium picks, and see what the whole community is on. **Prop Junkies never
takes or places bets.**

**The core rule:** every leader gets an automatic hit-rate score, and leaders whose
hit rate drops below **30%** are suspended. Leaders should help the market, not
hurt it and profit from it.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # rules-engine tests
npm run build
```

The app talks to the live Supabase database (see `supabase/README.md`). Sign in with your email;
you'll get a sign-in link.

## What's in it

| Screen | What it does |
| --- | --- |
| **Feed** | *Following* (open picks from people you follow), *Community* (all open picks, most-tailed first), *Results* (recently graded). Filter by sport. Tail a pick in one tap. |
| **Leaderboard** | Ranked leaders sorted by hit rate, units or ROI. Provisional and suspended leaders are listed separately. |
| **Profile** | Hit rate, W-L-P record, units, ROI, streak, and a meter showing where the leader sits relative to the warning/suspension lines. Open picks + history. |
| **Post** | Single picks or parlays (up to 15 legs, priced automatically), real or practice, free or subscribers-only, optional private dollar stake. Disabled when suspended (practice still allowed). |
| **Sign in** | Email sign-in link — no passwords. A profile is created on first sign-in. |
| **Subscribe** | Creator profiles show price, perks and a checkout sheet (demo, no charge). Subscriber-only picks are blurred until you subscribe. |
| **Creator settings** | On your own profile: turn subscriptions on, set a monthly price, list perks, see estimated payout. Unlocks after 20 graded picks. |
| **Rules** | Plain-English explanation of scoring and suspension. |

## Standing rules (`src/domain/standing.ts`)

All thresholds live in `STANDING_RULES`:

| Setting | Value | Why |
| --- | --- | --- |
| `suspendBelow` | 30% | The suspension line. |
| `warnBelow` | 40% | "At risk" warning band so nobody is suspended without notice. |
| `minGradedPicks` | 20 | Nobody is ranked or judged on a tiny sample (a 1-4 start is noise). |
| `rollingWindow` | 50 | Standing uses the last 50 graded picks — judged on current form. |

- Hit rate = wins / (wins + losses). Pushes and voids never count.
- Picks lock at game time; they can be deleted before but never after.
- Suspended leaders: picks hidden from the feed, can't be tailed, can't post.

## Creator subscriptions (`src/domain/monetization.ts`)

- Creators set a monthly price ($4.99–$99.99); the platform keeps `PLATFORM_FEE` (20%).
- Each pick is **Free** or **Subscribers only**.
- **Graded picks are always public**, so a creator can't hide losses behind the paywall.
- Paid subscriptions unlock only once a creator is ranked (20+ graded picks) and not suspended.
- Suspended creators stop selling: billing pauses for their subscribers and their gated picks unlock.

## Project layout

```
src/
  domain/      types + standing rules (pure, unit-tested — reuse on the backend)
  lib/supabase.ts  database connection (publishable key only)
  store.tsx    loads data from Supabase and runs every action through it
  components/  screens
```

## Next steps toward production

- Age verification (21+) and geo-restrictions
- Custom email sender for sign-in links (Supabase's built-in one is limited — see CLAUDE.md)
- Payments and creator payouts. Many payment processors restrict sports-picks / handicapping
  services, so confirm a provider will accept the business early. Selling in-app on iOS/Android
  means Apple/Google in-app purchase and their 15–30% cut.
- Odds/schedule feed so games are picked from a list, and automatic grading from a scores feed
  (the "Test grading" buttons on your own picks stand in for this)
- Push notifications when someone you follow posts
- Suspension appeals / reinstatement policy
- Native app (the domain layer ports directly to React Native)
