// scan-slip: reads 1–8 screenshots of ONE sportsbook ticket with Claude and returns its legs
// for the user to review. Nothing is posted here and screenshots are never stored.
//
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import sportsData from "./sports.json" with { type: "json" };

const MODEL = "claude-opus-5-5";
const MAX_IMAGES = 8;
const MAX_IMAGE_BASE64 = 6_500_000; // ≈ 4.8 MB per image (Claude accepts up to 5 MB)
const DAILY_SCAN_LIMIT = 25;

const ALLOWED_ORIGINS = ["https://richwitag.github.io", "http://localhost:5173", "http://localhost:4173"];

type ImageType = "image/jpeg" | "image/png" | "image/webp";
interface ScanRequest {
  images: { media_type: ImageType; data: string }[];
  /** The user's local time and time zone, to turn "Today 8:14 PM" into a real date. */
  now: string;
  timeZone: string;
}

const SPORTS = sportsData.sports as { id: string; markets: string[]; leagues?: string[] }[];
const SPORT_IDS = SPORTS.map((s) => s.id);
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

// The exact shape Claude must return.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sportsbook", "ticket_odds", "wager", "legs_shown_on_slip", "legs", "warnings"],
  properties: {
    sportsbook: nullable({ type: "string" }),
    ticket_odds: nullable({ type: "integer" }),
    wager: nullable({ type: "number" }),
    legs_shown_on_slip: nullable({ type: "integer" }),
    legs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sport", "league", "game", "market", "selection", "odds", "starts_at", "status", "confidence", "note"],
        properties: {
          sport: { type: "string", enum: SPORT_IDS },
          league: nullable({ type: "string" }),
          game: { type: "string" },
          market: { type: "string", enum: sportsData.markets },
          selection: { type: "string" },
          odds: nullable({ type: "integer" }),
          starts_at: nullable({ type: "string", format: "date-time" }),
          status: { type: "string", enum: ["open", "won", "lost", "push", "void", "live", "unknown"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: nullable({ type: "string" }),
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `You transcribe screenshots of sportsbook bet slips for Prop Junkies, a picks-tracking app. The user will check everything you return before posting, so accuracy matters more than completeness: never guess a value you can't read.

You receive the screenshots of ONE ticket, in order. Long tickets are split across several screenshots that usually overlap, so the same leg can appear at the bottom of one screenshot and the top of the next. Return every distinct leg exactly once, in slip order.

For each leg:
- sport: pick from the allowed sports. Use the specific league entry when it exists (NFL, NBA, WNBA, MLB, NHL, NCAAF, NCAAM, NCAAW). Otherwise use the general sport (Soccer, Basketball, Ice Hockey) and put the league name in "league", e.g. "Premier League", "EuroLeague", "KHL". league is null for every other sport.
- market: the closest market allowed for that sport. Money Line → Moneyline; run line / puck line / point spread / handicap → Spread (Set Spread or Game Spread for tennis and table tennis); total points, goals or runs → Total; any single-player stat → Player Prop.
- game: the matchup or event as shown, e.g. "Chiefs @ Bills", "Siniakova/Townsend vs Errani/Paolini".
- selection: the pick as shown, including the line, e.g. "Bills -3.5", "Under 2.5", "Josh Allen o34.5 Rush Yds".
- odds: the leg's American odds as an integer (e.g. -325, 150), or null if not shown.
- starts_at: the event start as an ISO 8601 date-time with the user's UTC offset, using the user's current time to resolve words like "Today" or "Tomorrow". null if not shown.
- status: what the slip shows for the leg (open, won, lost, push, void, live), or unknown.
- confidence: low if any part of the leg is cut off, blurry or inferred; medium if you had to interpret it; high if every field is clearly printed.
- note: a short reason when confidence isn't high, otherwise null.

Ticket fields: sportsbook name, ticket_odds (the total American odds printed for the whole ticket), wager (the stake in dollars), and legs_shown_on_slip (the leg count printed on the slip, e.g. "11 Leg Parlay"). Use null for anything not shown.

warnings: short notes the user must check, such as a leg cut off between screenshots, a leg count that doesn't match what you found, or a screenshot that isn't a bet slip.`;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  // Signed-in users only.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return reply(401, { error: "Sign in to scan tickets." });
  const userId = auth.user.id;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return reply(503, { error: "Ticket scanning isn't set up yet." });

  let body: ScanRequest;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Couldn't read the upload." });
  }
  const images = Array.isArray(body?.images) ? body.images : [];
  if (images.length < 1 || images.length > MAX_IMAGES) return reply(400, { error: `Add 1 to ${MAX_IMAGES} screenshots.` });
  for (const img of images) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(img?.media_type) || typeof img.data !== "string")
      return reply(400, { error: "Screenshots must be JPEG, PNG or WebP." });
    if (img.data.length > MAX_IMAGE_BASE64) return reply(400, { error: "One of the screenshots is too large." });
  }

  // Daily limit per user, to keep costs predictable.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("scan_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since);
  if ((count ?? 0) >= DAILY_SCAN_LIMIT)
    return reply(429, { error: `You've reached ${DAILY_SCAN_LIMIT} scans in 24 hours. Enter this ticket by hand or try later.` });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Screenshot ${i + 1} of ${images.length}:` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  });
  content.push({
    type: "text",
    text:
      `User's current time: ${String(body.now).slice(0, 40)} (time zone ${String(body.timeZone).slice(0, 60)}).\n` +
      `Allowed sports and their markets:\n${SPORTS.map((s) => `- ${s.id}: ${s.markets.join(", ")}`).join("\n")}\n\n` +
      `Transcribe this ticket.`,
  });

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      // If the model declines (rare), the API retries on a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    await admin.from("scan_usage").insert({ user_id: userId, images: images.length, ok: false });
    if (e instanceof Anthropic.RateLimitError) return reply(503, { error: "The scanner is busy. Try again in a minute." });
    if (e instanceof Anthropic.AuthenticationError) return reply(503, { error: "Ticket scanning isn't set up correctly." });
    if (e instanceof Anthropic.BadRequestError) return reply(400, { error: "Those screenshots couldn't be read. Try clearer ones." });
    console.error("scan failed", e);
    return reply(502, { error: "The scanner had a problem. Try again or enter the ticket by hand." });
  }

  const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  const text = response.content.find((b) => b.type === "text");
  let parsed: any = null;
  if (response.stop_reason !== "refusal" && response.stop_reason !== "max_tokens" && text?.type === "text") {
    try {
      parsed = JSON.parse(text.text);
    } catch {
      parsed = null;
    }
  }
  await admin.from("scan_usage").insert({ user_id: userId, images: images.length, ok: !!parsed, ...usage });
  if (!parsed) return reply(422, { error: "Couldn't read a ticket in those screenshots. Try clearer ones or enter it by hand." });

  return reply(200, clean(parsed));
});

