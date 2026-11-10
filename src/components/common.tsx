import type { ReactNode } from "react";
import type { StandingStatus } from "../domain/standing";
import { SPORT_INFO, sportsBySeason, type Sport } from "../domain/sports";
import type { User } from "../domain/types";

export function Avatar({ user, size = 40 }: { user: User; size?: number }) {
  const initials = user.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="avatar"
      style={{ background: user.avatarColor, width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

const LABELS: Record<StandingStatus, string> = {
  provisional: "Provisional",
  good: "Good standing",
  warning: "At risk",
  suspended: "Suspended",
};

export function StandingBadge({ status, compact }: { status: StandingStatus; compact?: boolean }) {
  if (compact && status === "good") return null;
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}

export function DemoTag({ user }: { user: User }) {
  return user.isDemo ? <span className="tag tag-demo" title="Sample account — removed at launch">DEMO</span> : null;
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a href={`#${to}`} className={className}>
      {children}
    </a>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o} role="tab" aria-selected={o === value} className={o === value ? "chip active" : "chip"} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Swipeable sport row with icons. In-season sports come first; off-season ones move to the end. */
export function SportBar({ value, onChange }: { value: Sport | "All"; onChange: (v: Sport | "All") => void }) {
  const items: (Sport | "All")[] = ["All", ...sportsBySeason()];
  return (
    <div className="sportbar" role="tablist" aria-label="Sport">
      {items.map((s) => (
        <button key={s} role="tab" aria-selected={s === value} className={s === value ? "sport active" : "sport"} onClick={() => onChange(s)}>
          <span className="sport-icon" aria-hidden>
            {s === "All" ? "🔥" : SPORT_INFO[s].icon}
          </span>
          <span className="sport-label">{s}</span>
        </button>
      ))}
    </div>
  );
}

/** "Soccer · Premier League" or just "NFL". */
export const sportLabel = (sport: Sport, league: string | null | undefined) => (league ? `${sport} · ${league}` : sport);
