import { useState, type FormEvent } from "react";
import { breakEven, parlayOdds, winProfit } from "../domain/standing";
import { marketsFor, SPORT_INFO, sportsBySeason } from "../domain/sports";
import type { Market, PickAccess, Sport } from "../domain/types";
import { odds as fmtOdds, pct } from "../format";
import { useStore } from "../store";
import { Link } from "./common";
import { ScanTicket, type ScanResult } from "./ScanTicket";

const MAX_LEGS = 25;

function defaultStart() {
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setMinutes(0, 0, 0);
  // datetime-local wants local time without timezone.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface LegDraft {
  key: number;
  sport: Sport;
  league: string;
  market: Market;
  game: string;
  selection: string;
  odds: string;
  startsAt: string;
  /** Set when the leg came from a scanned ticket. */
  confidence?: "high" | "medium" | "low";
  note?: string | null;
  slipStatus?: string;
}

let nextKey = 1;
const blankLeg = (prev?: LegDraft): LegDraft => ({
  key: nextKey++,
  sport: prev?.sport ?? sportsBySeason()[0],
  league: prev?.league ?? "",
  market: prev?.market ?? marketsFor(prev?.sport ?? sportsBySeason()[0])[0],
  game: "",
  selection: "",
  odds: "-110",
  startsAt: prev?.startsAt ?? defaultStart(),
});

