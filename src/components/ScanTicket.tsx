import { useEffect, useRef, useState } from "react";
import type { Market, Sport } from "../domain/types";
import { supabase } from "../lib/supabase";

/** What the scanner returns (see supabase/functions/scan-slip). Nothing is posted until the user confirms. */
export interface ScanResult {
  sportsbook: string | null;
  ticketOdds: number | null;
  wager: number | null;
  legsShownOnSlip: number | null;
  legs: {
    sport: Sport;
    league: string | null;
    game: string;
    market: Market;
    selection: string;
    odds: number | null;
    startsAt: string | null;
    status: "open" | "won" | "lost" | "push" | "void" | "live" | "unknown";
    confidence: "high" | "medium" | "low";
    note: string | null;
  }[];
  warnings: string[];
}

const MAX_SHOTS = 8;
// Claude reads images up to 2576px on the long edge; bigger only adds upload size.
const MAX_EDGE = 2576;

interface Shot {
  id: number;
  file: File;
  url: string;
}
let shotId = 1;

/** Shrink to MAX_EDGE and re-encode as JPEG so uploads stay small. */
async function toJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Local time with UTC offset, e.g. 2026-11-10T19:05:00-05:00, so "Today 8:14 PM" resolves correctly. */
function localIsoWithOffset(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

export function ScanTicket({ onScanned }: { onScanned: (r: ScanResult) => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  const add = (files: FileList | null) => {
    if (!files) return;
    const next = [...files].filter((f) => f.type.startsWith("image/")).map((file) => ({ id: shotId++, file, url: URL.createObjectURL(file) }));
    setShots((s) => [...s, ...next].slice(0, MAX_SHOTS));
    setError(null);
  };
  const move = (i: number, d: -1 | 1) =>
    setShots((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const images = await Promise.all(shots.map(async (s) => ({ media_type: "image/jpeg", data: await toJpegBase64(s.file) })));
      const { data, error } = await supabase.functions.invoke<ScanResult>("scan-slip", {
        body: { images, now: localIsoWithOffset(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      if (error) {
        let msg = "The scanner had a problem. Try again or enter the ticket by hand.";
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) msg = body.error;
        } catch {
          /* keep default */
        }
        setError(msg);
      } else if (!data || data.legs.length === 0) {
        setError("No legs found in those screenshots. Try clearer ones or enter the ticket by hand.");
      } else {
        onScanned(data);
        setShots([]);
      }
    } catch {
      setError("Couldn't prepare those images. Try screenshots saved as PNG or JPEG.");
    }
    setBusy(false);
  };

  return (
    <div className="scan">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {shots.length === 0 ? (
        <button type="button" className="btn btn-block scan-start" onClick={() => input.current?.click()}>
          📸 Scan your ticket
          <span className="muted small">Upload one or more screenshots — long parlays can take several</span>
        </button>
      ) : (
        <>
          <div className="row-between">
            <strong className="small">
              {shots.length} screenshot{shots.length === 1 ? "" : "s"} · top of the ticket first
            </strong>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setShots([])}>
              Clear
            </button>
          </div>
          <div className="shots">
            {shots.map((s, i) => (
              <figure key={s.id} className="shot">
                <img src={s.url} alt={`Screenshot ${i + 1}`} />
                <figcaption>
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">‹</button>
                  <span>{i + 1}</span>
                  <button type="button" disabled={busy || i === shots.length - 1} onClick={() => move(i, 1)} aria-label="Move later">›</button>
                  <button type="button" disabled={busy} onClick={() => setShots((x) => x.filter((y) => y.id !== s.id))} aria-label="Remove">✕</button>
                </figcaption>
              </figure>
            ))}
            {shots.length < MAX_SHOTS && (
              <button type="button" className="shot shot-add" disabled={busy} onClick={() => input.current?.click()}>
                +<span className="small">Add</span>
              </button>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={read}>
            {busy ? "Reading your ticket… long tickets can take up to a minute" : "Read my ticket"}
          </button>
        </>
      )}
      {error && <p className="errors">{error}</p>}
    </div>
  );
}
