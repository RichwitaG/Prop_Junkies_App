import { STANDING_RULES as R } from "../domain/standing";
import { PLATFORM_FEE } from "../domain/monetization";
import { pct } from "../format";

export function Rules() {
  return (
    <section className="card prose">
      <h2>How scoring works</h2>
      <p>
        Every pick you post is tracked and graded automatically. Your <strong>hit rate</strong> is your wins divided by
        your wins + losses. Pushes and voided games don't count either way.
      </p>

      <h3>Leaders help the market, not hurt it</h3>
      <p>
        Anyone who posts picks is a leader, and fans pay for and act on leaders' picks. So we hold leaders to a minimum
        standard:
      </p>
      <ul>
        <li>
          <span className="badge badge-provisional">Provisional</span> — fewer than {R.minGradedPicks} graded picks. You're
          not ranked or judged yet.
        </li>
        <li>
          <span className="badge badge-good">Good standing</span> — hit rate of {pct(R.warnBelow, 0)} or better.
        </li>
        <li>
          <span className="badge badge-warning">At risk</span> — between {pct(R.suspendBelow, 0)} and {pct(R.warnBelow, 0)}.
          You'll be warned before anything happens.
        </li>
        <li>
          <span className="badge badge-suspended">Suspended</span> — below {pct(R.suspendBelow, 0)}. Your picks are
          hidden from the feed, can't be tailed, and you can't post new ones.
        </li>
      </ul>

      <h3>Earning as a creator</h3>
      <p>
        Creators can sell a monthly subscription, like Patreon or OnlyFans for picks. You set the price and choose which
        picks are free and which are for subscribers. We keep {pct(PLATFORM_FEE, 0)}; you keep the rest.
      </p>
      <ul>
        <li>• Paid subscriptions unlock after {R.minGradedPicks} graded picks — fans pay for a proven record.</li>
        <li>• Subscriber-only picks become public once they're graded, so every creator's full record is visible to everyone.</li>
        <li>• Suspended creators can't charge. Billing pauses for all their subscribers automatically.</li>
      </ul>

      <h3>Judged on current form</h3>
      <p>
        Standing is based on your last {R.rollingWindow} graded picks, so an old hot streak can't hide a cold run — and a
        rough patch from months ago won't haunt you forever. Your all-time record is always shown on your profile too.
      </p>

      <h3>Parlays count as one pick</h3>
      <p>
        A parlay is one ticket with one result. Every leg has to hit for it to count as a win — one losing leg makes the
        whole ticket a loss, no matter how many other legs hit.
      </p>

      <h3>Practice picks</h3>
      <p>Try out ideas with practice picks. Only you can see them, and they never count toward your record or standing.</p>

      <h3>No take-backs</h3>
      <p>Picks lock when the game starts. You can delete a pick before then, but never after — the record is the record.</p>

      <h3>Hit rate isn't everything</h3>
      <p>
        A -110 bet needs to win 52.4% of the time just to break even, and a +300 long shot only needs 25%. That's why
        profiles also show <strong>units</strong> and <strong>ROI</strong> — check them before you tail.
      </p>

      <p className="muted small">
        Prop Junkies is a community, not a sportsbook — we never take or place bets. Picks are opinions, not guarantees. 21+. If gambling stops being fun, call
        1-800-GAMBLER.
      </p>

</section>
  );
}
