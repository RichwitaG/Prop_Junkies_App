import { useStore } from "../store";
import { Link } from "./common";
import { LockedCard, PickCard } from "./PickCard";
import { Comments } from "./Social";

/** One ticket and its comments — where shared links land. */
export function TicketPage({ id }: { id: string }) {
  const { ready, picks, locked } = useStore();
  if (!ready) return <div className="empty">Loading…</div>;
  const pick = picks.find((p) => p.id === id);
  const lock = pick ? undefined : locked.find((p) => p.id === id);
  if (!pick && !lock) {
    return (
      <div className="empty">
        This pick isn't available. It may have been deleted or be private. <Link to="/feed">Back to the feed →</Link>
      </div>
    );
  }
  return (
    <section className="stack">
      {pick ? <PickCard pick={pick} /> : <LockedCard pick={lock!} />}
      {pick && !pick.isPractice && (
        <div className="card">
          <h3 className="section-title">Comments</h3>
          <Comments ticketId={pick.id} ownerId={pick.userId} />
        </div>
      )}
    </section>
  );
}
