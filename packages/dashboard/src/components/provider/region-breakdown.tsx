import { StatCard } from "@/components/ui";
import type { Tier } from "@/components/ui";
import { regionLabel } from "@/lib/mock-data";
import type { ProviderMetrics } from "@/lib/mock-data";

// ─── Tier helpers (same thresholds as the leaderboard) ────────────────────────

function latencyTier(ms: number | null): Tier {
  if (ms === null) return "unknown";
  if (ms < 100) return "good";
  if (ms < 300) return "degraded";
  return "poor";
}

function freshnessTier(checkpoints: number | null): Tier {
  if (checkpoints === null) return "unknown";
  if (checkpoints <= 2) return "good";
  if (checkpoints <= 10) return "degraded";
  return "poor";
}

function uptimeTier(fraction: number | null): Tier {
  if (fraction === null) return "unknown";
  if (fraction >= 0.995) return "good";
  if (fraction >= 0.98) return "degraded";
  return "poor";
}

function errorRateTier(fraction: number | null): Tier {
  if (fraction === null) return "unknown";
  if (fraction < 0.005) return "good";
  if (fraction < 0.02) return "degraded";
  return "poor";
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface RegionBreakdownProps {
  rows: ProviderMetrics[];
}

export function RegionBreakdown({ rows }: RegionBreakdownProps) {
  const types = [...new Set(rows.map((r) => r.endpoint_type))].sort();

  return (
    <div className="space-y-8">
      {types.map((type) => {
        const typeRows = rows.filter((r) => r.endpoint_type === type);
        return (
          <div key={type}>
            {/* Endpoint type label */}
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded bg-bg-raised px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-text-secondary">
                {type}
              </span>
            </div>

            <div className="space-y-5">
              {typeRows.map((row) => (
                <div key={`${type}-${row.region}`}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                    {regionLabel(row.region)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCard
                      label="p50 latency"
                      value={
                        row.latency_p50 === null
                          ? "—"
                          : String(Math.round(row.latency_p50))
                      }
                      unit="ms"
                      tier={latencyTier(row.latency_p50)}
                    />
                    <StatCard
                      label="p90 latency"
                      value={
                        row.latency_p90 === null
                          ? "—"
                          : String(Math.round(row.latency_p90))
                      }
                      unit="ms"
                      tier={latencyTier(row.latency_p90)}
                    />
                    <StatCard
                      label="p99 latency"
                      value={
                        row.latency_p99 === null
                          ? "—"
                          : String(Math.round(row.latency_p99))
                      }
                      unit="ms"
                      tier={latencyTier(row.latency_p99)}
                    />
                    <StatCard
                      label="freshness"
                      value={
                        row.freshness_avg === null
                          ? "—"
                          : String(Math.round(row.freshness_avg))
                      }
                      unit="ckpts"
                      tier={freshnessTier(row.freshness_avg)}
                    />
                    <StatCard
                      label="uptime"
                      value={
                        row.uptime === null
                          ? "—"
                          : (row.uptime * 100).toFixed(1)
                      }
                      unit="%"
                      tier={uptimeTier(row.uptime)}
                    />
                    <StatCard
                      label="error rate"
                      value={
                        row.error_rate === null
                          ? "—"
                          : (row.error_rate * 100).toFixed(2)
                      }
                      unit="%"
                      tier={errorRateTier(row.error_rate)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
