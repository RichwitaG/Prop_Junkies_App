import { useState, type FormEvent } from "react";
import { CURRENT_USER_ID } from "../data/seed";
import { breakEven, winProfit } from "../domain/standing";
import { MARKETS, SPORTS, type Market, type PickAccess, type Sport } from "../domain/types";
import { pct, uid } from "../format";
import { useStore } from "../store";
import { Link } from "./common";

function defaultStart() {
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setMinutes(0, 0, 0);
  // datetime-local wants local time without timezone.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function NewPick({ onDone }: { onDone: () => void }) {
  const { statsFor, isSelling, dispatch } = useStore();
  const selling = isSelling(CURRENT_USER_ID);
  const stats = statsFor(CURRENT_USER_ID);
  const [sport, setSport] = useState<Sport>("NFL");
  const [market, setMarket] = useState<Market>("Spread");
  const [game, setGame] = useState("");
  const [selection, setSelection] = useState("");
  const [oddsText, setOddsText] = useState("-110");
  const [unitsText, setUnitsText] = useState("1");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [analysis, setAnalysis] = useState("");
  const [access, setAccess] = useState<PickAccess>("subscribers");

  if (stats.status === "suspended") {
    return (
      <div className="banner banner-suspended">
        <strong>You're suspended.</strong> Your hit rate dropped below the minimum, so posting is disabled.{" "}
        <Link to="/rules">See the rules →</Link>
      </div>
    );
  }

  const odds = Number(oddsText);
  const units = Number(unitsText);
  const start = new Date(startsAt);
  const errors: string[] = [];
  if (!game.trim()) errors.push("Enter the game.");
  if (!selection.trim()) errors.push("Enter your pick.");
  if (!Number.isInteger(odds) || Math.abs(odds) < 100) errors.push("Odds must be American format, e.g. -110 or +150.");
  if (!(units > 0 && units <= 5)) errors.push("Stake must be between 0.1u and 5u.");
  if (isNaN(start.getTime()) || start.getTime() <= Date.now()) errors.push("Picks must be posted before the game starts.");
  const valid = errors.length === 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    dispatch({
      type: "post",
      pick: {
        id: uid(),
        userId: CURRENT_USER_ID,
        sport,
        market,
        game: game.trim(),
        selection: selection.trim(),
        odds,
        units,
        analysis: analysis.trim(),
        createdAt: new Date().toISOString(),
        startsAt: start.toISOString(),
        result: "pending",
        access: selling ? access : "free",
        tailedBy: [],
      },
    });
    onDone();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Post a pick</h2>
      {stats.status === "warning" && (
        <div className="banner banner-warning">You're at risk of suspension — be selective.</div>
      )}
      <div className="row">
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Market
          <select value={market} onChange={(e) => setMarket(e.target.value as Market)}>
            {MARKETS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <label>
        Game
        <input value={game} onChange={(e) => setGame(e.target.value)} placeholder="Eagles @ Cowboys" />
      </label>
      <label>
        Your pick
        <input value={selection} onChange={(e) => setSelection(e.target.value)} placeholder={market === "Player Prop" ? "Jalen Hurts o1.5 Pass TD" : "Eagles -3.5"} />
      </label>
      <div className="row">
        <label>
          Odds
          <input value={oddsText} inputMode="numeric" onChange={(e) => setOddsText(e.target.value)} />
        </label>
        <label>
          Stake (units)
          <input value={unitsText} inputMode="decimal" onChange={(e) => setUnitsText(e.target.value)} />
        </label>
        <label>
          Game time
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
      </div>
      {Number.isInteger(odds) && Math.abs(odds) >= 100 && units > 0 && (
        <p className="muted small">
          To win {winProfit(odds, units).toFixed(2)}u · break-even at {pct(breakEven(odds))}
        </p>
      )}
      <label>
        Why? (optional)
        <textarea value={analysis} onChange={(e) => setAnalysis(e.target.value)} rows={3} maxLength={500} placeholder="Share your reasoning — the community learns from it." />
      </label>
      {selling ? (
        <fieldset className="seg">
          <legend>Who can see it before the game?</legend>
          {(["subscribers", "free"] as const).map((a) => (
            <label key={a} className={access === a ? "seg-opt active" : "seg-opt"}>
              <input type="radio" name="access" checked={access === a} onChange={() => setAccess(a)} />
              {a === "subscribers" ? "🔒 Subscribers only" : "🌐 Free for everyone"}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted small">
          This pick will be free. <Link to={`/u/${CURRENT_USER_ID}`}>Turn on subscriptions</Link> to post subscriber-only picks.
        </p>
      )}
      {!valid && (game || selection) && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <p className="muted small">Picks lock at game time and can't be edited — every pick counts toward your hit rate.</p>
      <button className="btn btn-primary btn-block" disabled={!valid}>
        Post pick
      </button>
    </form>
  );
}
