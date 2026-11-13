import { describe, expect, it } from "vitest";
import { ALL_MARKETS, inSeason, marketsFor, SPORT_IDS, SPORT_INFO, sportsBySeason } from "./sports";

describe("sports", () => {
  it("has info, an icon and markets for every sport", () => {
    for (const s of SPORT_IDS) {
      expect(SPORT_INFO[s].icon).toBeTruthy();
      expect(marketsFor(s).length).toBeGreaterThan(0);
      for (const m of marketsFor(s)) expect(ALL_MARKETS).toContain(m);
    }
  });

  it("pushes MLB to the back in November and to the front in July", () => {
    const nov = sportsBySeason(new Date(2026, 10, 10));
    const jul = sportsBySeason(new Date(2026, 6, 10));
    expect(nov.indexOf("MLB")).toBeGreaterThan(nov.indexOf("Table Tennis"));
    expect(jul.indexOf("MLB")).toBeLessThan(jul.indexOf("Soccer"));
    expect(nov.slice(0, 2)).toEqual(["NFL", "NBA"]);
    expect(new Set(nov).size).toBe(SPORT_IDS.length);
  });

  it("handles seasons that wrap around new year", () => {
    expect(inSeason("NFL", new Date(2027, 0, 15))).toBe(true);
    expect(inSeason("NFL", new Date(2027, 5, 15))).toBe(false);
    expect(inSeason("Soccer", new Date(2027, 5, 15))).toBe(true);
  });

  it("gives tennis its own markets and leagues only to all-league sports", () => {
    expect(marketsFor("Tennis")).toContain("Total Sets");
    expect(SPORT_INFO.Soccer.leagues?.length).toBeGreaterThan(0);
    expect(SPORT_INFO.NFL.leagues).toBeUndefined();
  });
});

describe("scanner sports list", () => {
  it("matches src/domain/sports.ts (run scripts/gen-scan-sports.ts if this fails)", async () => {
    const { readFileSync } = await import("node:fs");
    const { scanSportsData } = await import("./sports");
    const onDisk = JSON.parse(readFileSync("supabase/functions/scan-slip/sports.json", "utf8"));
    expect(onDisk).toEqual(scanSportsData());
  });
});

describe("extra markets", () => {
  it("every sport has an Other catch-all, and NHL/Soccer have Both Teams to Score", async () => {
    const { marketsFor, SPORT_IDS } = await import("./sports");
    for (const s of SPORT_IDS) expect(marketsFor(s)).toContain("Other");
    expect(marketsFor("NHL")).toContain("Both Teams to Score");
    expect(marketsFor("Soccer")).toContain("Both Teams to Score");
    expect(marketsFor("Tennis")).toContain("Set Betting");
  });
});
