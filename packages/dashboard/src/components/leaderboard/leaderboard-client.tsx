"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/ui";
import type { Tier } from "@/components/ui";
import { EndpointBadge } from "@/components/ui/endpoint-badge";
import { MatrixView } from "./matrix-view";
import { fetchMetrics, fetchProviders } from "@/lib/api-client";
import type { ApiProvider } from "@/lib/api-client";
import { KNOWN_REGIONS, regionLabel } from "@/lib/mock-data";
import type { EndpointType, ProviderMetrics, Region } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | "latency_p50"
  | "latency_p90"
  | "latency_p99"
  | "freshness_avg"
  | "uptime"
  | "error_rate";

type SortDir = "asc" | "desc";
type AccessFilter = "all" | "free" | "paid";

/** Aggregated display row: one row per provider × endpoint-type. */
interface DisplayRow {
  key: string;
  provider_id: string;
  provider_name: string;
  is_public: boolean;
  endpoint_type: EndpointType;
  scoped_out: boolean;
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
const DEFAULT_TYPE_FILTER = "grpc";
const ACCESS_OPTIONS = ["all", "free", "paid"] as const satisfies readonly AccessFilter[];

const TIER_COLOR: Record<Tier, string> = {
  good: "text-tier-good",
  degraded: "text-tier-degraded",
  poor: "text-tier-poor",
  unknown: "text-text-muted",
};

/** Bar fill colour for inline mini latency bars. */
const TIER_BAR: Record<Tier, string> = {
  good: "bg-tier-good",
  degraded: "bg-tier-degraded",
  poor: "bg-tier-poor",
  unknown: "bg-tier-unknown",
};

/** Max latency used to scale mini bars (anything ≥ this is 100% wide). */
const LATENCY_BAR_MAX_MS = 400;

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

function fmtScoped(v: number | null, scopedOut: boolean, fmt: (value: number | null) => string): string {
  return scopedOut ? "-" : fmt(v);
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

/** Collapse a filtered slice of raw rows into one DisplayRow per provider × endpoint-type. */
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
      is_public: first.is_public,
      endpoint_type: first.endpoint_type,
      scoped_out: false,
      latency_p50: avgOrNull(g.map((r) => r.latency_p50)),
      latency_p90: avgOrNull(g.map((r) => r.latency_p90)),
      latency_p99: avgOrNull(g.map((r) => r.latency_p99)),
      freshness_avg: avgOrNull(g.map((r) => r.freshness_avg)),
      uptime: minOrNull(g.map((r) => r.uptime)),
      error_rate: maxOrNull(g.map((r) => r.error_rate)),
    };
  });
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

function providerIncludesRegion(provider: ApiProvider, region: string): boolean {
  return provider.regions == null || provider.regions.includes(region);
}

function providerMatchesAccess(provider: ApiProvider, access: AccessFilter): boolean {
  if (access === "all") return true;
  return access === "free" ? provider.public : !provider.public;
}

function publicMatchesAccess(isPublic: boolean, access: AccessFilter): boolean {
  if (access === "all") return true;
  return access === "free" ? isPublic : !isPublic;
}

