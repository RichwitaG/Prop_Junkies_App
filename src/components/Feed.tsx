import { useState } from "react";
import { SPORTS, type Sport } from "../domain/types";
import { useStore } from "../store";
import { Chips, Link } from "./common";
import { PickCard } from "./PickCard";

const TABS = ["Following", "Community", "Results"] as const;
type Tab = (typeof TABS)[number];
const SPORT_FILTERS = ["All", ...SPORTS] as const;

export function Feed() {
  const { picks, following, subscriptions, statsFor } = useStore();
  const [tab, setTab] = useState<Tab>("Following");
  const [sport, setSport] = useState<"All" | Sport>("All");

  // Suspended leaders' picks never surface in the feed.
  const visible = picks.filter(
    (p) => statsFor(p.userId).status !== "suspended" && (sport === "All" || p.sport === sport),
  );

  let list =
    tab === "Results"
      ? visible
          .filter((p) => p.result !== "pending")
          .sort((a, b) => (b.gradedAt ?? "").localeCompare(a.gradedAt ?? ""))
          .slice(0, 40)
      : visible
          .filter((p) => p.result === "pending")
          .filter((p) => tab === "Community" || following.includes(p.userId) || subscriptions.includes(p.userId))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Community tab: most-tailed first, so people see what the crowd is on.
  if (tab === "Community") list = [...list].sort((a, b) => b.tailedBy.length - a.tailedBy.length);

  return (
    <section>
      <Chips options={TABS} value={tab} onChange={setTab} />
      <Chips options={SPORT_FILTERS} value={sport} onChange={setSport} />

      {tab === "Following" && following.length === 0 && (
        <div className="empty">
          You're not following anyone yet. <Link to="/leaders">Find leaders on the leaderboard →</Link>
        </div>
      )}

      {list.length === 0 && !(tab === "Following" && following.length === 0) && (
        <div className="empty">No picks here right now. Check back closer to game time.</div>
      )}

      <div className="stack">
        {list.map((p) => (
          <PickCard key={p.id} pick={p} />
        ))}
      </div>
    </section>
  );
}
