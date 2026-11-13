import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeStats, type LeaderStats } from "./domain/standing";
import type { Leg, LockedPick, Market, Pick, PickAccess, PickResult, Sport, User } from "./domain/types";
import { supabase } from "./lib/supabase";

/**
 * App data, loaded from Supabase. The database's row rules decide what each visitor gets:
 * `picks` holds every ticket this viewer may see in full, `locked` holds teasers for
 * subscriber-only picks they can't see yet.
 */

export interface NewTicket {
  isPractice: boolean;
  access: PickAccess;
  /** Ticket odds; omit for a parlay to price it from the legs. */
  odds?: number;
  units: number;
  analysis: string;
  /** Private: only the author ever sees it. */
  stakeCents?: number;
  legs: { sport: Sport; league: string | null; game: string; market: Market; selection: string; odds: number | null; startsAt: string }[];
}

interface Data {
  users: User[];
  picks: Pick[];
  locked: LockedPick[];
  following: string[];
  subscriptions: string[];
  allowSelfGrading: boolean;
  /** The signed-in user's private unit size in cents (null until they set it). */
  unitSizeCents: number | null;
}

const EMPTY: Data = { users: [], picks: [], locked: [], following: [], subscriptions: [], allowSelfGrading: false, unitSizeCents: null };

interface Store extends Data {
  ready: boolean;
  /** Signed-in user id, or null for visitors. */
  myId: string | null;
  me: User | undefined;
  email: string | undefined;
  userById: (id: string) => User | undefined;
  statsFor: (userId: string) => LeaderStats;
  picksFor: (userId: string) => Pick[];
  isSelling: (userId: string) => boolean;
  /** Runs a database action, shows any error, then reloads. Resolves false on failure. */
  act: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
  error: string | null;
  clearError: () => void;
  actions: {
    follow: (id: string, on: boolean) => Promise<boolean>;
    tail: (pick: Pick) => Promise<boolean>;
    subscribe: (creatorId: string, on: boolean) => Promise<boolean>;
    post: (t: NewTicket) => Promise<boolean>;
    deletePick: (id: string) => Promise<boolean>;
    gradeLeg: (legId: string, result: PickResult) => Promise<boolean>;
    updateProfile: (patch: { displayName?: string; handle?: string; bio?: string }) => Promise<boolean>;
    updateCreator: (patch: { enabled?: boolean; price?: number; perks?: string[] }) => Promise<boolean>;
    setUnitSize: (cents: number) => Promise<boolean>;
    signIn: (email: string) => Promise<boolean>;
    signOut: () => Promise<void>;
  };
}

