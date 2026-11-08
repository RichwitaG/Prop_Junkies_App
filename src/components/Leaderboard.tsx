import { useState } from "react";
import type { LeaderStats } from "../domain/standing";
import type { User } from "../domain/types";
import { usd } from "../domain/monetization";
import { pct, units } from "../format";
import { useStore } from "../store";
import { Avatar, Chips, Link, StandingBadge } from "./common";

const SORTS = ["Hit rate", "Units", "ROI"] as const;
type Sort = (typeof SORTS)[number];

export function Leaderboard() {
  const { ready, myId, users, statsFor, following, isSelling, actions } = useStore();
  const [sort, setSort] = useState<Sort>("Hit rate");

  const rows = users
    // Everyone with at least one graded (non-practice) pick.
    .filter((u) => statsFor(u.id).record.wins + statsFor(u.id).record.losses > 0)
    .map((u) => ({ user: u, stats: statsFor(u.id) }));

  const key = (s: LeaderStats) =>
    sort === "Hit rate" ? (s.windowHitRate ?? 0) : sort === "Units" ? s.unitsNet : (s.roi ?? 0);

  const ranked = rows.filter((r) => r.stats.status === "good" || r.stats.status === "warning").sort((a, b) => key(b.stats) - key(a.stats));
  const provisional = rows.filter((r) => r.stats.status === "provisional");
  const suspended = rows.filter((r) => r.stats.status === "suspended");

  const Row = ({ user, stats, rank }: { user: User; stats: LeaderStats; rank?: number }) => {
    const isFollowing = following.includes(user.id);
    return (
      <li className="lb-row">
        <span className="rank">{rank ?? "–"}</span>
        <Link to={`/u/${user.id}`} className="author">
          <Avatar user={user} size={36} />
          <span>
            <strong>{user.displayName}</strong>
            <small>
              {stats.record.wins}-{stats.record.losses}
              {stats.record.pushes > 0 && `-${stats.record.pushes}`} · {units(stats.unitsNet)}
              {isSelling(user.id) && <> · {usd(user.creator!.price)}/mo</>}
            </small>
          </span>
        </Link>
        <span className="lb-stat">
          <strong>{pct(stats.windowHitRate)}</strong>
          <StandingBadge status={stats.status} compact />
        </span>
        {user.id !== myId && stats.status !== "suspended" && (
          <button
            className={isFollowing ? "btn btn-sm btn-active" : "btn btn-sm"}
            onClick={() => actions.follow(user.id, !isFollowing)}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </li>
    );
  };

  return (
    <section>
      <Chips options={SORTS} value={sort} onChange={setSort} />
      <p className="muted small">
        Hit rate is measured over each leader's most recent graded picks. <Link to="/rules">How scoring works →</Link>
      </p>
      {ready && rows.length === 0 && (
        <div className="empty">
          Nobody has a graded pick yet. <Link to="/new">Post the first one →</Link>
        </div>
      )}
      {ranked.length > 0 && (
      <ol className="card lb">
        {ranked.map((r, i) => (
          <Row key={r.user.id} {...r} rank={i + 1} />
        ))}
      </ol>
      )}

      {provisional.length > 0 && (
        <>
          <h3 className="section-title">Provisional — not enough graded picks yet</h3>
          <ol className="card lb">
            {provisional.map((r) => (
              <Row key={r.user.id} {...r} />
            ))}
          </ol>
        </>
      )}

      {suspended.length > 0 && (
        <>
          <h3 className="section-title">Suspended</h3>
          <ol className="card lb lb-suspended">
            {suspended.map((r) => (
              <Row key={r.user.id} {...r} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
