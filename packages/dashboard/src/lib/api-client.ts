/**
 * Typed fetch helpers for the SuiScope public API.
 *
 * All functions run server-side in Next.js server components.
 * The base URL is read from NEXT_PUBLIC_API_URL at call time.
 */

import type { ProviderMetrics, TimeSeriesMap, TimeSeriesPoint } from "@/lib/mock-data";

// ─── Re-exported types ────────────────────────────────────────────────────────

export type { ProviderMetrics, TimeSeriesMap, TimeSeriesPoint };

// ─── Provider types ───────────────────────────────────────────────────────────

export interface ApiProvider {
  id: string;
  name: string;
  grpc?: string;
  graphql?: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

interface ProvidersResponse {
  providers: ApiProvider[];
}

interface MetricsResponse {
  metrics: Array<ProviderMetrics & { provider_name: string }>;
  generated_at: number;
}

interface ApiTimeSeriesPoint {
  timestamp: number;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  freshness_avg: number | null;
  uptime: number | null;
  error_rate: number | null;
}

interface ApiSeriesEntry {
  region: string;
  endpoint_type: string;
  points: ApiTimeSeriesPoint[];
}

interface ProviderTimeSeriesResponse {
  provider_id: string;
  provider_name: string;
  window: string;
  series: ApiSeriesEntry[];
}

// ─── Base URL ─────────────────────────────────────────────────────────────────

function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL is not set");
  return url.replace(/\/$/, "");
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

/**
 * Fetch the list of registered providers.
 * Revalidates every 60 s (provider list changes rarely).
 */
export async function fetchProviders(): Promise<ApiProvider[]> {
  const res = await fetch(`${apiBase()}/v1/providers`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`/v1/providers responded ${res.status}`);
  }
  const data = (await res.json()) as ProvidersResponse;
  return data.providers;
}

/**
 * Fetch the latest aggregated metrics for all providers.
 * Revalidates every 60 s (probe cycle is 60 s).
 */
export async function fetchMetrics(): Promise<ProviderMetrics[]> {
  const res = await fetch(`${apiBase()}/v1/metrics`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`/v1/metrics responded ${res.status}`);
  }
  const data = (await res.json()) as MetricsResponse;
  return data.metrics;
}

/**
 * Fetch time-series data for a single provider and adapt it to the
 * TimeSeriesMap format expected by MetricCharts.
 *
 * @param providerId - Provider ID (from providers.yaml).
 * @param window     - "1h" | "24h" | "7d" | "30d"
 * @param mapKey     - Which window key to populate ("h24" or "d7").
 */
export async function fetchProviderTimeSeries(
  providerId: string,
  window: string,
  mapKey: "h24" | "d7",
): Promise<TimeSeriesMap> {
  const res = await fetch(
    `${apiBase()}/v1/metrics/${encodeURIComponent(providerId)}?window=${window}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) {
    // Return empty map on error — charts gracefully show no data.
    return {};
  }
  const data = (await res.json()) as ProviderTimeSeriesResponse;
  const map: TimeSeriesMap = {};

  for (const series of data.series) {
    const key = `${providerId}:${series.endpoint_type}:${series.region}`;
    const existing = map[key];
    const points: TimeSeriesPoint[] = series.points;

    if (existing) {
      existing[mapKey] = points;
    } else {
      map[key] = { h24: [], d7: [], [mapKey]: points };
    }
  }

  return map;
}

/**
 * Merge two TimeSeriesMaps together (h24 from one call, d7 from another).
 */
export function mergeTimeSeriesMaps(
  a: TimeSeriesMap,
  b: TimeSeriesMap,
): TimeSeriesMap {
  const result: TimeSeriesMap = { ...a };
  for (const [key, bVal] of Object.entries(b)) {
    const aVal = result[key];
    if (aVal) {
      result[key] = {
        h24: aVal.h24.length > 0 ? aVal.h24 : bVal.h24,
        d7: aVal.d7.length > 0 ? aVal.d7 : bVal.d7,
      };
    } else {
      result[key] = bVal;
    }
  }
  return result;
}
