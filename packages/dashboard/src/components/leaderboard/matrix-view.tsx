"use client";

import Link from "next/link";

import type { ApiProvider } from "@/lib/api-client";
import type { ProviderMetrics } from "@/lib/mock-data";
import type { EndpointType } from "@/lib/mock-data";
import type { Tier } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EndpointSlice {
  scopedOut: boolean;
  p50: number | null;
  uptime: number | null;
  error_rate: number | null;
}

interface MatrixRow {
  provider_id: string;
  provider_name: string;
  grpc: EndpointSlice | null;
  graphql: EndpointSlice | null;
  archival: EndpointSlice | null;
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────

function latencyTier(ms: number | null): Tier {
  if (ms === null) return "unknown";
  if (ms < 100) return "good";
  if (ms < 300) return "degraded";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null);
  return valid.length === 0
    ? null
    : valid.reduce((a, b) => a + b, 0) / valid.length;
}

function minOf(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null);
  return valid.length === 0 ? null : Math.min(...valid);
}

function maxOf(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null);
  return valid.length === 0 ? null : Math.max(...valid);
}

function fmtMs(v: number | null, scopedOut = false): string {
  if (scopedOut) return "-";
  return v === null ? "—" : `${Math.round(v)} ms`;
}

function fmtPct(v: number | null, decimals = 1, scopedOut = false): string {
  if (scopedOut) return "-";
  return v === null ? "—" : `${(v * 100).toFixed(decimals)}%`;
}

function providerEndpointTypes(provider: ApiProvider): EndpointType[] {
  if (provider.endpoint_types != null && provider.endpoint_types.length > 0) {
    return provider.endpoint_types;
  }
  const types: EndpointType[] = [];
  if (provider.grpc != null) types.push("grpc");
  if (provider.graphql != null) types.push("graphql");
  if (provider.archival != null) types.push("archival");
  return types;
}

// ─── Build matrix ─────────────────────────────────────────────────────────────