const Ctx = createContext<Store | null>(null);

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadData(myId: string | null): Promise<Data> {
  const q = <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) =>
    Promise.resolve(p).then((r) => {
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as T;
    });

  const [profiles, settings, creators, tickets, previews, tails, follows, subs, config, mine] = await Promise.all([
    q<any[]>(supabase.from("profiles").select("*")),
    q<any[]>(supabase.from("creator_settings").select("user_id, enabled")),
    q<any[]>(supabase.from("creator_public").select("*")),
    q<any[]>(supabase.from("tickets").select("*, ticket_legs(*)").order("created_at", { ascending: false })),
    q<any[]>(supabase.from("ticket_previews").select("*").eq("status", "pending").eq("access", "subscribers")),
    q<any[]>(supabase.from("tails").select("ticket_id, user_id")),
    myId ? q<any[]>(supabase.from("follows").select("followee_id").eq("follower_id", myId)) : Promise.resolve([]),
    myId
      ? q<any[]>(supabase.from("subscriptions").select("creator_id").eq("subscriber_id", myId).eq("status", "active"))
      : Promise.resolve([]),
    q<any[]>(supabase.from("app_config").select("allow_self_grading")),
    myId ? q<any[]>(supabase.from("user_settings").select("unit_size_cents").eq("user_id", myId)) : Promise.resolve([]),
  ]);

  const tailsBy = new Map<string, string[]>();
  for (const t of tails) tailsBy.set(t.ticket_id, [...(tailsBy.get(t.ticket_id) ?? []), t.user_id]);
  const enabled = new Map(settings.map((s) => [s.user_id, s.enabled as boolean]));
  const creatorBy = new Map(creators.map((c) => [c.user_id, c]));

  const users: User[] = profiles.map((p) => {
    const c = creatorBy.get(p.id);
    return {
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      bio: p.bio,
      avatarColor: p.avatar_color,
      joinedAt: p.created_at,
      verified: p.verified,
      isDemo: p.is_demo,
      creator: c && {
        enabled: enabled.get(p.id) ?? false,
        price: c.price_cents / 100,
        perks: c.perks ?? [],
        subscriberCount: c.subscriber_count,
        isSelling: c.is_selling,
      },
    };
  });

  const picks: Pick[] = tickets.map((t) => ({
    id: t.id,
    userId: t.user_id,
    isPractice: t.is_practice,
    access: t.access,
    odds: t.odds,
    units: Number(t.units),
    analysis: t.analysis,
    startsAt: t.starts_at,
    createdAt: t.created_at,
    gradedAt: t.graded_at ?? undefined,
    result: t.status,
    legs: (t.ticket_legs as any[])
      .map(
        (l): Leg => ({
          id: l.id,
          position: l.position,
          sport: l.sport,
          league: l.league,
          game: l.game,
          market: l.market,
          selection: l.selection,
          odds: l.odds,
          startsAt: l.starts_at,
          result: l.result,
        }),
      )
      .sort((a, b) => a.position - b.position),
    tailedBy: tailsBy.get(t.id) ?? [],
  }));

  const visible = new Set(picks.map((p) => p.id));
  const locked: LockedPick[] = previews
    .filter((p) => !visible.has(p.id))
    .map((p) => ({
      id: p.id,
      userId: p.user_id,
      startsAt: p.starts_at,
      createdAt: p.created_at,
      legCount: p.leg_count,
      sports: p.sports,
      games: p.games,
      tailedBy: tailsBy.get(p.id) ?? [],
    }));

  return {
    users,
    picks,
    locked,
    following: follows.map((f) => f.followee_id),
    subscriptions: subs.map((s) => s.creator_id),
    allowSelfGrading: config[0]?.allow_self_grading ?? false,
    unitSizeCents: mine[0]?.unit_size_cents ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" && s && /access_token|error_description/.test(window.location.hash)) {
        window.history.replaceState(null, "", `${window.location.pathname}#/u/${s.user.id}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      setData(await loadData(myId));
    } catch (e) {
      setError(`Couldn't load the latest picks: ${(e as Error).message}`);
    } finally {
      setReady(true);
    }
  }, [myId]);

  useEffect(() => {
    if (authReady) reload();
  }, [authReady, reload]);

  const value = useMemo<Store>(() => {
    const byUser = new Map<string, Pick[]>();
    for (const p of data.picks) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
    const statsCache = new Map<string, LeaderStats>();
    const picksFor = (id: string) => byUser.get(id) ?? [];
    const statsFor = (id: string) => {
      let s = statsCache.get(id);
      if (!s) statsCache.set(id, (s = computeStats(picksFor(id))));
      return s;
    };
    const userById = (id: string) => data.users.find((u) => u.id === id);

    const act: Store["act"] = async (fn) => {
      const { error } = await fn();
      if (error) {
        setError(friendly(error.message));
        return false;
      }
      await reload();
      return true;
    };
    const needSignIn = () => {
      setError("Sign in first — it only takes your email.");
      window.location.hash = "/signin";
      return Promise.resolve(false);
    };

    return {
      ...data,
      ready: ready && authReady,
      myId,
      me: myId ? userById(myId) : undefined,
      email: session?.user.email,
      userById,
      picksFor,
      statsFor,
      isSelling: (id) => !!userById(id)?.creator?.isSelling,
      act,
      error,
      clearError: () => setError(null),
      actions: {
        follow: (id, on) =>
          !myId
            ? needSignIn()
            : act(() =>
                on
                  ? supabase.from("follows").insert({ follower_id: myId, followee_id: id })
                  : supabase.from("follows").delete().match({ follower_id: myId, followee_id: id }),
              ),
        tail: (p) =>
          !myId
            ? needSignIn()
            : act(() =>
                p.tailedBy.includes(myId)
                  ? supabase.from("tails").delete().match({ ticket_id: p.id, user_id: myId })
                  : supabase.from("tails").insert({ ticket_id: p.id, user_id: myId }),
              ),
        subscribe: (creatorId, on) =>
          !myId
            ? needSignIn()
            : act(() =>
                on
                  ? supabase.from("subscriptions").insert({ subscriber_id: myId, creator_id: creatorId })
                  : supabase.from("subscriptions").delete().match({ subscriber_id: myId, creator_id: creatorId }),
              ),
        post: (t) =>
          !myId
            ? needSignIn()
            : act(() =>
                supabase.rpc("post_ticket", {
                  p: {
                    is_practice: t.isPractice,
                    access: t.access,
                    odds: t.odds,
                    units: t.units,
                    analysis: t.analysis,
                    ...(t.stakeCents ? { stake_cents: t.stakeCents } : {}),
                    legs: t.legs.map((l) => ({
                      sport: l.sport,
                      league: l.league,
                      game: l.game,
                      market: l.market,
                      selection: l.selection,
                      odds: l.odds,
                      starts_at: l.startsAt,
                    })),
                  },
                }),
              ),
        deletePick: (id) => act(() => supabase.from("tickets").delete().eq("id", id)),
        gradeLeg: (legId, result) => act(() => supabase.rpc("grade_leg", { p_leg: legId, p_result: result })),
        updateProfile: (patch) =>
          act(() =>
            supabase
              .from("profiles")
              .update({
                ...(patch.displayName !== undefined && { display_name: patch.displayName }),
                ...(patch.handle !== undefined && { handle: patch.handle }),
                ...(patch.bio !== undefined && { bio: patch.bio }),
              })
              .eq("id", myId!),
          ),
        updateCreator: (patch) =>
          act(() =>
            supabase.from("creator_settings").upsert({
              user_id: myId!,
              ...(patch.enabled !== undefined && { enabled: patch.enabled }),
              ...(patch.price !== undefined && { price_cents: Math.round(patch.price * 100) }),
              ...(patch.perks !== undefined && { perks: patch.perks }),
              updated_at: new Date().toISOString(),
            }),
          ),
        setUnitSize: (cents) =>
          act(() =>
            supabase.from("user_settings").upsert({ user_id: myId!, unit_size_cents: cents, updated_at: new Date().toISOString() }),
          ),
        signIn: async (email) => {
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin + window.location.pathname },
          });
          if (error) setError(friendly(error.message));
          return !error;
        },
        signOut: async () => {
          await supabase.auth.signOut();
          window.location.hash = "/feed";
        },
      },
    };
  }, [data, ready, authReady, myId, session, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Turn database errors into something a person can act on. */
function friendly(msg: string): string {
  if (/profiles_handle_key|duplicate key.*handle/i.test(msg)) return "That handle is taken — try another.";
  if (/profiles_handle_check/i.test(msg)) return "Handles are 3–20 characters: lowercase letters, numbers and _.";
  if (/rate limit|too many/i.test(msg)) return "Too many sign-in emails were sent. Wait a bit and try again.";
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  return msg;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
