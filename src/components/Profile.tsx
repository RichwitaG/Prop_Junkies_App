import { useState } from "react";
import { CURRENT_USER_ID } from "../data/seed";
import { monthlyPayout, PLATFORM_FEE, PRICE_MAX, PRICE_MIN, usd } from "../domain/monetization";
import { canMonetize, STANDING_RULES } from "../domain/standing";
import { pct, units } from "../format";
import { useStore } from "../store";
import { Avatar, Chips, Link, StandingBadge } from "./common";
import { PickCard } from "./PickCard";
import { SubscribeButton } from "./Subscribe";

const TABS = ["Open", "History"] as const;

export function Profile({ userId }: { userId: string }) {
  const { userById, statsFor, picksFor, following, isSelling, dispatch } = useStore();
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
            <div className="muted">
              @{user.handle}
              {isSelling(userId) && <> · {user.creator!.subscriberCount.toLocaleString()} subscribers</>} ·{" "}
              {tails.toLocaleString()} tails
            </div>
          </div>
          {mine ? (
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done" : "Edit"}
            </button>
          ) : (
            stats.status !== "suspended" && (
              <button
                className={isFollowing ? "btn btn-sm btn-active" : "btn btn-sm"}
                onClick={() => dispatch({ type: isFollowing ? "unfollow" : "follow", userId })}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )
          )}
        </div>

        {editing && mine ? <EditProfile /> : <p>{user.bio}</p>}

        <StandingBanner />

        {!mine && isSelling(userId) && (
          <div className="creator-box">
            <ul className="perks">
              {user.creator!.perks.map((p) => (
                <li key={p}>✓ {p}</li>
              ))}
            </ul>
            <SubscribeButton userId={userId} block />
          </div>
        )}

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

      {mine && <CreatorSettingsPanel />}

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
          {user!.creator?.enabled && " Paid subscriptions are paused — subscribers aren't billed while suspended."}
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

function CreatorSettingsPanel() {
  const { me, statsFor, dispatch } = useStore();
  const stats = statsFor(me.id);
  const c = me.creator;
  const eligible = canMonetize(stats.status);
  const [perksText, setPerksText] = useState((c?.perks ?? []).join("\n"));

  return (
    <div className="card creator-settings">
      <div className="row-between">
        <h3>Creator subscriptions</h3>
        {eligible && (
          <label className="switch">
            <input
              type="checkbox"
              checked={!!c?.enabled}
              onChange={(e) => dispatch({ type: "updateCreator", patch: { enabled: e.target.checked } })}
            />
            {c?.enabled ? "On" : "Off"}
          </label>
        )}
      </div>

      {!eligible ? (
        <p className="muted small">
          {stats.status === "suspended"
            ? "Subscriptions are unavailable while you're suspended."
            : `Post ${stats.picksUntilRanked} more graded pick${stats.picksUntilRanked === 1 ? "" : "s"} to unlock paid subscriptions. Fans pay for a proven record, so every creator builds one first.`}
        </p>
      ) : !c?.enabled ? (
        <p className="muted small">Charge a monthly price for subscriber-only picks. You keep {pct(1 - PLATFORM_FEE, 0)}.</p>
      ) : (
        <div className="form">
          <div className="row">
            <label>
              Monthly price (USD)
              <input
                type="number"
                min={PRICE_MIN}
                max={PRICE_MAX}
                step="1"
                value={c.price}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= PRICE_MIN && v <= PRICE_MAX) dispatch({ type: "updateCreator", patch: { price: v } });
                }}
              />
            </label>
            <div className="stat">
              <div className="stat-value pos">{usd(monthlyPayout(c.price, c.subscriberCount))}</div>
              <div className="stat-label">
                est. monthly payout · {c.subscriberCount} subs
              </div>
            </div>
          </div>
          <label>
            What subscribers get (one per line)
            <textarea
              rows={3}
              value={perksText}
              onChange={(e) => {
                setPerksText(e.target.value);
                dispatch({ type: "updateCreator", patch: { perks: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } });
              }}
            />
          </label>
          <p className="muted small">
            Platform fee {pct(PLATFORM_FEE, 0)}. If your hit rate drops below {pct(STANDING_RULES.suspendBelow, 0)} you're
            suspended and billing pauses for all your subscribers.
          </p>
        </div>
      )}
    </div>
  );
}
