"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { DataTable, type Column } from "@/components/ui";
import type { Tier } from "@/components/ui";
import type { EndpointType, ProviderMetrics } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | "latency_p50"
  | "latency_p90"
  | "latency_p99"
  | "freshness_avg"
  | "uptime"
  | "error_rate";

type SortDir = "asc" | "desc";

/** Aggregated display row: one row per provider × endpoint-type. */
interface DisplayRow {
  key: string;
  provider_id: string;
  provider_name: string;
  endpoint_type: EndpointType;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  freshness_avg: number | null;
  uptime: number | null;
  error_rate: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_SORT_KEYS = new Set<string>([
  "latency_p50",
  "latency_p90",
  "latency_p99",
  "freshness_avg",
  "uptime",
  "error_rate",
]);

const DEFAULT_SORT: SortKey = "latency_p50";
const DEFAULT_DIR: SortDir = "asc";

const TIER_COLOR: Record<Tier, string> = {
  good: "text-tier-good",
  degraded: "text-tier-degraded",
  poor: "text-tier-poor",
  unknown: "text-text-muted",
};

// ─── Tier helpers ─────────────────────────────────────────────────────────────

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

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMs(v: number | null): string {
  return v === null ? "—" : String(Math.round(v));
}

function fmtCheckpoints(v: number | null): string {
  return v === null ? "—" : String(Math.round(v));
}

function fmtPct(v: number | null, decimals: number): string {
  return v === null ? "—" : `${(v * 100).toFixed(decimals)}%`;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function avgOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length === 0
    ? null
    : valid.reduce((a, b) => a + b, 0) / valid.length;
}

function minOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length === 0 ? null : Math.min(...valid);
}

function maxOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length === 0 ? null : Math.max(...valid);
}

/**
 * Collapse a filtered slice of raw rows into one DisplayRow per
 * provider × endpoint-type. Latency and freshness are averaged across
 * regions; uptime shows the worst-case region; error_rate shows the
 * worst-case region.
 */
