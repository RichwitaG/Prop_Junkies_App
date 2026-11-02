import { useState } from "react";
import { CURRENT_USER_ID } from "../data/seed";
import { STANDING_RULES } from "../domain/standing";
import { pct, units } from "../format";
import { useStore } from "../store";
import { Avatar, Chips, Link, StandingBadge } from "./common";
import { PickCard } from "./PickCard";

const TABS = ["Open", "History"] as const;

export function Profile({ userId }: { userId: string }) {
  const { userById, statsFor, picksFor, following, dispatch } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Open");
  const [editing, setEditing] = useState(false);
  const user = userById(userId);
  if (!user) return <div className="empty">User not found.</div>;

  const stats = statsFor(userId);
  const mine = userId === CURRENT_USER_ID;
  const isFollowing = following.includes(userId);
  const all = [...picksFor(userId)].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const list = all.filter((p) => (tab === "Open" ? p.result === "pending" : p.result !== "pending"));
  const tails = all.reduce((n, p) => n + p.tailedBy.length, 0);

  return (
    <section>
      <div className="card profile">
        <div className="profile-head">
          <Avatar user={user} size={64} />
          <div className="grow">
            <h2>
              {user.displayName}
              {user.verified && <span className="verified">✓</span>}
            </h2>
            <div className="muted">@{user.handle} · {tails.toLocaleString()} tails received</div>
          </div>
          {mine ? (
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done" : "Edit"}
            </button>
          ) : (
            stats.status !== "suspended" && (
              <button
                className={isFollowing ? "btn btn-active" : "btn btn-primary"}
                onClick={() => dispatch({ type: isFollowing ? "unfollow" : "follow", userId })}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )
          )}
        </div>

        {editing && mine ? <EditProfile /> : <p>{user.bio}</p>}

        <StandingBanner />

        <div className="stats-grid">
          <Stat label="Hit rate" value={pct(stats.windowHitRate)} hint={`last ${stats.windowSize}`} />
          <Stat label="Record" value={`${stats.record.wins}-${stats.record.losses}-${stats.record.pushes}`} hint="W-L-P" />
          <Stat label="Units" value={units(stats.unitsNet)} tone={stats.unitsNet >= 0 ? "pos" : "neg"} />
          <Stat label="ROI" value={pct(stats.roi)} tone={(stats.roi ?? 0) >= 0 ? "pos" : "neg"} />
          <Stat label="All-time" value={pct(stats.hitRate)} />
          <Stat label="Streak" value={stats.streak ? `${stats.streak.kind}${stats.streak.length}` : "—"} />
        </div>
        <HitRateMeter value={stats.windowHitRate} />
      </div>

      <Chips options={TABS} value={tab} onChange={setTab} />
      {mine && tab === "Open" && stats.status !== "suspended" && (
        <Link to="/new" className="btn btn-primary btn-block">+ Post a pick</Link>
      )}
      {list.length === 0 && <div className="empty">No {tab === "Open" ? "open picks" : "graded picks"} yet.</div>}
      <div className="stack">
        {list.map((p) => (
          <PickCard key={p.id} pick={p} showAuthor={false} />
        ))}
      </div>
    </section>
  );

  function StandingBanner() {
    const r = STANDING_RULES;
    if (stats.status === "suspended")
      return (
        <div className="banner banner-suspended">
          <strong>Suspended.</strong> Hit rate over the last {stats.windowSize} graded picks fell below {pct(r.suspendBelow, 0)}.
          {mine ? " You can't post new picks while suspended." : " Their picks are hidden from the feed and can't be tailed."}
        </div>
      );
    if (stats.status === "warning")
      return (
        <div className="banner banner-warning">
          <strong>At risk.</strong> Below {pct(r.warnBelow, 0)} — dropping under {pct(r.suspendBelow, 0)} triggers a suspension.
        </div>
      );
    if (stats.status === "provisional")
      return (
        <div className="banner banner-provisional">
          <strong>Provisional.</strong> {stats.picksUntilRanked} more graded pick{stats.picksUntilRanked === 1 ? "" : "s"} until
          {mine ? " you're" : " they're"} ranked on the leaderboard.
        </div>
      );
    return <StandingBadge status="good" />;
  }
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="stat">
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
      <div className="stat-label">
        {label}
        {hint && <span className="muted"> · {hint}</span>}
      </div>
    </div>
  );
}

function HitRateMeter({ value }: { value: number | null }) {
  const r = STANDING_RULES;
  const v = value ?? 0;
  return (
    <div className="meter" aria-label={`Hit rate ${pct(value)}`}>
      <div className="meter-track">
        <div className="meter-zone zone-suspend" style={{ width: `${r.suspendBelow * 100}%` }} />
        <div className="meter-zone zone-warn" style={{ left: `${r.suspendBelow * 100}%`, width: `${(r.warnBelow - r.suspendBelow) * 100}%` }} />
        {value !== null && <div className="meter-marker" style={{ left: `${v * 100}%` }} />}
      </div>
      <div className="meter-labels muted small">
        <span>0%</span>
        <span style={{ left: `${r.suspendBelow * 100}%` }}>{pct(r.suspendBelow, 0)}</span>
        <span style={{ left: `${r.warnBelow * 100}%` }}>{pct(r.warnBelow, 0)}</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function EditProfile() {
  const { me, dispatch } = useStore();
  return (
    <div className="form">
      <label>
        Display name
        <input value={me.displayName} maxLength={30} onChange={(e) => dispatch({ type: "updateProfile", patch: { displayName: e.target.value } })} />
      </label>
      <label>
        Handle
        <input
          value={me.handle}
          maxLength={20}
          onChange={(e) => dispatch({ type: "updateProfile", patch: { handle: e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() } })}
        />
      </label>
      <label>
        Bio
        <textarea value={me.bio} maxLength={160} rows={2} onChange={(e) => dispatch({ type: "updateProfile", patch: { bio: e.target.value } })} />
      </label>
    </div>
  );
}
