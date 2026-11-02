import type { Market, Pick, PickResult, Sport, User } from "../domain/types";

/** Demo data so the app has a living community on first launch. */

export const CURRENT_USER_ID = "me";

// Small deterministic PRNG so the seed is the same on every load.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES: { sport: Sport; game: string; sides: [string, string]; props: string[] }[] = [
  { sport: "NFL", game: "Eagles @ Cowboys", sides: ["Eagles", "Cowboys"], props: ["Jalen Hurts o1.5 Pass TD", "CeeDee Lamb o84.5 Rec Yds"] },
  { sport: "NFL", game: "Chiefs @ Bills", sides: ["Chiefs", "Bills"], props: ["Josh Allen o34.5 Rush Yds", "Travis Kelce Anytime TD"] },
  { sport: "NFL", game: "49ers @ Rams", sides: ["49ers", "Rams"], props: ["Christian McCaffrey o89.5 Rush Yds", "Puka Nacua o6.5 Rec"] },
  { sport: "NFL", game: "Lions @ Packers", sides: ["Lions", "Packers"], props: ["Jahmyr Gibbs Anytime TD", "Jordan Love o249.5 Pass Yds"] },
  { sport: "NBA", game: "Celtics @ Knicks", sides: ["Celtics", "Knicks"], props: ["Jayson Tatum o27.5 Pts", "Jalen Brunson o6.5 Ast"] },
  { sport: "NBA", game: "Nuggets @ Lakers", sides: ["Nuggets", "Lakers"], props: ["Nikola Jokic o11.5 Ast", "LeBron James o7.5 Reb"] },
  { sport: "NBA", game: "Thunder @ Mavericks", sides: ["Thunder", "Mavericks"], props: ["SGA o31.5 Pts", "Luka Doncic o3.5 3PM"] },
  { sport: "MLB", game: "Yankees @ Red Sox", sides: ["Yankees", "Red Sox"], props: ["Aaron Judge o1.5 TB", "Gerrit Cole o6.5 K"] },
  { sport: "MLB", game: "Dodgers @ Padres", sides: ["Dodgers", "Padres"], props: ["Shohei Ohtani HR", "Freddie Freeman o0.5 RBI"] },
  { sport: "NHL", game: "Oilers @ Avalanche", sides: ["Oilers", "Avalanche"], props: ["Connor McDavid o1.5 Pts", "Nathan MacKinnon o3.5 SOG"] },
  { sport: "NHL", game: "Rangers @ Bruins", sides: ["Rangers", "Bruins"], props: ["Artemi Panarin o0.5 Ast", "David Pastrnak Anytime Goal"] },
  { sport: "NCAAF", game: "Georgia @ Alabama", sides: ["Georgia", "Alabama"], props: ["Georgia QB o224.5 Pass Yds"] },
  { sport: "NCAAB", game: "Duke @ UNC", sides: ["Duke", "UNC"], props: ["Duke o9.5 3PM"] },
  { sport: "Soccer", game: "Arsenal vs Liverpool", sides: ["Arsenal", "Liverpool"], props: ["Bukayo Saka Anytime Goal", "Mohamed Salah o2.5 SOT"] },
];

const ANALYSIS = [
  "Line moved a point and a half since open — sharp money agrees.",
  "Defense has allowed 5.8 YPA over the last four. Fading them here.",
  "Back-to-back spot for the home side, legs will be gone late.",
  "Model has this at 58% — getting value at this number.",
  "Matchup nightmare. Lean into the volume.",
  "Weather pushing this total down. Under is the play.",
  "Revenge game narrative aside, the numbers back it up.",
  "Injury report is a mess for the other side. Hammer it.",
  "Pace-up spot, both teams top 10 in possessions.",
  "Starter's xFIP is way better than his ERA. Buy low.",
  "",
];

interface SeedLeader {
  user: Omit<User, "joinedAt">;
  /** True win probability used to generate history. */
  skill: number;
  graded: number;
  pending: number;
  /** [monthly price, subscribers] if they sell a subscription. */
  sub?: [number, number];
}

