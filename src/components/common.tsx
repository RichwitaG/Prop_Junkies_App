import type { ReactNode } from "react";
import type { StandingStatus } from "../domain/standing";
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
