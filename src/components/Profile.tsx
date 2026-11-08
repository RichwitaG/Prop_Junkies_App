import { useState } from "react";
import { monthlyPayout, PLATFORM_FEE, PRICE_MAX, PRICE_MIN, usd } from "../domain/monetization";
import { canMonetize, STANDING_RULES, type LeaderStats } from "../domain/standing";
import type { User } from "../domain/types";
import { pct, units } from "../format";
import { useStore } from "../store";
import { Avatar, Chips, DemoTag, Link, StandingBadge } from "./common";
import { LockedCard, PickCard } from "./PickCard";
import { SubscribeButton } from "./Subscribe";

const OTHER_TABS = ["Open", "History"] as const;
const MY_TABS = ["Open", "History", "Practice"] as const;
type Tab = (typeof MY_TABS)[number];

export function Profile({ userId }: { userId: string }) {
  const { ready, myId, email, userById, statsFor, picksFor, locked, following, isSelling, actions } = useStore();
  const [tab, setTab] = useState<Tab>("Open");
  const [editing, setEditing] = useState(false);
  const user = userById(userId);
  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) return <div className="empty">User not found.</div>;

  const stats = statsFor(userId);
  const mine = userId === myId;
  const isFollowing = following.includes(userId);
  const all = [...picksFor(userId)].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const list = all.filter((p) =>
    tab === "Practice" ? p.isPractice : !p.isPractice && (tab === "Open" ? p.result === "pending" : p.result !== "pending"),
  );
  const lockedHere = tab === "Open" ? locked.filter((p) => p.userId === userId) : [];
  const tails = all.reduce((n, p) => n + p.tailedBy.length, 0);
  const needsSetup = mine && user.handle.startsWith("user_");

  return (
    <section>
      <div className="card profile">
        <div className="profile-head">
          <Avatar user={user} size={64} />
          <div className="grow">
            <h2>
              {user.displayName}
              {user.verified && <span className="verified">✓</span>}
              <DemoTag user={user} />
            </h2>
            <div className="muted">
              @{user.handle}
              {isSelling(userId) && (
                <> · {user.creator!.subscriberCount.toLocaleString()} subscriber{user.creator!.subscriberCount === 1 ? "" : "s"}</>
              )}{" "}
              · {tails.toLocaleString()} tail{tails === 1 ? "" : "s"}
            </div>
          </div>
          {mine ? (
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Cancel" : "Edit"}
            </button>
          ) : (
            stats.status !== "suspended" && (
              <button className={isFollowing ? "btn btn-sm btn-active" : "btn btn-sm"} onClick={() => actions.follow(userId, !isFollowing)}>
                {isFollowing ? "Following" : "Follow"}
              </button>
            )
          )}
        </div>

        {needsSetup && !editing && (
          <div className="banner banner-provisional">
            <strong>Welcome!</strong> Pick a handle and display name so people can find you.{" "}
            <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
              Set up profile
            </button>
          </div>
        )}

        {editing && mine ? <EditProfile user={user} onDone={() => setEditing(false)} /> : user.bio && <p>{user.bio}</p>}

        <StandingBanner stats={stats} mine={mine} user={user} />

        {!mine && isSelling(userId) && (
          <div className="creator-box">
            {user.creator!.perks.length > 0 && (
              <ul className="perks">
                {user.creator!.perks.map((p) => (
                  <li key={p}>✓ {p}</li>
                ))}
              </ul>
            )}
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

      <Chips options={mine ? MY_TABS : OTHER_TABS} value={tab} onChange={setTab} />
      {mine && tab !== "History" && (
        <Link to="/new" className="btn btn-primary btn-block">
          + Post a {tab === "Practice" ? "practice " : ""}pick
        </Link>
      )}
      {tab === "Practice" && <p className="muted small">Only you can see practice picks. They never count toward your record.</p>}
      {list.length === 0 && lockedHere.length === 0 && (
        <div className="empty">No {tab === "Open" ? "open" : tab === "History" ? "graded" : "practice"} picks yet.</div>
      )}
      <div className="stack">
        {lockedHere.map((p) => (
          <LockedCard key={p.id} pick={p} showAuthor={false} />
        ))}
        {list.map((p) => (
          <PickCard key={p.id} pick={p} showAuthor={false} />
        ))}
      </div>

      {mine && (
        <p className="muted small center">
          Signed in as {email} ·{" "}
          <button className="linklike" onClick={() => actions.signOut()}>
            Sign out
          </button>
        </p>
      )}
    </section>
  );
}

function StandingBanner({ stats, mine, user }: { stats: LeaderStats; mine: boolean; user: User }) {
  const r = STANDING_RULES;
  if (stats.status === "suspended")
    return (
      <div className="banner banner-suspended">
        <strong>Suspended.</strong> Hit rate over the last {stats.windowSize} graded picks fell below {pct(r.suspendBelow, 0)}.
        {mine ? " You can't post real picks while suspended." : " Their picks are hidden from the feed and can't be tailed."}
        {user.creator?.enabled && " Paid subscriptions are paused — subscribers aren't billed while suspended."}
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

function EditProfile({ user, onDone }: { user: User; onDone: () => void }) {
  const { actions } = useStore();
  const [displayName, setDisplayName] = useState(user.displayName === "New member" ? "" : user.displayName);
  const [handle, setHandle] = useState(user.handle.startsWith("user_") ? "" : user.handle);
  const [bio, setBio] = useState(user.bio);
  const [busy, setBusy] = useState(false);
  const valid = displayName.trim().length > 0 && /^[a-z0-9_]{3,20}$/.test(handle);

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        const ok = await actions.updateProfile({ displayName: displayName.trim(), handle, bio: bio.trim() });
        setBusy(false);
        if (ok) onDone();
      }}
    >
      <label>
        Display name
        <input value={displayName} maxLength={30} onChange={(e) => setDisplayName(e.target.value)} placeholder="Sharp Side Sam" />
      </label>
      <label>
        Handle
        <input
          value={handle}
          maxLength={20}
          onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())}
          placeholder="sharpside"
        />
        <span className="muted small">3–20 characters: letters, numbers and _</span>
      </label>
      <label>
        Bio
        <textarea value={bio} maxLength={160} rows={2} onChange={(e) => setBio(e.target.value)} placeholder="What do you bet on?" />
      </label>
      <button className="btn btn-primary" disabled={!valid || busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function CreatorSettingsPanel() {
  const { me, statsFor, actions } = useStore();
  const c = me?.creator;
  const [price, setPrice] = useState(String(c?.price ?? 9.99));
  const [perksText, setPerksText] = useState((c?.perks ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const stats = statsFor(me.id);
  const eligible = canMonetize(stats.status);
  const priceNum = Number(price);
  const priceOk = priceNum >= PRICE_MIN && priceNum <= PRICE_MAX;

  const save = async (patch: Parameters<typeof actions.updateCreator>[0]) => {
    setBusy(true);
    await actions.updateCreator(patch);
    setBusy(false);
  };

  return (
    <div className="card creator-settings">
      <div className="row-between">
        <h3>Creator subscriptions</h3>
        {eligible && (
          <label className="switch">
            <input type="checkbox" disabled={busy} checked={!!c?.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
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
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (priceOk) save({ price: priceNum, perks: perksText.split("\n").map((l) => l.trim()).filter(Boolean) });
          }}
        >
          <div className="row">
            <label>
              Monthly price (USD)
              <input type="number" min={PRICE_MIN} max={PRICE_MAX} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <div className="stat">
              <div className="stat-value pos">{usd(monthlyPayout(c.price, c.subscriberCount))}</div>
              <div className="stat-label">est. monthly payout · {c.subscriberCount} subs</div>
            </div>
          </div>
          <label>
            What subscribers get (one per line)
            <textarea rows={3} value={perksText} onChange={(e) => setPerksText(e.target.value)} placeholder={"Every pick, before the line moves\nFull write-ups"} />
          </label>
          {!priceOk && <p className="errors">Price must be between {usd(PRICE_MIN)} and {usd(PRICE_MAX)}.</p>}
          <button className="btn btn-primary" disabled={busy || !priceOk}>
            {busy ? "Saving…" : "Save"}
          </button>
          <p className="muted small">
            Platform fee {pct(PLATFORM_FEE, 0)}. If your hit rate drops below {pct(STANDING_RULES.suspendBelow, 0)} you're
            suspended and billing pauses for all your subscribers.
          </p>
        </form>
      )}
    </div>
  );
}
