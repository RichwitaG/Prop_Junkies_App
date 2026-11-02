import type { Pick } from "./types";

/**
 * Leader standing rules.
 *
 * Every user who posts picks is a "leader" and gets an automatic hit-rate score.
 * Leaders whose hit rate falls below the suspension threshold are suspended:
 * leaders should help the market, not hurt it and profit from it.
 *
 * Guard-rails so the rule is fair:
 *  - Pushes and voids never count (they're neither a hit nor a miss).
 *  - Nobody is judged until they have MIN_GRADED_PICKS graded picks
 *    (a 1-3 start is noise, not signal).
 *  - Enforcement looks at a rolling window of the most recent graded picks,
 *    so a leader is judged on current form and can't coast on an old hot streak.
 *  - A warning band above the threshold gives leaders notice before suspension.
 */
export const STANDING_RULES = {
  suspendBelow: 0.3,
  warnBelow: 0.4,
  minGradedPicks: 20,
  rollingWindow: 50,
} as const;

export type StandingStatus = "provisional" | "good" | "warning" | "suspended";

export interface PickRecord {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
}

export interface LeaderStats {
  /** All-time record. */
  record: PickRecord;
  /** All-time hit rate (wins / (wins + losses)), null if nothing graded. */
  hitRate: number | null;
  /** Hit rate over the rolling enforcement window — this is what the rules use. */
  windowHitRate: number | null;
  windowSize: number;
  /** Net units won/lost across graded picks. */
  unitsNet: number;
  /** Net units / units risked on graded (win/loss) picks. */
  roi: number | null;
  /** Current streak, e.g. { kind: "W", length: 4 }. */
  streak: { kind: "W" | "L"; length: number } | null;
  status: StandingStatus;
  /** Graded picks still needed before the leader is ranked/enforced. */
  picksUntilRanked: number;
}

/** Profit in units for a winning bet of `units` at American `odds`. */
export function winProfit(odds: number, units: number): number {
  return odds > 0 ? units * (odds / 100) : units * (100 / Math.abs(odds));
}

/** Net units for a single graded pick. */
export function pickNet(p: Pick): number {
  if (p.result === "win") return winProfit(p.odds, p.units);
  if (p.result === "loss") return -p.units;
  return 0;
}

const isDecided = (p: Pick) => p.result === "win" || p.result === "loss";

function rate(picks: Pick[]): number | null {
  const decided = picks.filter(isDecided);
  if (decided.length === 0) return null;
  return decided.filter((p) => p.result === "win").length / decided.length;
}

export function statusFor(windowHitRate: number | null, decidedCount: number): StandingStatus {
  if (decidedCount < STANDING_RULES.minGradedPicks || windowHitRate === null) return "provisional";
  if (windowHitRate < STANDING_RULES.suspendBelow) return "suspended";
  if (windowHitRate < STANDING_RULES.warnBelow) return "warning";
  return "good";
}

export function computeStats(picks: Pick[]): LeaderStats {
  const record: PickRecord = { wins: 0, losses: 0, pushes: 0, pending: 0 };
  let unitsNet = 0;
  let risked = 0;
  for (const p of picks) {
    if (p.result === "win") record.wins++;
    else if (p.result === "loss") record.losses++;
    else if (p.result === "push") record.pushes++;
    else if (p.result === "pending") record.pending++;
    if (isDecided(p)) {
      unitsNet += pickNet(p);
      risked += p.units;
    }
  }

  // Most recent first, by grading time (fall back to game start).
  const decided = picks
    .filter(isDecided)
    .sort((a, b) => (b.gradedAt ?? b.startsAt).localeCompare(a.gradedAt ?? a.startsAt));
  const window = decided.slice(0, STANDING_RULES.rollingWindow);

  let streak: LeaderStats["streak"] = null;
  if (decided.length > 0) {
    const kind = decided[0].result === "win" ? "W" : "L";
    let length = 0;
    for (const p of decided) {
      if ((p.result === "win" ? "W" : "L") !== kind) break;
      length++;
    }
    streak = { kind, length };
  }

  const windowHitRate = rate(window);
  return {
    record,
    hitRate: rate(decided),
    windowHitRate,
    windowSize: window.length,
    unitsNet: round2(unitsNet),
    roi: risked > 0 ? unitsNet / risked : null,
    streak,
    status: statusFor(windowHitRate, decided.length),
    picksUntilRanked: Math.max(0, STANDING_RULES.minGradedPicks - decided.length),
  };
}

/** Break-even hit rate for a given American price (e.g. -110 → 52.4%). */
export function breakEven(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
