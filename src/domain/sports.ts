/**
 * Every sport the app supports: its icon, usual season, betting markets and (for the
 * "all leagues" sports) league suggestions.
 *
 * Keep SPORT_IDS and ALL_MARKETS in sync with the checks on ticket_legs in
 * supabase/migrations/0004_more_sports.sql.
 */

export const SPORT_IDS = [
  "NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAM", "NCAAW", "WNBA",
  "Soccer", "Basketball", "Ice Hockey", "Tennis", "Golf", "UFC", "Boxing", "Table Tennis",
] as const;
export type Sport = (typeof SPORT_IDS)[number];

const TEAM_MARKETS = ["Spread", "Moneyline", "Total", "Player Prop"] as const;

export const ALL_MARKETS = [
  ...TEAM_MARKETS,
  "Set Spread", "Total Sets", "Total Games", "Game Spread",
  "Outright Winner", "Top 5", "Top 10", "Top 20", "Head-to-Head",
  "Method of Victory", "Total Rounds",
] as const;
export type Market = (typeof ALL_MARKETS)[number];

export interface SportInfo {
  id: Sport;
  icon: string;
  /** Months (1–12) the sport is usually in season. Empty = year-round. */
  season: number[];
  markets: readonly Market[];
  /** What one event is called, for form labels. */
  eventLabel: string;
  eventPlaceholder: string;
  selectionPlaceholder: string;
  /** League suggestions for sports that cover many leagues; shows a League box when set. */
  leagues?: string[];
}

const months = (from: number, to: number) => {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to) return out;
  }
};

const team = (icon: string, season: number[], event: string, pick: string): Omit<SportInfo, "id"> => ({
  icon, season, markets: TEAM_MARKETS, eventLabel: "Game", eventPlaceholder: event, selectionPlaceholder: pick,
});

export const SPORT_INFO: Record<Sport, SportInfo> = Object.fromEntries(
  (
    [
      ["NFL", team("🏈", months(9, 2), "Eagles @ Cowboys", "Eagles -3.5")],
      ["NBA", team("🏀", months(10, 6), "Celtics @ Knicks", "Celtics -4.5")],
      ["MLB", team("⚾", months(3, 10), "Yankees @ Red Sox", "Yankees ML")],
      ["NHL", team("🏒", months(10, 6), "Oilers @ Avalanche", "Oilers +1.5")],
      ["NCAAF", team("🏈", months(8, 1), "Georgia @ Alabama", "Georgia -6.5")],
      ["NCAAM", team("🏀", months(11, 4), "Duke @ UNC", "Duke -2.5")],
      ["NCAAW", team("🏀", months(11, 4), "South Carolina @ UConn", "UConn -5.5")],
      ["WNBA", team("🏀", months(5, 10), "Liberty @ Aces", "Aces -3.5")],
      ["Soccer", { ...team("⚽", [], "Arsenal vs Liverpool", "Arsenal ML"), eventLabel: "Match",
        leagues: ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Champions League", "Europa League",
          "MLS", "Liga MX", "Eredivisie", "Primeira Liga", "Brasileirão", "World Cup", "International Friendly"] }],
      ["Basketball", { ...team("🏀", [], "Real Madrid vs Barcelona", "Real Madrid -4.5"),
        leagues: ["EuroLeague", "EuroCup", "Liga ACB", "NBL (Australia)", "CBA (China)", "B.League (Japan)",
          "Turkish BSL", "Greek Basket League", "FIBA", "G League"] }],
      ["Ice Hockey", { ...team("🏒", months(8, 5), "SKA vs CSKA", "SKA ML"),
        leagues: ["KHL", "SHL (Sweden)", "Liiga (Finland)", "DEL (Germany)", "NL (Switzerland)", "Czech Extraliga",
          "AHL", "IIHF World Championship", "World Juniors", "Olympics"] }],
    ] as [Sport, Omit<SportInfo, "id">][]
  )
    .concat([
      ["Tennis", { icon: "🎾", season: months(1, 11), markets: ["Moneyline", "Set Spread", "Total Sets", "Total Games"],
        eventLabel: "Match", eventPlaceholder: "Alcaraz vs Sinner", selectionPlaceholder: "Alcaraz ML" }],
      ["Golf", { icon: "⛳", season: [], markets: ["Outright Winner", "Top 5", "Top 10", "Top 20", "Head-to-Head"],
        eventLabel: "Tournament", eventPlaceholder: "The Masters", selectionPlaceholder: "Scheffler Top 10" }],
      ["UFC", { icon: "🥋", season: [], markets: ["Moneyline", "Method of Victory", "Total Rounds"],
        eventLabel: "Fight", eventPlaceholder: "Fighter A vs Fighter B", selectionPlaceholder: "Fighter A by KO/TKO" }],
      ["Boxing", { icon: "🥊", season: [], markets: ["Moneyline", "Method of Victory", "Total Rounds"],
        eventLabel: "Fight", eventPlaceholder: "Fighter A vs Fighter B", selectionPlaceholder: "Over 9.5 Rounds" }],
      ["Table Tennis", { icon: "🏓", season: [], markets: ["Moneyline", "Game Spread", "Total Games"],
        eventLabel: "Match", eventPlaceholder: "Player A vs Player B", selectionPlaceholder: "Player A -1.5 Games" }],
    ])
    .map(([id, info]) => [id, { id, ...info }]),
) as Record<Sport, SportInfo>;

export const inSeason = (sport: Sport, date = new Date()) => {
  const s = SPORT_INFO[sport].season;
  return s.length === 0 || s.includes(date.getMonth() + 1);
};

/** In-season sports first (in their usual order), off-season sports pushed to the end. */
export function sportsBySeason(date = new Date()): Sport[] {
  return [...SPORT_IDS.filter((s) => inSeason(s, date)), ...SPORT_IDS.filter((s) => !inSeason(s, date))];
}

export const marketsFor = (sport: Sport) => SPORT_INFO[sport].markets;

/** The sports/markets list given to the ticket scanner (supabase/functions/scan-slip/sports.json). */
export function scanSportsData() {
  return {
    sports: SPORT_IDS.map((id) => ({
      id,
      markets: [...SPORT_INFO[id].markets],
      ...(SPORT_INFO[id].leagues ? { leagues: SPORT_INFO[id].leagues } : {}),
    })),
    markets: [...ALL_MARKETS],
  };
}
