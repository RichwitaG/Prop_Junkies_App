import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { buildSeed, CURRENT_USER_ID } from "./data/seed";
import { canMonetize, computeStats, type LeaderStats } from "./domain/standing";
import type { CreatorSettings, Pick, PickResult, User } from "./domain/types";

/**
 * Client-side store for the prototype. Everything lives in localStorage so the
 * app is fully clickable without a backend. Swap this for API calls later —
 * the domain logic in src/domain doesn't care where the data comes from.
 */

interface State {
  users: User[];
  picks: Pick[];
  following: string[];
  /** Creator ids the current user pays for. */
  subscriptions: string[];
}

type Action =
  | { type: "follow"; userId: string }
  | { type: "unfollow"; userId: string }
  | { type: "post"; pick: Pick }
  | { type: "delete"; pickId: string }
  | { type: "tail"; pickId: string }
  | { type: "grade"; pickId: string; result: PickResult }
  | { type: "updateProfile"; patch: Partial<{ displayName: string; handle: string; bio: string }> }
  | { type: "subscribe"; userId: string }
  | { type: "unsubscribe"; userId: string }
  | { type: "updateCreator"; patch: Partial<CreatorSettings> }
  | { type: "reset" };

const STORAGE_KEY = "propjunkies:v2";

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* storage unavailable — fall through to seed */
  }
  return buildSeed();
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "follow":
      return state.following.includes(action.userId)
        ? state
        : { ...state, following: [...state.following, action.userId] };
    case "unfollow":
      return { ...state, following: state.following.filter((id) => id !== action.userId) };
    case "post":
      return { ...state, picks: [action.pick, ...state.picks] };
    case "delete":
      return { ...state, picks: state.picks.filter((p) => p.id !== action.pickId) };
    case "tail":
      return {
        ...state,
        picks: state.picks.map((p) => {
          if (p.id !== action.pickId) return p;
          const tailed = p.tailedBy.includes(CURRENT_USER_ID);
          return {
            ...p,
            tailedBy: tailed ? p.tailedBy.filter((u) => u !== CURRENT_USER_ID) : [...p.tailedBy, CURRENT_USER_ID],
          };
        }),
      };
    case "grade":
      return {
        ...state,
        picks: state.picks.map((p) =>
          p.id === action.pickId
            ? { ...p, result: action.result, gradedAt: action.result === "pending" ? undefined : new Date().toISOString() }
            : p,
        ),
      };
    case "updateProfile":
      return {
        ...state,
        users: state.users.map((u) => (u.id === CURRENT_USER_ID ? { ...u, ...action.patch } : u)),
      };
    case "subscribe":
      if (state.subscriptions.includes(action.userId)) return state;
      return {
        ...state,
        subscriptions: [...state.subscriptions, action.userId],
        following: state.following.includes(action.userId) ? state.following : [...state.following, action.userId],
        users: bumpSubs(state.users, action.userId, 1),
      };
    case "unsubscribe":
      if (!state.subscriptions.includes(action.userId)) return state;
      return {
        ...state,
        subscriptions: state.subscriptions.filter((id) => id !== action.userId),
        users: bumpSubs(state.users, action.userId, -1),
      };
    case "updateCreator":
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === CURRENT_USER_ID
            ? { ...u, creator: { enabled: false, price: 9.99, perks: [], subscriberCount: 0, ...u.creator, ...action.patch } }
            : u,
        ),
      };
    case "reset":
      return buildSeed();
  }
}

function bumpSubs(users: User[], id: string, delta: number): User[] {
  return users.map((u) =>
    u.id === id && u.creator ? { ...u, creator: { ...u.creator, subscriberCount: Math.max(0, u.creator.subscriberCount + delta) } } : u,
  );
}

interface Store extends State {
  me: User;
  dispatch: (a: Action) => void;
  userById: (id: string) => User | undefined;
  statsFor: (userId: string) => LeaderStats;
  picksFor: (userId: string) => Pick[];
  /** Is this creator currently selling a subscription (enabled + allowed by their standing)? */
  isSelling: (userId: string) => boolean;
  /** Can the current user see this pick's details? */
  canSee: (pick: Pick) => boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const value = useMemo<Store>(() => {
    const byUser = new Map<string, Pick[]>();
    for (const p of state.picks) {
      const list = byUser.get(p.userId) ?? [];
      list.push(p);
      byUser.set(p.userId, list);
    }
    const statsCache = new Map<string, LeaderStats>();
    const picksFor = (id: string) => byUser.get(id) ?? [];
    const statsFor = (id: string) => {
      let s = statsCache.get(id);
      if (!s) {
        s = computeStats(picksFor(id));
        statsCache.set(id, s);
      }
      return s;
    };
    const userById = (id: string) => state.users.find((u) => u.id === id);
    const isSelling = (id: string) => !!userById(id)?.creator?.enabled && canMonetize(statsFor(id).status);
    return {
      ...state,
      me: state.users.find((u) => u.id === CURRENT_USER_ID)!,
      dispatch,
      userById,
      picksFor,
      statsFor,
      isSelling,
      // Graded picks are always public so a creator's record can't be hidden behind a paywall.
      // If a creator stops selling (e.g. suspended), their gated picks are no longer gated.
      canSee: (p) =>
        p.access === "free" ||
        p.result !== "pending" ||
        p.userId === CURRENT_USER_ID ||
        !isSelling(p.userId) ||
        state.subscriptions.includes(p.userId),
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