function buildScopedOutRows(
  providers: ApiProvider[],
  region: string,
  typeFilter: string,
): DisplayRow[] {
  return providers.flatMap((provider) => {
    if (providerIncludesRegion(provider, region)) return [];
    return providerEndpointTypes(provider)
      .filter((type) => typeFilter === "all" || type === typeFilter)
      .map((type) => ({
        key: `${provider.id}-${type}`,
        provider_id: provider.id,
        provider_name: provider.name,
        is_public: provider.public,
        endpoint_type: type,
        scoped_out: true,
        latency_p50: null,
        latency_p90: null,
        latency_p99: null,
        freshness_avg: null,
        uptime: null,
        error_rate: null,
      }));
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

/** Mini bar + coloured number for latency columns. */
function LatencyCell({ value }: { value: number | null }) {
  const tier = latencyTier(value);
  const barPct =
    value !== null ? Math.min(100, (value / LATENCY_BAR_MAX_MS) * 100) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      {value !== null && (
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-bg-raised">
          <div
            className={`h-full rounded-full ${TIER_BAR[tier]}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
      <span className={`w-10 text-right font-mono text-sm ${TIER_COLOR[tier]}`}>
        {fmtMs(value)}
      </span>
    </div>
  );
}

const METRIC_COLUMNS: Column<DisplayRow>[] = [
  {
    key: "provider_name",
    header: "Provider",
    sortable: false,
    align: "left",
    className: "min-w-64 whitespace-nowrap",
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <Link
          href={`/provider/${row.provider_id}`}
          className="font-medium text-text-primary hover:text-accent transition-colors"
        >
          {row.provider_name}
        </Link>
        {row.is_public && (
          <a
            href="/methodology#public-endpoints"
            title="Public endpoint — rate limiting may apply. Click for details."
            className="text-text-muted opacity-50 hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        )}
      </div>
    ),
  },
  {
    key: "endpoint_type",
    header: "Type",
    sortable: false,
    align: "left",
    className: "w-28 whitespace-nowrap",
    render: (row) => <EndpointBadge type={row.endpoint_type} />,
  },
  {
    key: "latency_p50",
    header: "p50 ms",
    tooltip: "Median cold-connection latency. Measured as: cold TCP connect + TLS handshake + request write + time-to-first-response-byte. DNS is pre-resolved and excluded. Lower is better.",
    sortable: true,
    align: "right",
    className: "w-28 whitespace-nowrap",
    render: (row) => row.scoped_out ? (
      <span className="font-mono text-sm text-text-muted">-</span>
    ) : (
      <LatencyCell value={row.latency_p50} />
    ),
  },
  {
    key: "latency_p90",
    header: "p90 ms",
    tooltip: "90th-percentile cold-connection latency — only 1-in-10 requests are slower than this. Good indicator of tail behaviour under normal load.",
    sortable: true,
    align: "right",
    className: "w-28 whitespace-nowrap",
    render: (row) => row.scoped_out ? (
      <span className="font-mono text-sm text-text-muted">-</span>
    ) : (
      <LatencyCell value={row.latency_p90} />
    ),
  },
  {
    key: "latency_p99",
    header: "p99 ms",
    tooltip: "99th-percentile cold-connection latency — worst-case tail. Useful for detecting occasional slow outliers that would hurt time-sensitive workloads.",
    sortable: true,
    align: "right",
    className: "w-28 whitespace-nowrap",
    render: (row) => row.scoped_out ? (
      <span className="font-mono text-sm text-text-muted">-</span>
    ) : (
      <LatencyCell value={row.latency_p99} />
    ),
  },
  {
    key: "freshness_avg",
    header: "Fresh.",
    tooltip: "How far behind the chain head this provider is, in checkpoints (chain_head − provider_latest). 0–2 = Good, 3–10 = Degraded, >10 = Poor. Lower is better.",
    sortable: true,
    align: "right",
    className: "w-20 whitespace-nowrap",
    render: (row) => (
      <span
        className={`font-mono ${TIER_COLOR[freshnessTier(row.freshness_avg)]}`}
      >
        {fmtScoped(row.freshness_avg, row.scoped_out, fmtCheckpoints)}
      </span>
    ),
  },
  {
    key: "uptime",
    header: "Uptime",
    tooltip: "Fraction of probe cycles that returned a successful response over a 1-hour rolling window. ≥99.5% = Good, 98–99.5% = Degraded, <98% = Poor.",
    sortable: true,
    align: "right",
    className: "w-24 whitespace-nowrap",
    render: (row) => (
      <span className={`font-mono ${TIER_COLOR[uptimeTier(row.uptime)]}`}>
        {row.scoped_out ? "-" : fmtPct(row.uptime, 1)}
      </span>
    ),
  },
  {
    key: "error_rate",
    header: "Error Rate",
    tooltip: "Fraction of probe cycles that returned an error over a 5-minute rolling window. <0.5% = Good, 0.5–2% = Degraded, >2% = Poor.",
    sortable: true,
    align: "right",
    className: "w-28 whitespace-nowrap",
    render: (row) => (
      <span
        className={`font-mono ${TIER_COLOR[errorRateTier(row.error_rate)]}`}
      >
        {row.scoped_out ? "-" : fmtPct(row.error_rate, 2)}
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
  formatOption?: (value: string) => string;
}

function FilterPills({
  label,
  options,
  selected,
  onSelect,
  formatOption = (value) => (value === "all" ? "All" : regionLabel(value)),
}: FilterPillsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div className="flex flex-nowrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              onSelect(opt);
            }}
            className={
              selected === opt
                ? "cursor-pointer whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium text-accent bg-accent-dim"
                : "cursor-pointer whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary transition-colors"
            }
          >
            {formatOption(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
  formatOption: (value: string) => string;
}

function FilterSelect({
  label,
  options,
  selected,
  onSelect,
  formatOption,
}: FilterSelectProps) {
  return (
    <label className="flex shrink-0 items-center gap-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <select
        value={selected}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
        className="h-8 cursor-pointer rounded-md border border-border bg-bg-raised px-3 pr-8 text-sm font-medium text-text-primary outline-none transition-colors hover:border-accent/60 focus:border-accent"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {formatOption(opt)}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeaderboardClient() {
  const [rows, setRows] = useState<ProviderMetrics[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [regions, setRegions] = useState<readonly Region[]>(KNOWN_REGIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMetrics(), fetchProviders()])
      .then(([data, providerData]) => {
        if (cancelled) return;
        setRows(data);
        setProviders(providerData);
        const seen = [
          ...new Set([
            ...data.map((m) => m.region),
            ...providerData.flatMap((p) => p.regions ?? []),
          ]),
        ] as Region[];
        setRegions(seen.length > 0 ? seen : KNOWN_REGIONS);
      })
      .catch(() => {
        /* leave rows empty — table shows empty state */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // ── View toggle state ──────────────────────────────────────────────────────
  const [view, setView] = useState<"table" | "matrix">("table");

  // ── Compare selection state ────────────────────────────────────────────────
  const [selectedProviders, setSelectedProviders] = useState(
    () => new Set<string>(),
  );

  function toggleCompare(providerId: string): void {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else if (next.size < 4) {
        next.add(providerId);
      }
      return next;
    });
  }

  const compareHref = useMemo(() => {
    const ids = [...selectedProviders];
    if (ids.length < 2) return null;
    const params = new URLSearchParams();
    for (const id of ids) params.append("p", id);
    return `/compare?${params.toString()}`;
  }, [selectedProviders]);

  // Checkbox column — resolved at render time; rank added after displayRows.
  const checkboxColumn = useMemo<Column<DisplayRow>>(
    () => ({
      key: "_compare",
      header: "",
      sortable: false,
      align: "center",
      render: (row) => {
        const isSelected = selectedProviders.has(row.provider_id);
        const atMax = selectedProviders.size >= 4 && !isSelected;
        return (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={atMax}
            onChange={() => {
              toggleCompare(row.provider_id);
              }}
              className="cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Compare ${row.provider_name}`}
            />
          );
        },
      }),
    [selectedProviders],
  );

  // ── Filter/sort state — local, initialized from URL ───────────────────────
  const defaultRegion = regions[0] ?? KNOWN_REGIONS[0] ?? "iad";
  const [regionFilter, setRegionFilter] = useState<string>(
    () => {
      const requested = searchParams.get("region");
      return requested != null && requested !== "all" ? requested : defaultRegion;
    },
  );
  const activeRegionFilter = regions.includes(regionFilter as Region)
    ? regionFilter
    : defaultRegion;
  const [typeFilter, setTypeFilter] = useState<string>(
    () => searchParams.get("type") ?? DEFAULT_TYPE_FILTER,
  );
  const [accessFilter, setAccessFilter] = useState<AccessFilter>(() => {
    const raw = searchParams.get("access");
    return ACCESS_OPTIONS.includes(raw as AccessFilter)
      ? (raw as AccessFilter)
      : "all";
  });
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const raw = searchParams.get("sort");
    return raw !== null && VALID_SORT_KEYS.has(raw) ? (raw as SortKey) : DEFAULT_SORT;
  });
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (searchParams.get("dir") === "desc" ? "desc" : DEFAULT_DIR),
  );

  // ── Sync current filter/sort state back to URL (for sharing/bookmarking) ──
  const pushUrl = useCallback(
    (
      region: string,
      type: string,
      access: AccessFilter,
      sort: SortKey,
      dir: SortDir,
    ) => {
      const params = new URLSearchParams();
      if (region !== defaultRegion) params.set("region", region);
      if (type !== DEFAULT_TYPE_FILTER) params.set("type", type);
      if (access !== "all") params.set("access", access);
      if (sort !== DEFAULT_SORT || dir !== DEFAULT_DIR) params.set("sort", sort);
      if (dir !== DEFAULT_DIR) params.set("dir", dir);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [defaultRegion, pathname, router],
  );

  const handleSort = useCallback(
    (key: string) => {
      if (!VALID_SORT_KEYS.has(key)) return;
      const k = key as SortKey;
      const newDir: SortDir = k === sortKey && sortDir === "asc" ? "desc" : "asc";
      setSortKey(k);
      setSortDir(newDir);
      pushUrl(activeRegionFilter, typeFilter, accessFilter, k, newDir);
    },
    [sortKey, sortDir, activeRegionFilter, typeFilter, accessFilter, pushUrl],
  );

  // ── Derive display rows ────────────────────────────────────────────────────
  const filteredProviders = useMemo(
    () => providers.filter((provider) => providerMatchesAccess(provider, accessFilter)),
    [providers, accessFilter],
  );

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const displayRows = useMemo(() => {
    let filtered = rows;
    if (accessFilter !== "all") {
      filtered = filtered.filter((r) => {
        const provider = providerById.get(r.provider_id);
        return publicMatchesAccess(provider?.public ?? r.is_public, accessFilter);
      });
    }
    filtered = filtered.filter((r) => {
      const provider = providerById.get(r.provider_id);
      return r.region === activeRegionFilter && (provider == null || providerIncludesRegion(provider, activeRegionFilter));
    });
    if (typeFilter !== "all") {
      filtered = filtered.filter((r) => r.endpoint_type === typeFilter);
    }
    const aggregated = aggregate(filtered);
    const scopedOut = buildScopedOutRows(filteredProviders, activeRegionFilter, typeFilter);
    return sortRows([...aggregated, ...scopedOut], sortKey, sortDir);
  }, [
    rows,
    providerById,
    filteredProviders,
    accessFilter,
    activeRegionFilter,
    typeFilter,
    sortKey,
    sortDir,
  ]);

  // ── Rank map — O(1) rank lookup in column render ───────────────────────────
  const rankMap = useMemo(
    () => new Map(displayRows.map((row, i) => [row.key, i + 1])),
    [displayRows],
  );

  // ── Final columns: rank + checkbox + metrics ───────────────────────────────
  const columns = useMemo<Column<DisplayRow>[]>(
    () => [
      {
        key: "_rank",
        header: "#",
        sortable: false,
        align: "center",
        render: (row) => {
          const rank = rankMap.get(row.key) ?? 0;
          const cls =
            rank === 1
              ? "text-rank-gold font-bold"
              : rank === 2
                ? "text-rank-silver font-semibold"
                : rank === 3
                  ? "text-rank-bronze font-semibold"
                  : "text-text-muted";
          return (
            <span className={`font-mono text-xs ${cls}`}>{rank}</span>
          );
        },
        className: "w-12 whitespace-nowrap",
      },
      checkboxColumn,
      ...METRIC_COLUMNS,
    ],
    [rankMap, checkboxColumn],
  );

  const regionOptions: readonly string[] = regions;
  const typeOptions: readonly string[] = ["all", "grpc", "graphql", "archival"];
  const accessOptions: readonly string[] = ACCESS_OPTIONS;
  const accessLabel = (value: string) =>
    value === "all" ? "All" : value === "free" ? "Free" : "Paid";
  const regionFilterLabel = (value: string) =>
    regionLabel(value);
  const typeFilterLabel = (value: string) =>
    value === "all"
      ? "All"
      : value === "grpc"
        ? "gRPC"
        : value === "graphql"
          ? "GraphQL"
          : "Archival";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* View toggle + filter bar */}
      <div className="flex flex-nowrap items-center gap-3 overflow-x-auto rounded-lg border border-border bg-bg-surface px-4 py-3">
        {/* Table / Matrix tabs */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => { setView("table"); }}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              view === "table"
                ? "bg-accent-dim text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => { setView("matrix"); }}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              view === "matrix"
                ? "bg-accent-dim text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Matrix
          </button>
        </div>

        <div className="hidden h-4 w-px bg-border sm:block" />
        <FilterPills
          label="Access"
          options={accessOptions}
          selected={accessFilter}
          formatOption={accessLabel}
          onSelect={(v) => {
            const next = v as AccessFilter;
            setAccessFilter(next);
            pushUrl(activeRegionFilter, typeFilter, next, sortKey, sortDir);
          }}
        />

        <div className="hidden h-4 w-px bg-border sm:block" />
        <FilterSelect
          label="Region"
          options={regionOptions}
          selected={activeRegionFilter}
          formatOption={regionFilterLabel}
          onSelect={(v) => {
            setRegionFilter(v);
            pushUrl(v, typeFilter, accessFilter, sortKey, sortDir);
          }}
        />

        {view === "table" && (
          <>
            <div className="hidden h-4 w-px bg-border sm:block" />
            <FilterPills
              label="Type"
              options={typeOptions}
              selected={typeFilter}
              formatOption={typeFilterLabel}
              onSelect={(v) => {
                setTypeFilter(v);
                pushUrl(activeRegionFilter, v, accessFilter, sortKey, sortDir);
              }}
            />
          </>
        )}

        {compareHref !== null && view === "table" && (
          <Link
            href={compareHref}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg-base transition-colors hover:opacity-90"
          >
            Compare ({selectedProviders.size}) →
          </Link>
        )}
      </div>

      {/* Table view */}
      {view === "table" && (
        <div className="overflow-hidden rounded-lg border border-border bg-bg-surface shadow-lg">
          {loading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-12 border-b border-border-subtle last:border-0 animate-pulse"
              />
            ))
          ) : displayRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              No data for the selected filters.
            </p>
          ) : (
            <DataTable
              columns={columns}
              rows={displayRows}
              rowKey={(row) => row.key}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}
        </div>
      )}

      {/* Matrix heatmap view */}
      {view === "matrix" && (
        <MatrixView
          rows={
            rows.filter((r) => {
              const provider = providerById.get(r.provider_id);
              const matchesAccess = publicMatchesAccess(
                provider?.public ?? r.is_public,
                accessFilter,
              );
              const matchesRegion = r.region === activeRegionFilter;
              return matchesAccess && matchesRegion;
            })
          }
          providers={filteredProviders}
          region={activeRegionFilter}
        />
      )}

      {/* Tier legend */}
      <div className="rounded-lg border border-border-subtle bg-bg-surface/50 px-4 py-2.5 text-xs text-text-muted">
        <p className="mb-2 font-medium uppercase tracking-wider">Thresholds</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-tier-good" />
            <span className="text-text-muted">latency &lt;100 ms · freshness ≤2 ckpts · uptime ≥99.5% · error &lt;0.5%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-tier-degraded" />
            <span className="text-text-muted">latency 100–300 ms · freshness 3–10 · uptime 98–99.5% · error 0.5–2%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-tier-poor" />
            <span className="text-text-muted">latency &gt;300 ms · freshness &gt;10 · uptime &lt;98% · error &gt;2%</span>
          </div>
          <p className="text-text-muted/70">All latency: cold TCP+TLS · DNS excluded · 1 h uptime window · 5 min error window</p>
        </div>
      </div>

      {/* Metric glossary */}
      <div className="rounded-lg border border-border-subtle bg-bg-surface/50 px-4 py-3 text-xs text-text-muted">
        <p className="mb-2 font-medium uppercase tracking-wider">Metric definitions</p>
        <dl className="space-y-1.5">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">p50 ms</dt>
            <dd>Median cold-connection latency — half of all probe cycles completed faster than this. Measured as: cold TCP connect + TLS handshake + request write + time-to-first-response-byte. DNS is pre-resolved and excluded.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">p90 ms</dt>
            <dd>90th-percentile latency — only 1-in-10 probe cycles were slower. A good indicator of tail behaviour under normal load. Same measurement method as p50.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">p99 ms</dt>
            <dd>99th-percentile latency — worst-case tail; 1-in-100 probe cycles were slower. Useful for detecting occasional slow outliers that would hurt time-sensitive workloads.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">Freshness ckpts</dt>
            <dd>How many checkpoints behind the chain head this provider is (<code className="font-mono">chain_head − provider_latest</code>). 0 means perfectly in sync. Lower is better.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">Uptime</dt>
            <dd>Fraction of probe cycles that received a valid response over a 1-hour rolling window.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-medium text-text-secondary">Error Rate</dt>
            <dd>Fraction of probe cycles that returned an error or timed out over a 5-minute rolling window. Lower is better.</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