const LEADERS: SeedLeader[] = [
  { user: { id: "u_sharpside", handle: "sharpside", displayName: "Sharp Side Sam", bio: "Former oddsmaker. NFL sides & totals. 1u = 1% of bankroll.", avatarColor: "#22c55e", verified: true }, skill: 0.6, graded: 64, pending: 3, sub: [19.99, 1840] },
  { user: { id: "u_courtvision", handle: "courtvision", displayName: "Court Vision", bio: "NBA props only. I watch every game so you don't have to.", avatarColor: "#f97316", verified: true }, skill: 0.57, graded: 58, pending: 4, sub: [14.99, 1215] },
  { user: { id: "u_icecold", handle: "icecoldlocks", displayName: "Ice Cold Locks", bio: "Hockey nerd. Puck lines and SOG props.", avatarColor: "#38bdf8" }, skill: 0.54, graded: 41, pending: 2, sub: [9.99, 402] },
  { user: { id: "u_diamond", handle: "diamonddata", displayName: "Diamond Data", bio: "Statcast-driven MLB plays. Process > results.", avatarColor: "#a855f7" }, skill: 0.53, graded: 47, pending: 2, sub: [12.99, 538] },
  { user: { id: "u_gobirds", handle: "gobirds52", displayName: "Go Birds 52", bio: "Philly everything. Mostly Eagles, sometimes Sixers.", avatarColor: "#10b981" }, skill: 0.49, graded: 33, pending: 2 },
  { user: { id: "u_pitchside", handle: "pitchside", displayName: "Pitchside", bio: "Premier League & Champions League.", avatarColor: "#eab308" }, skill: 0.5, graded: 26, pending: 2, sub: [7.99, 161] },
  { user: { id: "u_fademe", handle: "fademe_parlays", displayName: "Fade Me Parlays", bio: "Long shots only. Ride or die.", avatarColor: "#ef4444" }, skill: 0.36, graded: 36, pending: 2, sub: [4.99, 290] },
  { user: { id: "u_lockking", handle: "lock_king99", displayName: "Lock King", bio: "100% locks 🔒🔒🔒 DM for VIP", avatarColor: "#64748b" }, skill: 0.22, graded: 30, pending: 0, sub: [49.99, 37] },
  { user: { id: "u_rookie", handle: "rookie_rob", displayName: "Rookie Rob", bio: "New here, learning the ropes.", avatarColor: "#ec4899" }, skill: 0.55, graded: 7, pending: 2 },
];

const ODDS_POOL = [-110, -110, -110, -115, -105, -120, +100, +120, +145, -135, +165];

export function buildSeed(now = Date.now()): { users: User[]; picks: Pick[]; following: string[]; subscriptions: string[] } {
  const rand = mulberry32(52);
  // Separate stream so adding fields never reshuffles the leaders' records.
  const accessRand = mulberry32(7);
  const pickFrom = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const HOUR = 3600_000;

  const users: User[] = [
    {
      id: CURRENT_USER_ID,
      handle: "you",
      displayName: "You",
      bio: "Tap Edit to set up your profile.",
      avatarColor: "#6366f1",
      joinedAt: new Date(now).toISOString(),
    },
  ];
  const picks: Pick[] = [];
  let id = 0;

  for (const leader of LEADERS) {
    users.push({
      ...leader.user,
      joinedAt: new Date(now - 200 * 24 * HOUR).toISOString(),
      creator: leader.sub && {
        enabled: true,
        price: leader.sub[0],
        subscriberCount: leader.sub[1],
        perks: ["Every pick, before the line moves", "Full write-ups on each play", "Subscriber-only chat"],
      },
    });
    const total = leader.graded + leader.pending;
    for (let i = 0; i < total; i++) {
      const g = pickFrom(GAMES);
      const market: Market = pickFrom(["Spread", "Spread", "Moneyline", "Total", "Player Prop", "Player Prop"]);
      const side = pickFrom(g.sides);
      const selection =
        market === "Spread" ? `${side} ${pickFrom(["-3.5", "+2.5", "-6.5", "+7", "-1.5", "+4.5"])}`
        : market === "Moneyline" ? `${side} ML`
        : market === "Total" ? `${pickFrom(["Over", "Under"])} ${pickFrom(["44.5", "221.5", "8.5", "6.5", "2.5", "51"])}`
        : pickFrom(g.props);
      const odds = leader.user.handle === "fademe_parlays" ? pickFrom([+250, +400, +600, +180]) : pickFrom(ODDS_POOL);
      const isPending = i >= leader.graded;
      // Graded picks spread over the last ~90 days, pending picks start in the next day.
      const startsAt = isPending ? now + (2 + rand() * 30) * HOUR : now - (leader.graded - i) * 1.6 * 24 * HOUR;
      let result: PickResult = "pending";
      if (!isPending) {
        const r = rand();
        result = r < 0.04 ? "push" : rand() < leader.skill ? "win" : "loss";
      }
      const tailers = LEADERS.filter((l) => l.user.id !== leader.user.id && rand() < leader.skill - 0.3).map(
        (l) => l.user.id,
      );
      picks.push({
        id: `seed_${++id}`,
        userId: leader.user.id,
        sport: g.sport,
        game: g.game,
        market,
        selection,
        odds,
        units: pickFrom([1, 1, 1, 0.5, 2, 1.5]),
        analysis: pickFrom(ANALYSIS),
        createdAt: new Date(startsAt - (3 + rand() * 20) * HOUR).toISOString(),
        startsAt: new Date(startsAt).toISOString(),
        result,
        gradedAt: isPending ? undefined : new Date(startsAt + 3 * HOUR).toISOString(),
        // Creators keep about a third of picks free as a sample; the rest are for subscribers.
        access: leader.sub && accessRand() < 0.65 ? "subscribers" : "free",
        tailedBy: tailers,
      });
    }
  }

  return { users, picks, following: ["u_sharpside", "u_courtvision", "u_icecold"], subscriptions: ["u_courtvision"] };
}
