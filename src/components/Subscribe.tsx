import { useState } from "react";
import { usd } from "../domain/monetization";
import { pct, units } from "../format";
import { useStore } from "../store";
import { Avatar } from "./common";

/** Subscribe / unsubscribe button that opens a checkout sheet. */
export function SubscribeButton({ userId, block, label }: { userId: string; block?: boolean; label?: string }) {
  const { userById, subscriptions, isSelling, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const user = userById(userId);
  if (!user?.creator || !isSelling(userId)) return null;
  const subscribed = subscriptions.includes(userId);
  const cls = `btn ${subscribed ? "btn-active" : "btn-primary"} ${block ? "btn-block" : ""}`;

  return (
    <>
      <button
        className={cls}
        onClick={() => {
          if (!subscribed) setOpen(true);
          else if (confirm(`Cancel your ${usd(user.creator!.price)}/mo subscription to ${user.displayName}?`))
            dispatch({ type: "unsubscribe", userId });
        }}
      >
        {subscribed ? "Subscribed ✓" : label ?? `Subscribe · ${usd(user.creator.price)}/mo`}
      </button>
      {open && <SubscribeSheet userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SubscribeSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { userById, statsFor, dispatch } = useStore();
  const user = userById(userId)!;
  const c = user.creator!;
  const s = statsFor(userId);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="author">
          <Avatar user={user} size={48} />
          <span>
            <strong>Subscribe to {user.displayName}</strong>
            <small>
              {s.record.wins}-{s.record.losses} · {pct(s.windowHitRate)} hit · {units(s.unitsNet)}
            </small>
          </span>
        </div>
        <div className="price">
          {usd(c.price)}
          <span className="muted"> / month</span>
        </div>
        <ul className="perks">
          {c.perks.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
        <p className="muted small">
          Cancel anytime. If {user.displayName} is suspended, billing pauses automatically. Past performance doesn't
          guarantee future results.
        </p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            dispatch({ type: "subscribe", userId });
            onClose();
          }}
        >
          Subscribe — demo, no charge
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
