import { useEffect, useRef, useState, type ReactNode } from "react";
import { relTime } from "../format";
import { NO_SOCIAL, useStore, type Comment } from "../store";
import { Avatar, DemoTag, Link } from "./common";

// Line icons in the style of Feather (MIT License, feathericons.com).
const Icon = ({ children, filled }: { children: ReactNode; filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const Heart = (p: { filled?: boolean }) => (
  <Icon filled={p.filled}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Icon>
);
const ThumbDown = (p: { filled?: boolean }) => (
  <Icon filled={p.filled}><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></Icon>
);
const Bubble = () => (
  <Icon><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></Icon>
);
const Repeat = () => (
  <Icon><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></Icon>
);
const Send = () => (
  <Icon><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Icon>
);
const Bookmark = (p: { filled?: boolean }) => (
  <Icon filled={p.filled}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Icon>
);

/** 1234 → "1.2K", 1500000 → "1.5M". */
export const compact = (n: number) =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;

export const ticketUrl = (id: string) => `${window.location.origin}${window.location.pathname}#/t/${id}`;

export async function shareTicket(id: string, text: string): Promise<"shared" | "copied" | "failed"> {
  const url = ticketUrl(id);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Prop Junkies pick", text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "shared"; // user closed the share menu
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}

/**
 * Like · dislike · comments · repost · share · save, in one slim row.
 * `locked` = subscriber-only pick the viewer can't see: counts only, no interacting.
 */
export function SocialBar({ ticketId, ownerId, shareText, locked }: { ticketId: string; ownerId: string; shareText: string; locked?: boolean }) {
  const { myId, social, myReactions, mySaves, reposts, actions } = useStore();
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const c = social[ticketId] ?? NO_SOCIAL;
  const mine = myReactions[ticketId];
  const reposted = !!myId && reposts.some((r) => r.ticketId === ticketId && r.userId === myId);
  const saved = mySaves.includes(ticketId);
  const own = ownerId === myId;
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 1800);
  };

  return (
    <>
      <div className="social" aria-label="Reactions">
        <button className={mine === "like" ? "soc on-like" : "soc"} disabled={locked} onClick={() => actions.react(ticketId, "like")} aria-label="Like" aria-pressed={mine === "like"}>
          <Heart filled={mine === "like"} />
          <span>{compact(c.likes)}</span>
        </button>
        <button className={mine === "dislike" ? "soc on-dislike" : "soc"} disabled={locked} onClick={() => actions.react(ticketId, "dislike")} aria-label="Dislike" aria-pressed={mine === "dislike"}>
          <ThumbDown filled={mine === "dislike"} />
          <span>{compact(c.dislikes)}</span>
        </button>
        <button className="soc" disabled={locked} onClick={() => setSheet(true)} aria-label="Comments">
          <Bubble />
          <span>{compact(c.comments)}</span>
        </button>
        <button
          className={reposted ? "soc on-repost" : "soc"}
          disabled={locked || own}
          onClick={async () => {
            if (await actions.toggleRepost(ticketId)) flash(reposted ? "Repost removed" : "Reposted to your followers");
          }}
          aria-label="Repost"
          aria-pressed={reposted}
        >
          <Repeat />
          <span>{compact(c.reposts)}</span>
        </button>
        <span className="soc-spacer" />
        <button
          className="soc"
          onClick={async () => {
            const r = await shareTicket(ticketId, shareText);
            if (r === "copied") flash("Link copied");
            if (r === "failed") flash("Couldn't share — try again");
          }}
          aria-label="Share"
        >
          <Send />
        </button>
        <button className={saved ? "soc on-save" : "soc"} disabled={locked} onClick={() => actions.toggleSave(ticketId)} aria-label={saved ? "Unsave" : "Save"} aria-pressed={saved}>
          <Bookmark filled={saved} />
        </button>
      </div>
      {note && <div className="soc-note small">{note}</div>}
      {sheet && <CommentsSheet ticketId={ticketId} ownerId={ownerId} onClose={() => setSheet(false)} />}
    </>
  );
}

function CommentsSheet({ ticketId, ownerId, onClose }: { ticketId: string; ownerId: string; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card comments-sheet" role="dialog" aria-modal aria-label="Comments" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <strong>Comments</strong>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <Comments ticketId={ticketId} ownerId={ownerId} />
      </div>
    </div>
  );
}

/** Comment list + box. Used in the pop-up panel and on a ticket's own page. */
export function Comments({ ticketId, ownerId }: { ticketId: string; ownerId: string }) {
  const { myId, userById, blocked, actions } = useStore();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    actions.loadComments(ticketId).then((c) => alive && setList(c));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const shown = (list ?? []).filter((c) => !blocked.includes(c.userId));

  const post = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const c = await actions.addComment(ticketId, text);
    setBusy(false);
    if (c) {
      setList((l) => [...(l ?? []), c]);
      setText("");
      setTimeout(() => end.current?.scrollIntoView({ block: "nearest" }), 50);
    }
  };

  return (
    <div className="comments">
      <div className="comment-list">
        {list === null ? (
          <p className="muted small">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted small">No comments yet. Start the conversation.</p>
        ) : (
          shown.map((c) => {
            const u = userById(c.userId);
            const canDelete = c.userId === myId || ownerId === myId;
            return (
              <div key={c.id} className="comment">
                {u && <Avatar user={u} size={30} />}
                <div className="grow">
                  <div className="small">
                    {u ? (
                      <Link to={`/u/${u.id}`}>
                        <strong>{u.handle}</strong>
                      </Link>
                    ) : (
                      <strong>someone</strong>
                    )}
                    {u && <DemoTag user={u} />} <span className="muted">· {relTime(c.createdAt)}</span>
                  </div>
                  <div className="comment-body">{c.body}</div>
                </div>
                {myId && (
                  <div className="comment-menu">
                    <button className="btn btn-sm btn-ghost" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label="More">
                      ⋯
                    </button>
                    {menu === c.id && (
                      <div className="menu card">
                        {canDelete && (
                          <button
                            onClick={async () => {
                              setMenu(null);
                              if (await actions.deleteComment(c)) setList((l) => (l ?? []).filter((x) => x.id !== c.id));
                            }}
                          >
                            Delete
                          </button>
                        )}
                        {c.userId !== myId && (
                          <>
                            <button
                              onClick={async () => {
                                setMenu(null);
                                const reason = prompt("What's wrong with this comment? (optional)") ?? "";
                                if (await actions.reportComment(c, reason.slice(0, 300))) alert("Thanks — we'll take a look.");
                              }}
                            >
                              Report
                            </button>
                            <button
                              onClick={async () => {
                                setMenu(null);
                                if (confirm(`Block @${u?.handle ?? "this user"}? You won't see their comments or picks.`)) await actions.block(c.userId);
                              }}
                            >
                              Block @{u?.handle ?? "user"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      {myId ? (
        <form
          className="comment-box"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" aria-label="Add a comment" />
          <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy}>
            Post
          </button>
        </form>
      ) : (
        <Link to="/signin" className="btn btn-block">Sign in to comment</Link>
      )}
    </div>
  );
}