/** Final safety net: keep only values the app can post, and flag anything dropped. */
function clean(p: any) {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const odds = (v: unknown) => (Number.isInteger(v) && Math.abs(v as number) >= 100 ? (v as number) : null);
  const warnings: string[] = Array.isArray(p.warnings) ? p.warnings.map((w: unknown) => str(w, 200)).filter(Boolean) : [];

  const legs = (Array.isArray(p.legs) ? p.legs : []).slice(0, 25).map((l: any) => {
    const sport = SPORTS.find((s) => s.id === l.sport) ?? SPORTS[0];
    let confidence = ["high", "medium", "low"].includes(l.confidence) ? l.confidence : "low";
    let note = str(l.note, 200);
    let market = l.market;
    if (!sport.markets.includes(market)) {
      market = sport.markets[0];
      confidence = "low";
      note = note ?? "Check the market.";
    }
    const start = typeof l.starts_at === "string" && !isNaN(Date.parse(l.starts_at)) ? new Date(l.starts_at).toISOString() : null;
    return {
      sport: sport.id,
      league: sport.leagues ? str(l.league, 60) : null,
      game: str(l.game, 80) ?? "",
      market,
      selection: str(l.selection, 80) ?? "",
      odds: odds(l.odds),
      startsAt: start,
      status: l.status ?? "unknown",
      confidence,
      note,
    };
  });
  if ((p.legs?.length ?? 0) > 25) warnings.push("Only the first 25 legs were kept — tickets can have up to 25 legs.");

  return {
    sportsbook: str(p.sportsbook, 60),
    ticketOdds: odds(p.ticket_odds),
    wager: typeof p.wager === "number" && p.wager > 0 ? Math.round(p.wager * 100) / 100 : null,
    legsShownOnSlip: Number.isInteger(p.legs_shown_on_slip) ? p.legs_shown_on_slip : null,
    legs,
    warnings,
  };
}
