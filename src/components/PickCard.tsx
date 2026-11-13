import { useState } from "react";
import { pickNet } from "../domain/standing";
import type { Leg, LockedPick, Pick, PickResult } from "../domain/types";
import { odds, pct, relTime, units } from "../format";
import { useStore } from "../store";
import { Avatar, DemoTag, Link, sportLabel, StandingBadge } from "./common";
import { SPORT_INFO } from "../domain/sports";
import { SubscribeButton } from "./Subscribe";

/** Let long names like "Siniakova/Townsend" wrap after the slash instead of mid-word. */
const soft = (t: string) => t.replace(/\//g, "/\u200b");

const RESULT_LABEL: Record<PickResult, string> = {
  pending: "Pending",
  win: "Win",
  loss: "Loss",
  push: "Push",
  void: "Void",
};

function Author({ userId }: { userId: string }) {
  const { userById, statsFor } = useStore();
  const author = userById(userId);
  if (!author) return null;
  const stats = statsFor(userId);
  return (
    <header className="pick-head">
      <Link to={`/u/${author.id}`} className="author">
        <Avatar user={author} size={36} />
        <span>
          <strong>
            {author.displayName}
            {author.verified && <span className="verified" title="Verified">✓</span>}
            <DemoTag user={author} />
          </strong>
          <small>
            @{author.handle} · {pct(stats.windowHitRate, 0)} hit
          </small>
        </span>
      </Link>
      <StandingBadge status={stats.status} compact />
    </header>
  );
}

export function PickCard({ pick, showAuthor = true }: { pick: Pick; showAuthor?: boolean }) {
  const { myId, statsFor, isSelling, allowSelfGrading, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const mine = pick.userId === myId;
  const tailed = !!myId && pick.tailedBy.includes(myId);
  const started = new Date(pick.startsAt).getTime() <= Date.now();
  const net = pickNet(pick);
  const parlay = pick.legs.length > 1;
  const first = pick.legs[0];
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <article className={`card pick result-${pick.result}`}>
      {showAuthor && <Author userId={pick.userId} />}

      <div className="pick-meta">
        {pick.isPractice && <span className="tag tag-practice">Practice</span>}
        {parlay ? (
          <span className="tag">{pick.legs.length}-leg parlay</span>
        ) : (
          first && (
            <>
              <span className="tag">
                {SPORT_INFO[first.sport]?.icon} {sportLabel(first.sport, first.league)}
              </span>
              <span className="tag tag-muted">{first.market}</span>
            </>
          )
        )}
        {pick.access === "subscribers" && isSelling(pick.userId) && <span className="tag tag-premium">Subscribers</span>}
        {!parlay && first && <span className="muted">{soft(first.game)}</span>}
      </div>

      {parlay ? (
        <>
          <ul className="legs">
            {pick.legs.map((l) => (
              <LegRow key={l.id} leg={l} canGrade={mine && allowSelfGrading && pick.result !== "void"} />
            ))}
          </ul>
          <div className="pick-line">
            <span className="muted small">Parlay</span>
            <span className="odds">{odds(pick.odds)}</span>
            <span className="stake">{pick.units}u</span>
          </div>
        </>
      ) : (
        first && (
          <div className="pick-line">
            <span className="selection">{soft(first.selection)}</span>
            <span className="odds">{odds(pick.odds)}</span>
            <span className="stake">{pick.units}u</span>
          </div>
        )
      )}

      {pick.analysis && <p className="analysis">{pick.analysis}</p>}

      <footer className="pick-foot">
        <span className={`result-pill pill-${pick.result}`}>
          {RESULT_LABEL[pick.result]}
          {(pick.result === "win" || pick.result === "loss") && ` ${units(net)}`}
        </span>
        <span className="muted small">
          {pick.result === "pending" ? `Starts ${relTime(pick.startsAt)}` : `Posted ${relTime(pick.createdAt)}`}
        </span>
        <span className="spacer" />
        {!pick.isPractice && <span className="muted small">{pick.tailedBy.length} tailing</span>}
        {!mine && !pick.isPractice && pick.result === "pending" && !started && statsFor(pick.userId).status !== "suspended" && (
          <button disabled={busy} className={tailed ? "btn btn-sm btn-active" : "btn btn-sm"} onClick={() => run(() => actions.tail(pick))}>
            {tailed ? "Tailing ✓" : "Tail"}
          </button>
        )}
        {mine && pick.result === "pending" && !started && (
          <button
            disabled={busy}
            className="btn btn-sm btn-ghost"
            onClick={() => confirm("Delete this pick? You can only do this before the game starts.") && run(() => actions.deletePick(pick.id))}
          >
            Delete
          </button>
        )}
      </footer>

      {mine && allowSelfGrading && !parlay && first && pick.result === "pending" && (
        <div className="demo-grade">
          <span className="muted small">Test grading (automatic from game results later):</span>
          {(["win", "loss", "push"] as const).map((r) => (
            <button key={r} disabled={busy} className="btn btn-sm btn-ghost" onClick={() => run(() => actions.gradeLeg(first.id, r))}>
              {RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function LegRow({ leg, canGrade }: { leg: Leg; canGrade: boolean }) {
  const { actions } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <li className={`leg leg-${leg.result}`}>
      <span className="leg-dot" aria-label={RESULT_LABEL[leg.result]} />
      <span className="leg-main">
        <strong>{soft(leg.selection)}</strong>
        {leg.odds !== null && <span className="odds small"> {odds(leg.odds)}</span>}
        <small className="muted">
          {SPORT_INFO[leg.sport]?.icon} {sportLabel(leg.sport, leg.league)} · {soft(leg.game)}
        </small>
      </span>
      {canGrade && leg.result === "pending" && (
        <span className="leg-grade">
          {(["win", "loss", "push"] as const).map((r) => (
            <button
              key={r}
              disabled={busy}
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                setBusy(true);
                await actions.gradeLeg(leg.id, r);
                setBusy(false);
              }}
            >
              {r === "win" ? "W" : r === "loss" ? "L" : "P"}
            </button>
          ))}
        </span>
      )}
    </li>
  );
}

/** A subscriber-only pick the viewer can't see yet: the games, never the pick. */
export function LockedCard({ pick, showAuthor = true }: { pick: LockedPick; showAuthor?: boolean }) {
  const parlay = pick.legCount > 1;
  return (
    <article className="card pick">
      {showAuthor && <Author userId={pick.userId} />}
      <div className="pick-meta">
        {parlay ? <span className="tag">{pick.legCount}-leg parlay</span> : <span className="tag">
            {SPORT_INFO[pick.sports[0]]?.icon} {pick.sports[0]}
          </span>}
        <span className="tag tag-premium">Subscribers</span>
        <span className="muted">{parlay ? pick.games.join(" · ") : pick.games[0]}</span>
      </div>
      <div className="locked">
        <div className="pick-line blurred" aria-hidden>
          <span className="selection">Hidden Pick +0.0</span>
          <span className="odds">-110</span>
        </div>
        <p className="small">🔒 Subscriber-only pick. It goes public once the game is graded.</p>
        <SubscribeButton userId={pick.userId} label="Unlock with a subscription" />
      </div>
      <footer className="pick-foot">
        <span className="result-pill pill-pending">Pending</span>
        <span className="muted small">Starts {relTime(pick.startsAt)}</span>
        <span className="spacer" />
        <span className="muted small">{pick.tailedBy.length} tailing</span>
      </footer>
    </article>
  );
}
