export const pct = (n: number | null, digits = 1) => (n === null ? "—" : `${(n * 100).toFixed(digits)}%`);

export const odds = (o: number) => (o > 0 ? `+${o}` : `${o}`);

export const units = (u: number) => `${u > 0 ? "+" : ""}${u.toFixed(2)}u`;

export function relTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const s = m < 60 ? `${m}m` : h < 48 ? `${h}h` : `${d}d`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
