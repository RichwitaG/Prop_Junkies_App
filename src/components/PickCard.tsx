import { CURRENT_USER_ID } from "../data/seed";
import { pickNet } from "../domain/standing";
import type { Pick, PickResult } from "../domain/types";
import { odds, pct, relTime, units } from "../format";
import { useStore } from "../store";
import { Avatar, Link, StandingBadge } from "./common";
import { SubscribeButton } from "./Subscribe";

const RESULT_LABEL: Record<PickResult, string> = {
  pending: "Pending",
  win: "Win",
  loss: "Loss",
  push: "Push",
  void: "Void",
};

export function PickCard({ pick, showAuthor = true }: { pick: Pick; showAuthor?: boolean }) {
  const { userById, statsFor, canSee, isSelling, dispatch } = useStore();
  const author = userById(pick.userId);
  if (!author) return null;
  const stats = statsFor(author.id);
  const mine = pick.userId === CURRENT_USER_ID;
  const tailed = pick.tailedBy.includes(CURRENT_USER_ID);
  const started = new Date(pick.startsAt).getTime() <= Date.now();
  const net = pickNet(pick);
  const locked = !canSee(pick);

  return (
    <article className={`card pick result-${pick.result}`}>
      {showAuthor && (
        <header className="pick-head">
          <Link to={`/u/${author.id}`} className="author">
            <Avatar user={author} size={36} />
            <span>
              <strong>
                {author.displayName}
                {author.verified && <span className="verified" title="Verified">✓</span>}
              </strong>
              <small>
                @{author.handle} · {pct(stats.windowHitRate, 0)} hit
              </small>
            </span>
          </Link>
          <StandingBadge status={stats.status} compact />
        </header>
      )}

      <div className="pick-meta">
        <span className="tag">{pick.sport}</span>
        <span className="tag tag-muted">{pick.market}</span>
        {pick.access === "subscribers" && isSelling(pick.userId) && <span className="tag tag-premium">Subscribers</span>}
        <span className="muted">{pick.game}</span>
      </div>

      {locked ? (
        <div className="locked">
          <div className="pick-line blurred" aria-hidden>
            <span className="selection">Hidden Pick +0.0</span>
            <span className="odds">-110</span>
          </div>
          <p className="small">🔒 Subscriber-only pick. It goes public once the game is graded.</p>
          <SubscribeButton userId={pick.userId} label="Unlock with a subscription" />
        </div>
      ) : (
        <>
          <div className="pick-line">
            <span className="selection">{pick.selection}</span>
            <span className="odds">{odds(pick.odds)}</span>
            <span className="stake">{pick.units}u</span>
          </div>
          {pick.analysis && <p className="analysis">{pick.analysis}</p>}
        </>
      )}

      <footer className="pick-foot">
        <span className={`result-pill pill-${pick.result}`}>
          {RESULT_LABEL[pick.result]}
          {(pick.result === "win" || pick.result === "loss") && ` ${units(net)}`}
        </span>
        <span className="muted small">
          {pick.result === "pending" ? `Starts ${relTime(pick.startsAt)}` : `Posted ${relTime(pick.createdAt)}`}
        </span>
        <span className="spacer" />
        <span className="muted small">{pick.tailedBy.length} tailing</span>
        {!mine && !locked && pick.result === "pending" && stats.status !== "suspended" && (
          <button className={tailed ? "btn btn-sm btn-active" : "btn btn-sm"} onClick={() => dispatch({ type: "tail", pickId: pick.id })}>
            {tailed ? "Tailing ✓" : "Tail"}
          </button>
        )}
        {mine && pick.result === "pending" && !started && (
          <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: "delete", pickId: pick.id })}>
            Delete
          </button>
        )}
      </footer>

      {mine && pick.result === "pending" && (
        <div className="demo-grade">
          <span className="muted small">Demo grading (auto from scores feed in production):</span>
          {(["win", "loss", "push"] as const).map((r) => (
            <button key={r} className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: "grade", pickId: pick.id, result: r })}>
              {RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
