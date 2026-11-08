import { describe, expect, it } from "vitest";
import { breakEven, canMonetize, computeStats, parlayOdds, STANDING_RULES, winProfit } from "./standing";
import type { Pick, PickResult } from "./types";

let n = 0;
function pick(result: PickResult, opts: Partial<Pick> = {}): Pick {
  n++;
  const t = new Date(Date.UTC(2026, 0, 1) + n * 3600_000).toISOString();
  return {
    id: `p${n}`,
    userId: "u1",
    isPractice: false,
    odds: -110,
    units: 1,
    analysis: "",
    createdAt: t,
    startsAt: t,
    result,
    gradedAt: result === "pending" ? undefined : t,
    access: "free",
    legs: [],
    tailedBy: [],
    ...opts,
  };
}

/** Build `wins` wins and `losses` losses, oldest first. */
function picks(wins: number, losses: number): Pick[] {
  return [
    ...Array.from({ length: wins }, () => pick("win")),
    ...Array.from({ length: losses }, () => pick("loss")),
  ];
}

describe("computeStats", () => {
  it("is provisional until the minimum graded picks are reached", () => {
    const s = computeStats(picks(0, STANDING_RULES.minGradedPicks - 1));
    expect(s.status).toBe("provisional");
    expect(s.picksUntilRanked).toBe(1);
  });

  it("suspends a leader below 30% once ranked", () => {
    const s = computeStats(picks(5, 15)); // 25%
    expect(s.hitRate).toBe(0.25);
    expect(s.status).toBe("suspended");
  });

  it("is exactly at 30% → warning, not suspended", () => {
    expect(computeStats(picks(6, 14)).status).toBe("warning");
  });

  it("is good at or above 40%", () => {
    expect(computeStats(picks(8, 12)).status).toBe("good");
  });

  it("ignores pushes, voids and pending picks", () => {
    const list = [...picks(10, 10), pick("push"), pick("void"), pick("pending")];
    const s = computeStats(list);
    expect(s.hitRate).toBe(0.5);
    expect(s.record).toEqual({ wins: 10, losses: 10, pushes: 1, pending: 1 });
  });

  it("enforces on the rolling window, not all-time", () => {
    // Great old history, terrible recent form.
    const list = [...picks(60, 0), ...picks(10, 40)];
    const s = computeStats(list);
    expect(s.hitRate).toBeCloseTo(70 / 110);
    expect(s.windowHitRate).toBe(10 / 50);
    expect(s.status).toBe("suspended");
  });

  it("computes units and streak", () => {
    const list = [pick("loss"), pick("win", { odds: 150 }), pick("win"), pick("win")];
    const s = computeStats(list);
    expect(s.unitsNet).toBeCloseTo(-1 + 1.5 + 100 / 110 + 100 / 110, 2);
    expect(s.streak).toEqual({ kind: "W", length: 3 });
  });
});

describe("odds helpers", () => {
  it("winProfit", () => {
    expect(winProfit(150, 2)).toBe(3);
    expect(winProfit(-200, 2)).toBe(1);
  });
  it("breakEven", () => {
    expect(breakEven(-110)).toBeCloseTo(0.5238, 3);
    expect(breakEven(100)).toBe(0.5);
  });
});

describe("canMonetize", () => {
  it("only lets ranked creators in good standing or at-risk charge", () => {
    expect(canMonetize(computeStats(picks(10, 10)).status)).toBe(true);
    expect(canMonetize(computeStats(picks(6, 14)).status)).toBe(true);
    expect(canMonetize(computeStats(picks(5, 15)).status)).toBe(false);
    expect(canMonetize(computeStats(picks(5, 0)).status)).toBe(false);
  });
});

describe("practice picks", () => {
  it("never count toward record or standing", () => {
    const list = [...picks(10, 10), ...Array.from({ length: 30 }, () => pick("loss", { isPractice: true }))];
    const s = computeStats(list);
    expect(s.record.losses).toBe(10);
    expect(s.status).toBe("good");
  });
});

describe("parlayOdds", () => {
  it("matches the database calculation", () => {
    expect(parlayOdds([-110, -110, -110])).toBe(596);
    expect(parlayOdds([-110, -110])).toBe(264);
    expect(parlayOdds([-500, -500])).toBe(-227);
    expect(parlayOdds([150, -110])).toBe(377);
    expect(parlayOdds([-110, null])).toBeNull();
  });
});