function buildMatrix(
  raw: ProviderMetrics[],
  providers: ApiProvider[],
  region: string,
): MatrixRow[] {
  const grouped = new Map<
    string,
    { name: string; grpc: ProviderMetrics[]; graphql: ProviderMetrics[]; archival: ProviderMetrics[] }
  >();

  for (const r of raw) {
    if (!grouped.has(r.provider_id)) {
      grouped.set(r.provider_id, {
        name: r.provider_name,
        grpc: [],
        graphql: [],
        archival: [],
      });
    }
    grouped.get(r.provider_id)![r.endpoint_type].push(r);
  }

  if (region !== "all") {
    for (const provider of providers) {
      if (provider.regions == null || provider.regions.includes(region)) {
        continue;
      }
      if (!grouped.has(provider.id)) {
        grouped.set(provider.id, {
          name: provider.name,
          grpc: [],
          graphql: [],
          archival: [],
        });
      }
    }
  }

  return Array.from(grouped.entries()).map(([id, g]) => {
    const provider = providers.find((p) => p.id === id);
    const scopedOut = region !== "all" && provider?.regions != null && !provider.regions.includes(region);
    const endpointTypes = provider != null ? providerEndpointTypes(provider) : [];

    function summarize(type: EndpointType, slice: ProviderMetrics[]): EndpointSlice | null {
      if (scopedOut && endpointTypes.includes(type)) {
        return {
          scopedOut: true,
          p50: null,
          uptime: null,
          error_rate: null,
        };
      }
      if (slice.length === 0) return null;
      return {
        scopedOut: false,
        p50: avg(slice.map((r) => r.latency_p50)),
        uptime: minOf(slice.map((r) => r.uptime)),
        error_rate: maxOf(slice.map((r) => r.error_rate)),
      };
    }
    return {
      provider_id: id,
      provider_name: g.name,
      grpc: summarize("grpc", g.grpc),
      graphql: summarize("graphql", g.graphql),
      archival: summarize("archival", g.archival),
    };
  });
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

const TIER_CELL: Record<Tier, { bg: string; text: string; border: string }> = {
  good: {
    bg: "bg-tier-good-bg",
    text: "text-tier-good",
    border: "border-tier-good/15",
  },
  degraded: {
    bg: "bg-tier-degraded-bg",
    text: "text-tier-degraded",
    border: "border-tier-degraded/15",
  },
  poor: {
    bg: "bg-tier-poor-bg",
    text: "text-tier-poor",
    border: "border-tier-poor/15",
  },
  unknown: {
    bg: "bg-tier-unknown-bg",
    text: "text-text-muted",
    border: "border-border-subtle",
  },
};

interface MetricCellProps {
  tier: Tier;
  value: string;
  label: string;
}

function MetricCell({ tier, value, label }: MetricCellProps) {
  const { bg, text, border } = TIER_CELL[tier];
  return (
    <td
      className={`border ${border} ${bg} px-3 py-2.5 text-center`}
      title={label}
    >
      <span className={`font-mono text-sm font-medium ${text}`}>{value}</span>
    </td>
  );
}

function MissingCell({ label }: { label: string }) {
  return (
    <td
      className="border border-border-subtle bg-bg-surface px-3 py-2.5 text-center"
      title={label}
    >
      <span className="font-mono text-sm text-text-muted">—</span>
    </td>
  );
}

// ─── Column group header ──────────────────────────────────────────────────────

interface GroupHeaderProps {
  label: string;
  color: string;
  border: string;
  colSpan: number;
}

function GroupHeader({ label, color, border, colSpan }: GroupHeaderProps) {
  return (
    <th
      colSpan={colSpan}
      className={`border ${border} px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider ${color}`}
    >
      {label}
    </th>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MatrixViewProps {
  rows: ProviderMetrics[];
  providers: ApiProvider[];
  region: string;
}

export function MatrixView({ rows, providers, region }: MatrixViewProps) {
  const matrix = buildMatrix(rows, providers, region);

  if (matrix.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-text-muted">
        No provider data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border shadow-lg">
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* Group headers */}
          <tr className="border-b border-border bg-bg-raised">
            <th
              rowSpan={2}
              className="border-r border-border px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
            >
              Provider
            </th>
            <GroupHeader
              label="gRPC"
              color="text-grpc"
              border="border-grpc/20"
              colSpan={3}
            />
            <GroupHeader
              label="GraphQL"
              color="text-graphql"
              border="border-graphql/20"
              colSpan={3}
            />
            <GroupHeader
              label="Archival"
              color="text-archival"
              border="border-archival/20"
              colSpan={3}
            />
          </tr>
          {/* Sub-headers */}
          <tr className="border-b border-border bg-bg-raised/60 text-xs uppercase tracking-wider text-text-muted">
            {/* gRPC sub-cols */}
            <th className="border border-grpc/15 px-3 py-2 text-center font-medium">
              p50
            </th>
            <th className="border border-grpc/15 px-3 py-2 text-center font-medium">
              Uptime
            </th>
            <th className="border border-grpc/15 px-3 py-2 text-center font-medium">
              Err%
            </th>
            {/* GraphQL sub-cols */}
            <th className="border border-graphql/15 px-3 py-2 text-center font-medium">
              p50
            </th>
            <th className="border border-graphql/15 px-3 py-2 text-center font-medium">
              Uptime
            </th>
            <th className="border border-graphql/15 px-3 py-2 text-center font-medium">
              Err%
            </th>
            {/* Archival sub-cols */}
            <th className="border border-archival/15 px-3 py-2 text-center font-medium">
              p50
            </th>
            <th className="border border-archival/15 px-3 py-2 text-center font-medium">
              Uptime
            </th>
            <th className="border border-archival/15 px-3 py-2 text-center font-medium">
              Err%
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr
              key={row.provider_id}
              className="border-b border-border-subtle transition-colors hover:brightness-110"
            >
              {/* Provider name */}
              <td className="border-r border-border bg-bg-surface px-4 py-2.5">
                <Link
                  href={`/provider/${row.provider_id}`}
                  className="font-medium text-text-primary transition-colors hover:text-accent"
                >
                  {row.provider_name}
                </Link>
              </td>

              {/* gRPC cells */}
              {row.grpc !== null ? (
                <>
                  <MetricCell
                    tier={latencyTier(row.grpc.p50)}
                    value={fmtMs(row.grpc.p50, row.grpc.scopedOut)}
                    label="gRPC p50 latency"
                  />
                  <MetricCell
                    tier={uptimeTier(row.grpc.uptime)}
                    value={fmtPct(row.grpc.uptime, 1, row.grpc.scopedOut)}
                    label="gRPC uptime"
                  />
                  <MetricCell
                    tier={errorRateTier(row.grpc.error_rate)}
                    value={fmtPct(row.grpc.error_rate, 2, row.grpc.scopedOut)}
                    label="gRPC error rate"
                  />
                </>
              ) : (
                <>
                  <MissingCell label="gRPC p50 latency — not available" />
                  <MissingCell label="gRPC uptime — not available" />
                  <MissingCell label="gRPC error rate — not available" />
                </>
              )}

              {/* GraphQL cells */}
              {row.graphql !== null ? (
                <>
                  <MetricCell
                    tier={latencyTier(row.graphql.p50)}
                    value={fmtMs(row.graphql.p50, row.graphql.scopedOut)}
                    label="GraphQL p50 latency"
                  />
                  <MetricCell
                    tier={uptimeTier(row.graphql.uptime)}
                    value={fmtPct(row.graphql.uptime, 1, row.graphql.scopedOut)}
                    label="GraphQL uptime"
                  />
                  <MetricCell
                    tier={errorRateTier(row.graphql.error_rate)}
                    value={fmtPct(row.graphql.error_rate, 2, row.graphql.scopedOut)}
                    label="GraphQL error rate"
                  />
                </>
              ) : (
                <>
                  <MissingCell label="GraphQL p50 latency — not available" />
                  <MissingCell label="GraphQL uptime — not available" />
                  <MissingCell label="GraphQL error rate — not available" />
                </>
              )}

              {/* Archival cells */}
              {row.archival !== null ? (
                <>
                  <MetricCell
                    tier={latencyTier(row.archival.p50)}
                    value={fmtMs(row.archival.p50, row.archival.scopedOut)}
                    label="Archival p50 latency"
                  />
                  <MetricCell
                    tier={uptimeTier(row.archival.uptime)}
                    value={fmtPct(row.archival.uptime, 1, row.archival.scopedOut)}
                    label="Archival uptime"
                  />
                  <MetricCell
                    tier={errorRateTier(row.archival.error_rate)}
                    value={fmtPct(row.archival.error_rate, 2, row.archival.scopedOut)}
                    label="Archival error rate"
                  />
                </>
              ) : (
                <>
                  <MissingCell label="Archival p50 latency — not available" />
                  <MissingCell label="Archival uptime — not available" />
                  <MissingCell label="Archival error rate — not available" />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
