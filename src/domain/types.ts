export type Sport = "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "NCAAB" | "Soccer";

export const SPORTS: Sport[] = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"];

export type Market = "Spread" | "Moneyline" | "Total" | "Player Prop";

export const MARKETS: Market[] = ["Spread", "Moneyline", "Total", "Player Prop"];

/** pending = game not graded yet; void = cancelled/postponed (never counts). */
export type PickResult = "pending" | "win" | "loss" | "push" | "void";

export interface Pick {
  id: string;
  userId: string;
  sport: Sport;
  /** e.g. "Eagles @ Cowboys" */
  game: string;
  market: Market;
  /** e.g. "Eagles -3.5" or "Jalen Hurts o1.5 Pass TD" */
  selection: string;
  /** American odds, e.g. -110 or +145 */
  odds: number;
  /** Stake in units (1u = the leader's standard bet). */
  units: number;
  analysis: string;
  createdAt: string;
  /** When the game starts; picks lock (no edits/deletes) after this. */
  startsAt: string;
  result: PickResult;
  gradedAt?: string;
  /** User ids who tailed this pick. */
  tailedBy: string[];
}

export interface User {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  joinedAt: string;
  verified?: boolean;
}
