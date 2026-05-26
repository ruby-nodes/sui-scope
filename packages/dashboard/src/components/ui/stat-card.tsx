import type { ReactNode } from "react";

export type Tier = "good" | "degraded" | "poor" | "unknown";

const TIER_TEXT: Record<Tier, string> = {
  good: "text-tier-good",
  degraded: "text-tier-degraded",
  poor: "text-tier-poor",
  unknown: "text-tier-unknown",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  tier?: Tier;
  className?: string;
}

export function StatCard({
  label,
  value,
  unit,
  tier = "unknown",
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`rounded-md border border-border bg-bg-surface p-4 ${className}`}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className={`font-mono text-2xl font-semibold ${TIER_TEXT[tier]}`}>
        {value}
        {unit !== undefined && (
          <span className="ml-1 font-sans text-sm text-text-secondary">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
