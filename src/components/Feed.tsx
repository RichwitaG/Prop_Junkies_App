import { useState } from "react";
import type { LockedPick, Pick, Sport } from "../domain/types";
import { useStore } from "../store";
import { Chips, Link, SportBar } from "./common";
import { LockedCard, PickCard } from "./PickCard";

const TABS = ["Following", "Community", "Results"] as const;
type Tab = (typeof TABS)[number];

type Item = ({ kind: "pick"; pick: Pick } | { kind: "locked"; pick: LockedPick }) & { repostedBy?: string };

export function Feed() {
  const { ready, myId, picks, locked, following, subscriptions, statsFor, reposts, blocked } = useStore();
  const [chosen, setChosen] = useState<Tab | null>(null);
  // Until the user picks a tab: signed-in users start on Following, visitors on Community.
  const tab: Tab = chosen ?? (myId ? "Following" : "Community");
  const setTab = setChosen;
  const [sport, setSport] = useState<"All" | Sport>("All");

  const inFollowing = (userId: string) => following.includes(userId) || subscriptions.includes(userId);
  // Suspended leaders' picks never surface in the feed; practice picks never do either.
  // Blocked users never appear either.
  const shown = (userId: string) => statsFor(userId).status !== "suspended" && userId !== myId && !blocked.includes(userId);
  const sportOk = (sports: Sport[]) => sport === "All" || sports.includes(sport);
  const now = Date.now();

  let items: Item[];
  if (tab === "Results") {
    items = picks
      .filter((p) => !p.isPractice && p.result !== "pending" && shown(p.userId) && sportOk(p.legs.map((l) => l.sport)))
      .sort((a, b) => (b.gradedAt ?? "").localeCompare(a.gradedAt ?? ""))
      .slice(0, 40)
      .map((pick) => ({ kind: "pick", pick }));
  } else {
    const open = (userId: string, startsAt: string) =>
      shown(userId) && new Date(startsAt).getTime() > now && (tab === "Community" || inFollowing(userId));
    items = [
      ...picks
        .filter((p) => !p.isPractice && p.result === "pending" && open(p.userId, p.startsAt) && sportOk(p.legs.map((l) => l.sport)))
        .map((pick): Item => ({ kind: "pick", pick })),
      ...locked
        .filter((p) => open(p.userId, p.startsAt) && sportOk(p.sports))
        .map((pick): Item => ({ kind: "locked", pick })),
    ];
    // Following also shows open tickets that people you follow reposted (once, with who reposted it).
    if (tab === "Following") {
      const have = new Set(items.map((i) => i.pick.id));
      for (const r of reposts) {
        if (have.has(r.ticketId) || !following.includes(r.userId) || blocked.includes(r.userId)) continue;
        const pick = picks.find((p) => p.id === r.ticketId);
        const lock = pick ? undefined : locked.find((p) => p.id === r.ticketId);
        const src = pick ?? lock;
        if (!src || !shown(src.userId) || new Date(src.startsAt).getTime() <= now) continue;
        if (pick && (pick.isPractice || pick.result !== "pending" || !sportOk(pick.legs.map((l) => l.sport)))) continue;
        if (lock && !sportOk(lock.sports)) continue;
        items.push(pick ? { kind: "pick", pick, repostedBy: r.userId } : { kind: "locked", pick: lock!, repostedBy: r.userId });
        have.add(r.ticketId);
      }
    }
    // Community: most-tailed first, so people see what the crowd is on. Following: soonest first.
    items.sort((a, b) =>
      tab === "Community"
        ? b.pick.tailedBy.length - a.pick.tailedBy.length
        : a.pick.startsAt.localeCompare(b.pick.startsAt),
    );
  }

  const noFollows = tab === "Following" && following.length === 0 && subscriptions.length === 0;

  return (
    <section>
      <Chips options={TABS} value={tab} onChange={setTab} />
      <SportBar value={sport} onChange={setSport} />

      {!ready ? (
        <div className="empty">Loading picks…</div>
      ) : noFollows ? (
        <div className="empty">
          {myId ? "You're not following anyone yet." : "Sign in to follow leaders."}{" "}
          <Link to="/leaders">Find leaders on the leaderboard →</Link>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          No picks here yet.{" "}
          {tab !== "Results" && (
            <>
              Be the first — <Link to="/new">post a pick →</Link>
            </>
          )}
        </div>
      ) : null}

      <div className="stack">
        {items.map((it) =>
          it.kind === "pick" ? (
            <PickCard key={it.pick.id} pick={it.pick} repostedBy={it.repostedBy} />
          ) : (
            <LockedCard key={it.pick.id} pick={it.pick} repostedBy={it.repostedBy} />
          ),
        )}
      </div>
    </section>
  );
}
