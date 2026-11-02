export type Sport = "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "NCAAB" | "Soccer";

export const SPORTS: Sport[] = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"];

export type Market = "Spread" | "Moneyline" | "Total" | "Player Prop";

export const MARKETS: Market[] = ["Spread", "Moneyline", "Total", "Player Prop"];

/** Who can see a pick before its game is graded. Graded picks are always public. */
export type PickAccess = "free" | "subscribers";

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
  access: PickAccess;
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
  /** Set when the user sells a paid subscription. */
  creator?: CreatorSettings;
}

export interface CreatorSettings {
  /** Paid subscriptions switched on. */
  enabled: boolean;
  /** Monthly price in USD. */
  price: number;
  /** What subscribers get, shown on the profile. */
  perks: string[];
  /** Paying subscribers (seed/demo figure; comes from billing in production). */
  subscriberCount: number;
}
