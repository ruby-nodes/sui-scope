"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ApiProvider } from "@/lib/api-client";
import { fetchProviderTimeSeries, mergeTimeSeriesMaps } from "@/lib/api-client";
import { regionLabel } from "@/lib/mock-data";
import type { ProviderMetrics, TimeSeriesMap } from "@/lib/mock-data";
import { PROVIDER_PALETTE } from "./compare-charts";
import type { CompareChartsProps } from "./compare-charts";

// ─── Dynamic import (recharts breaks on server) ───────────────────────────────

const CompareCharts = dynamic<CompareChartsProps>(
  () =>
    import("./compare-charts").then((m) => ({ default: m.CompareCharts })),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-md border border-border bg-bg-surface"
          />
        ))}
      </div>
    ),
  },
);

// ─── Grid class map (Tailwind needs static class names) ───────────────────────

const STAT_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(v: number | null): string {
  return v === null ? "—" : `${Math.round(v)} ms`;
}

function fmtCkpts(v: number | null): string {
  return v === null ? "—" : `${Math.round(v)} ckpts`;
}

function fmtPct(v: number | null, decimals: number): string {
  return v === null ? "—" : `${(v * 100).toFixed(decimals)}%`;
}

// ─── CompareView ──────────────────────────────────────────────────────────────

export interface CompareViewProps {
  allProviders: ApiProvider[];
  selectedIds: string[];
  rows: ProviderMetrics[];
}