/** ISO time → the local "YYYY-MM-DDTHH:mm" a datetime-local input wants ("" if unknown). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fmt = (o: number) => (o > 0 ? `+${o}` : String(o));

const parseOdds = (s: string) => {
  const n = Number(s.trim().replace("−", "-").replace(/^\+/, ""));
  return Number.isInteger(n) && Math.abs(n) >= 100 ? n : null;
};

export function NewPick({ onDone }: { onDone: () => void }) {
  const { myId, statsFor, isSelling, unitSizeCents, actions } = useStore();
  const [legs, setLegs] = useState<LegDraft[]>(() => [blankLeg()]);
  const [unitsText, setUnitsText] = useState("1");
  const [analysis, setAnalysis] = useState("");
  const [access, setAccess] = useState<PickAccess>("subscribers");
  const [practice, setPractice] = useState(false);
  const [customOdds, setCustomOdds] = useState("");
  const [stakeText, setStakeText] = useState("");
  // Most people enter the dollar wager and the app works out units; some prefer typing units.
  const [byUnits, setByUnits] = useState(false);
  const [unitSizeText, setUnitSizeText] = useState("");
  const [savingUnit, setSavingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const applyScan = (r: ScanResult) => {
    setLegs(
      r.legs.map((l) => ({
        key: nextKey++,
        sport: l.sport,
        league: l.league ?? "",
        market: l.market,
        game: l.game,
        selection: l.selection,
        odds: l.odds !== null ? fmt(l.odds) : "",
        startsAt: toLocalInput(l.startsAt),
        confidence: l.confidence,
        note: l.note,
        slipStatus: l.status,
      })),
    );
    setCustomOdds(r.legs.length > 1 && r.ticketOdds !== null ? fmt(r.ticketOdds) : "");
    setStakeText(r.wager ? String(r.wager) : "");
    if (r.wager) setByUnits(false);
    setScan(r);
    setConfirmed(false);
    setTouched(true);
    window.scrollTo(0, 0);
  };

  if (!myId) {
    return (
      <div className="card">
        <h2>Post a pick</h2>
        <p>Sign in to post picks and start building your record.</p>
        <Link to="/signin" className="btn btn-primary btn-block">Sign in with email</Link>
      </div>
    );
  }

  const stats = statsFor(myId);
  const selling = isSelling(myId);
  const suspended = stats.status === "suspended";
  if (suspended && !practice) {
    return (
      <div className="stack">
        <div className="banner banner-suspended">
          <strong>You're suspended.</strong> Your hit rate dropped below the minimum, so real picks are disabled.{" "}
          <Link to="/rules">See the rules →</Link>
        </div>
        <button className="btn btn-block" onClick={() => setPractice(true)}>
          Post a practice pick instead
        </button>
      </div>
    );
  }

  const parlay = legs.length > 1;
  const update = (key: number, patch: Partial<LegDraft>) =>
    setLegs((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Changing sport resets the market if the new sport doesn't have it, and clears the league.
  const changeSport = (key: number, sport: Sport) =>
    setLegs((ls) =>
      ls.map((l) =>
        l.key !== key
          ? l
          : { ...l, sport, league: "", market: marketsFor(sport).includes(l.market) ? l.market : marketsFor(sport)[0] },
      ),
    );
  const sportOrder = sportsBySeason();

  const legOdds = legs.map((l) => parseOdds(l.odds));
  const computed = parlay ? parlayOdds(legOdds) : legOdds[0];
  const ticketOdds = parlay && customOdds.trim() ? parseOdds(customOdds) : computed;
  const stake = stakeText.trim() ? Number(stakeText.replace(/[$,]/g, "")) : null;
  const unitSize = unitSizeCents ? unitSizeCents / 100 : null;
  // Units shown publicly = dollar wager ÷ your private unit size.
  const units = byUnits ? Number(unitsText) : stake && unitSize ? Math.round((stake / unitSize) * 100) / 100 : NaN;

  const errors: string[] = [];
  legs.forEach((l, i) => {
    const n = parlay ? `Leg ${i + 1}: ` : "";
    if (!l.game.trim()) errors.push(`${n}enter the ${SPORT_INFO[l.sport].eventLabel.toLowerCase()}.`);
    if (!l.selection.trim()) errors.push(`${n}enter the pick.`);
    if (!parlay && legOdds[i] === null) errors.push("Odds must be American format, e.g. -110 or +150.");
    const t = new Date(l.startsAt).getTime();
    if (isNaN(t) || t <= Date.now()) errors.push(`${n}picks must be posted before the game starts.`);
  });
  if (parlay && ticketOdds === null)
    errors.push(customOdds.trim() ? "Parlay odds must be American format, e.g. +596." : "Enter odds for every leg, or the parlay odds from your slip.");
  if (byUnits) {
    if (!(units >= 0.01 && units <= 25)) errors.push("Units must be between 0.01u and 25u.");
  } else if (!unitSize) {
    errors.push("Set your unit size so we can work out the units.");
  } else if (stake === null || !(stake > 0 && stake <= 1_000_000)) {
    errors.push("Enter your wager in dollars.");
  } else if (!(units >= 0.01 && units <= 25)) {
    errors.push(`That's ${units}u — picks must be between 0.01u and 25u.`);
  }
  if (scan && !confirmed) errors.push("Tick the box to confirm you checked every leg against your slip.");
  const valid = errors.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    const ok = await actions.post({
      isPractice: practice,
      access: selling && !practice ? access : "free",
      odds: ticketOdds ?? undefined,
      units,
      analysis: analysis.trim(),
      stakeCents: !byUnits && stake ? Math.round(stake * 100) : undefined,
      legs: legs.map((l, i) => ({
        sport: l.sport,
        league: SPORT_INFO[l.sport].leagues ? l.league.trim() || null : null,
        market: l.market,
        game: l.game.trim(),
        selection: l.selection.trim(),
        odds: legOdds[i],
        startsAt: new Date(l.startsAt).toISOString(),
      })),
    });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Post a pick</h2>
      {scan ? (
        <ScanReview scan={scan} legCount={legs.length} onDiscard={() => {
          setScan(null);
          setLegs([blankLeg()]);
          setCustomOdds("");
          setStakeText("");
          setTouched(false);
        }} />
      ) : (
        <ScanTicket onScanned={applyScan} />
      )}
      {stats.status === "warning" && !practice && (
        <div className="banner banner-warning">You're at risk of suspension — be selective.</div>
      )}

      <fieldset className="seg">
        <legend>Type</legend>
        <label className={!practice ? "seg-opt active" : "seg-opt"}>
          <input type="radio" name="kind" checked={!practice} onChange={() => setPractice(false)} disabled={suspended} />
          🎯 Real pick — counts toward your record
        </label>
        <label className={practice ? "seg-opt active" : "seg-opt"}>
          <input type="radio" name="kind" checked={practice} onChange={() => setPractice(true)} />
          🧪 Practice — private, never counts
        </label>
      </fieldset>

      {legs.map((l, i) => {
        const info = SPORT_INFO[l.sport];
        return (
        <div key={l.key} className={[parlay || l.confidence ? "leg-editor" : "", l.confidence ? `leg-${l.confidence}` : ""].join(" ")}>
          {(parlay || l.confidence) && (
            <div className="row-between">
              <strong className="small">
                {parlay ? `Leg ${i + 1}` : "Your pick"}
                {l.confidence && l.confidence !== "high" && (
                  <span className={`conf conf-${l.confidence}`}>{l.confidence === "low" ? "Check carefully" : "Double-check"}</span>
                )}
              </strong>
              {parlay && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLegs((ls) => ls.filter((x) => x.key !== l.key))}>
                  Remove
                </button>
              )}
            </div>
          )}
          {l.note && <p className="small conf-note">⚠️ {l.note}</p>}
          {l.slipStatus && ["won", "lost", "push", "void", "live"].includes(l.slipStatus) && (
            <p className="small conf-note">⚠️ The slip shows this leg as {l.slipStatus}. Picks can only be posted before games start.</p>
          )}
          <div className="row">
            <label>
              Sport
              <select value={l.sport} onChange={(e) => changeSport(l.key, e.target.value as Sport)}>
                {sportOrder.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_INFO[s].icon} {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Market
              <select value={l.market} onChange={(e) => update(l.key, { market: e.target.value as Market })}>
                {marketsFor(l.sport).map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          {info.leagues && (
            <label>
              League
              <input
                value={l.league}
                maxLength={60}
                list={`leagues-${l.sport}`}
                onChange={(e) => update(l.key, { league: e.target.value })}
                placeholder={info.leagues[0]}
              />
              <datalist id={`leagues-${l.sport}`}>
                {info.leagues.map((lg) => <option key={lg} value={lg} />)}
              </datalist>
            </label>
          )}
          <label>
            {info.eventLabel}
            <input value={l.game} maxLength={80} onChange={(e) => update(l.key, { game: e.target.value })} placeholder={info.eventPlaceholder} />
          </label>
          <label>
            Pick
            <input
              value={l.selection}
              maxLength={80}
              onChange={(e) => update(l.key, { selection: e.target.value })}
              placeholder={info.selectionPlaceholder}
            />
          </label>
          <div className="row">
            <label>
              Odds{parlay && " (optional)"}
              <input value={l.odds} inputMode="numeric" onChange={(e) => update(l.key, { odds: e.target.value })} />
            </label>
            <label>
              Start time
              <input type="datetime-local" value={l.startsAt} onChange={(e) => update(l.key, { startsAt: e.target.value })} />
            </label>
          </div>
        </div>
        );
      })}

      {legs.length < MAX_LEGS && (
        <button type="button" className="btn btn-block" onClick={() => setLegs((ls) => [...ls, blankLeg(ls[ls.length - 1])])}>
          + Add a leg {legs.length === 1 && "(make it a parlay)"}
        </button>
      )}

      {parlay && (
        <div className="row">
          <label>
            Parlay odds from your slip
            <input value={customOdds} inputMode="numeric" onChange={(e) => setCustomOdds(e.target.value)} placeholder={computed !== null ? fmtOdds(computed) : "+596"} />
          </label>
        </div>
      )}
      {parlay && (
        <p className="muted small">
          A parlay counts as one pick: every leg has to hit for a win, and one losing leg makes it a loss.
          {computed !== null && !customOdds.trim() && ` Priced from the legs at ${fmtOdds(computed)}.`}
        </p>
      )}

      <div className="stake-box">
        {!byUnits && (!unitSize || editingUnit) ? (
          <>
            <strong className="small">Set your unit size (private)</strong>
            <p className="muted small">
              What's 1 unit for you in dollars? Your wagers are shown to others only in units — nobody ever sees your dollars.
            </p>
            <div className="row">
              <label>
                1 unit =
                <input value={unitSizeText} inputMode="decimal" onChange={(e) => setUnitSizeText(e.target.value)} placeholder="$100" />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingUnit || !(Number(unitSizeText.replace(/[$,]/g, "")) >= 1)}
                onClick={async () => {
                  setSavingUnit(true);
                  if (await actions.setUnitSize(Math.round(Number(unitSizeText.replace(/[$,]/g, "")) * 100))) setEditingUnit(false);
                  setSavingUnit(false);
                }}
              >
                {savingUnit ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : byUnits ? (
          <label>
            Stake (units)
            <input value={unitsText} inputMode="decimal" onChange={(e) => setUnitsText(e.target.value)} />
          </label>
        ) : (
          <div className="row">
            <label>
              Wager ($, private)
              <input value={stakeText} inputMode="decimal" onChange={(e) => setStakeText(e.target.value)} placeholder="$25" />
            </label>
            <div className="stat units-out">
              <div className="stat-value">{units >= 0 ? `${units}u` : "—"}</div>
              <div className="stat-label">
                1u = ${unitSize!.toLocaleString()} ·{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    setUnitSizeText(String(unitSize));
                    setEditingUnit(true);
                  }}
                >
                  change
                </button>
              </div>
            </div>
          </div>
        )}
        <button type="button" className="linklike small" onClick={() => setByUnits((b) => !b)}>
          {byUnits ? "Enter the dollar wager instead" : "Enter units instead"}
        </button>
      </div>
      {ticketOdds !== null && units > 0 && (
        <p className="muted small">
          To win {winProfit(ticketOdds, units).toFixed(2)}u · break-even at {pct(breakEven(ticketOdds))}. Others see units only, never dollars.
        </p>
      )}

      <label>
        Why? (optional)
        <textarea value={analysis} onChange={(e) => setAnalysis(e.target.value)} rows={3} maxLength={500} placeholder="Share your reasoning — the community learns from it." />
      </label>

      {!practice &&
        (selling ? (
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
            This pick will be free. <Link to={`/u/${myId}`}>Turn on subscriptions</Link> to post subscriber-only picks.
          </p>
        ))}

      {scan && (
        <label className="confirm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I checked every leg, the odds and the start times against my slip.
        </label>
      )}
      {touched && !valid && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <p className="muted small">
        {practice
          ? "Practice picks are only visible to you."
          : "Picks lock at game time and can't be edited — every pick counts toward your hit rate."}
      </p>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Posting…" : practice ? "Post practice pick" : "Post pick"}
      </button>
    </form>
  );
}

/** Summary shown above the legs after a scan. */
function ScanReview({ scan, legCount, onDiscard }: { scan: ScanResult; legCount: number; onDiscard: () => void }) {
  const unsure = scan.legs.filter((l) => l.confidence !== "high").length;
  const missingTimes = scan.legs.filter((l) => !l.startsAt).length;
  const countMismatch = scan.legsShownOnSlip !== null && scan.legsShownOnSlip !== scan.legs.length;
  return (
    <div className="banner banner-provisional scan-review">
      <div className="row-between">
        <strong>
          📋 Review your scanned ticket{scan.sportsbook ? ` from ${scan.sportsbook}` : ""}
        </strong>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDiscard}>
          Start over
        </button>
      </div>
      <p className="small">
        We read {scan.legs.length} leg{scan.legs.length === 1 ? "" : "s"}
        {scan.ticketOdds !== null && <> at {fmt(scan.ticketOdds)}</>}. Check each one against your slip and fix anything
        that's off — nothing is posted until you confirm.
      </p>
      <ul className="small">
        {countMismatch && (
          <li>⚠️ The slip says {scan.legsShownOnSlip} legs but we found {scan.legs.length}. Add any missing screenshot or leg.</li>
        )}
        {unsure > 0 && <li>⚠️ {unsure} leg{unsure === 1 ? " is" : "s are"} highlighted for a closer look.</li>}
        {missingTimes > 0 && <li>⚠️ Add the start time for {missingTimes} leg{missingTimes === 1 ? "" : "s"}.</li>}
        {scan.warnings.map((w) => <li key={w}>⚠️ {w}</li>)}
        {legCount !== scan.legs.length && <li>You've changed the number of legs to {legCount}.</li>}
      </ul>
    </div>
  );
}
