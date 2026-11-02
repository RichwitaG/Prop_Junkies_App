import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { buildSeed, CURRENT_USER_ID } from "./data/seed";
import { computeStats, type LeaderStats } from "./domain/standing";
import type { Pick, PickResult, User } from "./domain/types";

/**
 * Client-side store for the prototype. Everything lives in localStorage so the
 * app is fully clickable without a backend. Swap this for API calls later —
 * the domain logic in src/domain doesn't care where the data comes from.
 */

interface State {
  users: User[];
  picks: Pick[];
  following: string[];
}

type Action =
  | { type: "follow"; userId: string }
  | { type: "unfollow"; userId: string }
  | { type: "post"; pick: Pick }
  | { type: "delete"; pickId: string }
  | { type: "tail"; pickId: string }
  | { type: "grade"; pickId: string; result: PickResult }
  | { type: "updateProfile"; patch: Partial<{ displayName: string; handle: string; bio: string }> }
  | { type: "reset" };

const STORAGE_KEY = "propjunkies:v1";

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
    case "reset":
      return buildSeed();
  }
}

interface Store extends State {
  me: User;
  dispatch: (a: Action) => void;
  userById: (id: string) => User | undefined;
  statsFor: (userId: string) => LeaderStats;
  picksFor: (userId: string) => Pick[];
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
    return {
      ...state,
      me: state.users.find((u) => u.id === CURRENT_USER_ID)!,
      dispatch,
      userById: (id) => state.users.find((u) => u.id === id),
      picksFor,
      statsFor: (id) => {
        let s = statsCache.get(id);
        if (!s) {
          s = computeStats(picksFor(id));
          statsCache.set(id, s);
        }
        return s;
      },
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