function aggregate(rows: ProviderMetrics[]): DisplayRow[] {
  const groups = new Map<string, ProviderMetrics[]>();
  for (const row of rows) {
    const k = `${row.provider_id}-${row.endpoint_type}`;
    const g = groups.get(k) ?? [];
    g.push(row);
    groups.set(k, g);
  }
  return Array.from(groups.entries()).map(([k, g]) => {
    const first = g[0]!; // safe: group always has ≥ 1 row
    return {
      key: k,
      provider_id: first.provider_id,
      provider_name: first.provider_name,
      endpoint_type: first.endpoint_type,
      latency_p50: avgOrNull(g.map((r) => r.latency_p50)),
      latency_p90: avgOrNull(g.map((r) => r.latency_p90)),
      latency_p99: avgOrNull(g.map((r) => r.latency_p99)),
      freshness_avg: avgOrNull(g.map((r) => r.freshness_avg)),
      uptime: minOrNull(g.map((r) => r.uptime)),
      error_rate: maxOrNull(g.map((r) => r.error_rate)),
    };
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortRows(
  rows: DisplayRow[],
  key: SortKey,
  dir: SortDir,
): DisplayRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const diff = av - bv;
    return dir === "asc" ? diff : -diff;
  });
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: Column<DisplayRow>[] = [
  {
    key: "provider_name",
    header: "Provider",
    sortable: false,
    align: "left",
    render: (row) => (
      <Link
        href={`/provider/${row.provider_id}`}
        className="font-medium text-text-primary hover:text-accent transition-colors"
      >
        {row.provider_name}
      </Link>
    ),
  },
  {
    key: "endpoint_type",
    header: "Type",
    sortable: false,
    align: "left",
    render: (row) => (
      <span className="rounded bg-bg-raised px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider text-text-secondary">
        {row.endpoint_type}
      </span>
    ),
  },
  {
    key: "latency_p50",
    header: "p50 ms",
    sortable: true,
    align: "right",
    render: (row) => (
      <span className={`font-mono ${TIER_COLOR[latencyTier(row.latency_p50)]}`}>
        {fmtMs(row.latency_p50)}
      </span>
    ),
  },
  {
    key: "latency_p90",
    header: "p90 ms",
    sortable: true,
    align: "right",
    render: (row) => (
      <span className={`font-mono ${TIER_COLOR[latencyTier(row.latency_p90)]}`}>
        {fmtMs(row.latency_p90)}
      </span>
    ),
  },
  {
    key: "latency_p99",
    header: "p99 ms",
    sortable: true,
    align: "right",
    render: (row) => (
      <span className={`font-mono ${TIER_COLOR[latencyTier(row.latency_p99)]}`}>
        {fmtMs(row.latency_p99)}
      </span>
    ),
  },
  {
    key: "freshness_avg",
    header: "Freshness ckpts",
    sortable: true,
    align: "right",
    render: (row) => (
      <span
        className={`font-mono ${TIER_COLOR[freshnessTier(row.freshness_avg)]}`}
      >
        {fmtCheckpoints(row.freshness_avg)}
      </span>
    ),
  },
  {
    key: "uptime",
    header: "Uptime",
    sortable: true,
    align: "right",
    render: (row) => (
      <span className={`font-mono ${TIER_COLOR[uptimeTier(row.uptime)]}`}>
        {fmtPct(row.uptime, 1)}
      </span>
    ),
  },
  {
    key: "error_rate",
    header: "Error Rate",
    sortable: true,
    align: "right",
    render: (row) => (
      <span
        className={`font-mono ${TIER_COLOR[errorRateTier(row.error_rate)]}`}
      >
        {fmtPct(row.error_rate, 2)}
      </span>
    ),
  },
];

// ─── Filter pills ─────────────────────────────────────────────────────────────

interface FilterPillsProps {
  label: string;
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}

function FilterPills({
  label,
  options,
  selected,
  onSelect,
}: FilterPillsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              onSelect(opt);
            }}
            className={
              selected === opt
                ? "cursor-pointer rounded px-3 py-1 text-xs font-medium text-accent bg-accent-dim"
                : "cursor-pointer rounded px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary transition-colors"
            }
          >
            {opt === "all" ? "All" : opt.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface LeaderboardClientProps {
  rows: ProviderMetrics[];
  regions: readonly string[];
}

export function LeaderboardClient({ rows, regions }: LeaderboardClientProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // ── Read URL state ─────────────────────────────────────────────────────────
  const regionFilter = searchParams.get("region") ?? "all";
  const typeFilter = searchParams.get("type") ?? "all";

  const rawSort = searchParams.get("sort");
  const sortKey: SortKey =
    rawSort !== null && VALID_SORT_KEYS.has(rawSort)
      ? (rawSort as SortKey)
      : DEFAULT_SORT;

  const sortDir: SortDir =
    searchParams.get("dir") === "desc" ? "desc" : DEFAULT_DIR;

  // ── Write URL state ────────────────────────────────────────────────────────

  /**
   * Merge `patch` into the current search params, then clean canonical
   * defaults so stable states always produce the same URL.
   */
  const updateParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        params.set(k, v);
      }
      // Remove defaults for a canonical URL
      if (params.get("region") === "all") params.delete("region");
      if (params.get("type") === "all") params.delete("type");
      // dir=asc is implicit
      if (params.get("dir") === DEFAULT_DIR) params.delete("dir");
      // If no dir, no separate sort needed for the default column
      if (params.get("sort") === DEFAULT_SORT && !params.has("dir")) {
        params.delete("sort");
      }
      // dir without sort is meaningless
      if (!params.has("sort")) params.delete("dir");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const handleSort = useCallback(
    (key: string) => {
      if (!VALID_SORT_KEYS.has(key)) return;
      const k = key as SortKey;
      const newDir: SortDir =
        k === sortKey && sortDir === "asc" ? "desc" : "asc";
      updateParams({ sort: k, dir: newDir });
    },
    [sortKey, sortDir, updateParams],
  );

  // ── Derive display rows ────────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    let filtered = rows;
    if (regionFilter !== "all") {
      filtered = filtered.filter((r) => r.region === regionFilter);
    }
    if (typeFilter !== "all") {
      filtered = filtered.filter((r) => r.endpoint_type === typeFilter);
    }
    return sortRows(aggregate(filtered), sortKey, sortDir);
  }, [rows, regionFilter, typeFilter, sortKey, sortDir]);

  const regionOptions: readonly string[] = ["all", ...regions];
  const typeOptions: readonly string[] = ["all", "grpc", "graphql"];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-bg-surface px-4 py-3">
        <FilterPills
          label="Region"
          options={regionOptions}
          selected={regionFilter}
          onSelect={(v) => {
            updateParams({ region: v });
          }}
        />
        <div className="hidden h-4 w-px bg-border sm:block" />
        <FilterPills
          label="Type"
          options={typeOptions}
          selected={typeFilter}
          onSelect={(v) => {
            updateParams({ type: v });
          }}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-bg-surface">
        {displayRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            No data for the selected filters.
          </p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={displayRows}
            rowKey={(row) => row.key}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>
    </div>
  );
}
