import type { Tier } from "./stat-card";

const BADGE_CLASSES: Record<Tier, string> = {
  good: "bg-tier-good-bg text-tier-good border-tier-good/20",
  degraded: "bg-tier-degraded-bg text-tier-degraded border-tier-degraded/20",
  poor: "bg-tier-poor-bg text-tier-poor border-tier-poor/20",
  unknown: "bg-tier-unknown-bg text-tier-unknown border-tier-unknown/20",
};

const TIER_LABELS: Record<Tier, string> = {
  good: "Good",
  degraded: "Degraded",
  poor: "Poor",
  unknown: "Unknown",
};

export interface MetricBadgeProps {
  tier: Tier;
  label?: string;
  className?: string;
}

export function MetricBadge({ tier, label, className = "" }: MetricBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_CLASSES[tier]} ${className}`}
    >
      {label ?? TIER_LABELS[tier]}
    </span>
  );
}
