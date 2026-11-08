export type Sport = "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "NCAAB" | "Soccer";

export const SPORTS: Sport[] = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"];

export type Market = "Spread" | "Moneyline" | "Total" | "Player Prop";

export const MARKETS: Market[] = ["Spread", "Moneyline", "Total", "Player Prop"];

/** Who can see a pick before its game is graded. Graded picks are always public. */
export type PickAccess = "free" | "subscribers";

/** pending = not graded yet; void = cancelled/postponed (never counts). */
export type PickResult = "pending" | "win" | "loss" | "push" | "void";

export interface Leg {
  id: string;
  position: number;
  sport: Sport;
  game: string;
  market: Market;
  selection: string;
  /** American odds for this leg, if known. */
  odds: number | null;
  startsAt: string;
  result: PickResult;
}

/**
 * A ticket is one pick: a single bet or a parlay. A parlay counts as ONE result —
 * any losing leg makes it a loss; every remaining leg must win for a win.
 */
export interface Pick {
  id: string;
  userId: string;
  isPractice: boolean;
  access: PickAccess;
  /** Whole-ticket American odds (the parlay price for multi-leg tickets). */
  odds: number;
  /** Stake in units (1u = the leader's standard bet). */
  units: number;
  analysis: string;
  /** Earliest leg start; the ticket locks at this time. */
  startsAt: string;
  createdAt: string;
  gradedAt?: string;
  result: PickResult;
  legs: Leg[];
  /** User ids who tailed this pick. */
  tailedBy: string[];
}

/** What a non-subscriber sees of a subscriber-only pick: the games, never the pick. */
export interface LockedPick {
  id: string;
  userId: string;
  startsAt: string;
  createdAt: string;
  legCount: number;
  sports: Sport[];
  games: string[];
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
  /** Sample account shown before launch; removed with private.scrub_demo(). */
  isDemo?: boolean;
  creator?: CreatorSettings;
}

export interface CreatorSettings {
  /** Paid subscriptions switched on. */
  enabled: boolean;
  /** Monthly price in USD. */
  price: number;
  perks: string[];
  /** Active subscribers. */
  subscriberCount: number;
  /** Enabled and standing allows charging (computed by the database). */
  isSelling: boolean;
}