export function CompareView({
  allProviders,
  selectedIds,
  rows,
}: CompareViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  // ── Client-side time-series fetching ──────────────────────────────────────

  const [timeSeriesMap, setTimeSeriesMap] = useState<TimeSeriesMap>({});
  const [loadingIds, setLoadingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const idsToFetch = selectedIds.filter(
      (id) => !fetchedRef.current.has(id),
    );
    if (idsToFetch.length === 0) return;

    setLoadingIds((prev) => new Set([...prev, ...idsToFetch]));

    for (const id of idsToFetch) {
      fetchedRef.current.add(id);
      void Promise.all([
        fetchProviderTimeSeries(id, "24h", "h24"),
        fetchProviderTimeSeries(id, "7d", "d7"),
      ])
        .then(([h24, d7]) => mergeTimeSeriesMaps(h24, d7))
        .then((map) => {
          setTimeSeriesMap((prev) => ({ ...prev, ...map }));
        })
        .catch(() => {
          // Allow a retry on next render.
          fetchedRef.current.delete(id);
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    }
  }, [selectedIds]);

  // ── Endpoint type + region state ──────────────────────────────────────────

  const endpointTypes = useMemo(
    () => [...new Set(rows.map((r) => r.endpoint_type))].sort(),
    [rows],
  );

  const [endpointType, setEndpointType] = useState<string>(
    endpointTypes[0] ?? "grpc",
  );

  // Fall back to first available type if the selected one is no longer present.
  const activeType = endpointTypes.some((t) => t === endpointType)
    ? endpointType
    : (endpointTypes[0] ?? "grpc");

  const regions = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((r) => r.endpoint_type === activeType)
            .map((r) => r.region),
        ),
      ].sort(),
    [rows, activeType],
  );

  const [region, setRegion] = useState<string>(regions[0] ?? "iad");

  // Fall back to first available region if the selected one is no longer present.
  const activeRegion = regions.some((r) => r === region)
    ? region
    : (regions[0] ?? "");

  const [win, setWin] = useState<"h24" | "d7">("h24");

  // ── URL management ────────────────────────────────────────────────────────

  function buildUrl(ids: string[]): string {
    if (ids.length === 0) return pathname;
    const params = new URLSearchParams();
    for (const id of ids) params.append("p", id);
    return `${pathname}?${params.toString()}`;
  }

  function removeProvider(id: string): void {
    router.push(buildUrl(selectedIds.filter((p) => p !== id)));
  }

  function addProvider(id: string): void {
    if (selectedIds.length >= 4 || !id) return;
    router.push(buildUrl([...selectedIds, id]));
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const availableToAdd = allProviders.filter(
    (p) => !selectedIds.includes(p.id),
  );

  const selectedProviders = selectedIds.map((id) => ({
    id,
    name: allProviders.find((p) => p.id === id)?.name ?? id,
  }));

  const snapshots = selectedProviders.map((p) => ({
    provider: p,
    row: rows.find(
      (r) =>
        r.provider_id === p.id &&
        r.endpoint_type === activeType &&
        r.region === activeRegion,
    ),
  }));

  const gridClass = STAT_GRID[selectedIds.length] ?? "grid-cols-2";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Provider pills + add selector */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedProviders.map((p, i) => (
          <span
            key={p.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-bg-surface px-3 py-1 text-sm text-text-primary"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  PROVIDER_PALETTE[i % PROVIDER_PALETTE.length] ?? "#4da2ff",
              }}
            />
            {p.name}
            <button
              type="button"
              onClick={() => {
                removeProvider(p.id);
              }}
              className="ml-0.5 text-text-muted transition-colors hover:text-text-primary"
              aria-label={`Remove ${p.name}`}
            >
              ×
            </button>
          </span>
        ))}

        {selectedIds.length < 4 && availableToAdd.length > 0 && (
          <select
            className="cursor-pointer rounded-md border border-border bg-bg-surface px-2 py-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
            value=""
            onChange={(e) => {
              addProvider(e.target.value);
            }}
            aria-label="Add provider to comparison"
          >
            <option value="" disabled>
              + Add provider
            </option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Need at least 2 providers */}
      {selectedIds.length < 2 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-border bg-bg-surface text-center">
          <p className="text-text-secondary">
            {selectedIds.length === 0
              ? "No providers selected."
              : "Add at least one more provider to compare."}
          </p>
          {selectedIds.length === 0 && (
            <p className="mt-1 text-sm text-text-muted">
              Select providers from the{" "}
              <Link
                href="/"
                className="text-accent transition-colors hover:underline"
              >
                leaderboard
              </Link>{" "}
              or use the dropdown above.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Controls: endpoint type, region, window */}
          <div className="flex flex-wrap items-center gap-3">
            {endpointTypes.length > 1 && (
              <div className="flex gap-1 rounded-md border border-border bg-bg-surface p-1">
                {endpointTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setEndpointType(type);
                    }}
                    className={
                      type === activeType
                        ? "rounded px-3 py-1 text-xs font-medium bg-accent-dim text-accent"
                        : "rounded px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                    }
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {regions.length > 1 && (
              <div className="flex gap-1 rounded-md border border-border bg-bg-surface p-1">
                {regions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRegion(r);
                    }}
                    className={
                      r === activeRegion
                        ? "rounded px-3 py-1 text-xs font-medium bg-accent-dim text-accent"
                        : "rounded px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                    }
                  >
                    {regionLabel(r)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-1 rounded-md border border-border bg-bg-surface p-1">
              {(["h24", "d7"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setWin(w);
                  }}
                  className={
                    w === win
                      ? "rounded px-3 py-1 text-xs font-medium bg-accent-dim text-accent"
                      : "rounded px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                  }
                >
                  {w === "h24" ? "24h" : "7d"}
                </button>
              ))}
            </div>
          </div>

          {/* Stat cards — current snapshot per provider */}
          <div className={`grid gap-4 ${gridClass}`}>
            {snapshots.map(({ provider, row }, i) => (
              <div
                key={provider.id}
                className="overflow-hidden rounded-md border border-border bg-bg-surface"
              >
                <div
                  className="h-1"
                  style={{
                    background:
                      PROVIDER_PALETTE[i % PROVIDER_PALETTE.length] ??
                      "#4da2ff",
                  }}
                />
                <div className="p-4">
                  <p className="mb-3 font-medium text-text-primary">
                    {provider.name}
                  </p>
                  {row === undefined ? (
                    <p className="text-sm text-text-muted">
                      No data for {activeType.toUpperCase()} ·{" "}
                      {regionLabel(activeRegion)}
                    </p>
                  ) : (
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">p50 latency</dt>
                        <dd className="font-mono text-text-primary">
                          {fmtMs(row.latency_p50)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">p90 latency</dt>
                        <dd className="font-mono text-text-primary">
                          {fmtMs(row.latency_p90)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Freshness</dt>
                        <dd className="font-mono text-text-primary">
                          {fmtCkpts(row.freshness_avg)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Uptime</dt>
                        <dd className="font-mono text-text-primary">
                          {fmtPct(row.uptime, 1)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Error rate</dt>
                        <dd className="font-mono text-text-primary">
                          {fmtPct(row.error_rate, 2)}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Provider legend */}
          <div className="flex flex-wrap items-center gap-4">
            {selectedProviders.map((p, i) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 text-xs text-text-secondary"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-5 rounded-sm"
                  style={{
                    background:
                      PROVIDER_PALETTE[i % PROVIDER_PALETTE.length] ??
                      "#4da2ff",
                  }}
                />
                {p.name}
              </span>
            ))}
          </div>

          {/* Time-series charts */}
          {loadingIds.size > 0 && (
            <p className="text-sm text-text-muted">
              Loading chart data
              {[...loadingIds]
                .map(
                  (id) =>
                    allProviders.find((p) => p.id === id)?.name ?? id,
                )
                .join(", ")}
              …
            </p>
          )}
          <CompareCharts
            providers={selectedProviders}
            timeSeriesMap={timeSeriesMap}
            endpointType={activeType}
            region={activeRegion}
            win={win}
          />
        </>
      )}
    </div>
  );
}
