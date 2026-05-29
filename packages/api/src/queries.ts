import type { ClickHouseClient } from "./db/client.js";

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Aggregated snapshot row for one provider × region × endpoint_type. */
export interface MetricRow {
  provider_id: string;
  region: string;
  endpoint_type: string;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  freshness_avg: number | null;
  /** Fraction 0–1: successful probes / total probes over 1 h rolling window. */
  uptime: number | null;
  /** Fraction 0–1: failed probes / total probes over 5 min rolling window. */
  error_rate: number | null;
}

/** One time-bucketed point in a time-series. */
export interface TimeSeriesPoint {
  /** Unix timestamp in milliseconds (start of the bucket). */
  timestamp: number;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  freshness_avg: number | null;
  uptime: number | null;
  error_rate: number | null;
}

/** Time-series for one (region, endpoint_type) pair belonging to a provider. */
export interface TimeSeriesSeries {
  region: string;
  endpoint_type: string;
  points: TimeSeriesPoint[];
}

export interface TimeSeriesResponse {
  provider_id: string;
  window: TimeWindow;
  series: TimeSeriesSeries[];
}

// ─── Window configs ───────────────────────────────────────────────────────────

const WINDOW_CONFIGS = {
  "1h": {
    bucketExpr: "toStartOfFiveMinutes(timestamp)",
    interval: "INTERVAL 1 HOUR",
  },
  "24h": {
    bucketExpr: "toStartOfHour(timestamp)",
    interval: "INTERVAL 24 HOUR",
  },
  "7d": {
    bucketExpr: "toStartOfInterval(timestamp, INTERVAL 6 HOUR)",
    interval: "INTERVAL 7 DAY",
  },
  "30d": {
    bucketExpr: "toStartOfDay(timestamp)",
    interval: "INTERVAL 30 DAY",
  },
} as const satisfies Record<string, { bucketExpr: string; interval: string }>;

export type TimeWindow = keyof typeof WINDOW_CONFIGS;

export const VALID_WINDOWS = Object.keys(WINDOW_CONFIGS) as TimeWindow[];

// ─── ClickHouse row shapes (internal) ────────────────────────────────────────

interface CombinedMetricRow {
  provider_id: string;
  region: string;
  endpoint_type: string;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  /** ClickHouse returns UInt64 counts as strings. */
  total_1h: string;
  success_1h: string;
  total_5m: string;
  success_5m: string;
  freshness_avg: number | null;
}

interface LatencySeriesRow {
  bucket: string;
  region: string;
  endpoint_type: string;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  total_count: string;
  success_count: string;
}

interface FreshnessSeriesRow {
  bucket: string;
  region: string;
  endpoint_type: string;
  freshness_avg: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function seriesKey(region: string, endpoint_type: string): string {
  return `${region}:${endpoint_type}`;
}

// ─── queryLatestMetrics ───────────────────────────────────────────────────────

/**
 * Query ClickHouse for the latest aggregated metrics across all providers.
 *
 * Runs 3 parallel queries:
 *   1. Latency percentiles + uptime counts (metric=latency_ms, last 1 h)
 *   Single pass over measurements covering all three metrics in one query.
 */
export async function queryLatestMetrics(
  ch: ClickHouseClient,
): Promise<MetricRow[]> {
  const res = await ch.query({
    query: `
      SELECT
        provider_id,
        region,
        endpoint_type,
        if(
          countIf(metric = 'latency_ms' AND success) > 0,
          quantileIf(0.5)(value,  metric = 'latency_ms' AND success), NULL
        ) AS latency_p50,
        if(
          countIf(metric = 'latency_ms' AND success) > 0,
          quantileIf(0.9)(value,  metric = 'latency_ms' AND success), NULL
        ) AS latency_p90,
        if(
          countIf(metric = 'latency_ms' AND success) > 0,
          quantileIf(0.99)(value, metric = 'latency_ms' AND success), NULL
        ) AS latency_p99,
        countIf(metric = 'latency_ms' AND timestamp >= now() - INTERVAL 1 HOUR)           AS total_1h,
        countIf(metric = 'latency_ms' AND timestamp >= now() - INTERVAL 1 HOUR AND success) AS success_1h,
        countIf(metric = 'latency_ms' AND timestamp >= now() - INTERVAL 5 MINUTE)           AS total_5m,
        countIf(metric = 'latency_ms' AND timestamp >= now() - INTERVAL 5 MINUTE AND success) AS success_5m,
        avgIf(value, metric = 'freshness_checkpoints' AND success AND timestamp >= now() - INTERVAL 1 HOUR) AS freshness_avg
      FROM measurements
      WHERE metric IN ('latency_ms', 'freshness_checkpoints')
        AND timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY provider_id, region, endpoint_type
    `,
    format: "JSONEachRow",
  });

  const rows = await res.json<CombinedMetricRow>();

  return rows.map((r): MetricRow => {
    const total1h = Number(r.total_1h);
    const success1h = Number(r.success_1h);
    const total5m = Number(r.total_5m);
    const success5m = Number(r.success_5m);

    return {
      provider_id: r.provider_id,
      region: r.region,
      endpoint_type: r.endpoint_type,
      latency_p50: r.latency_p50,
      latency_p90: r.latency_p90,
      latency_p99: r.latency_p99,
      freshness_avg: r.freshness_avg,
      uptime: total1h > 0 ? success1h / total1h : null,
      error_rate: total5m > 0 ? 1 - success5m / total5m : null,
    };
  });
}

// ─── Per-provider time-series cache ─────────────────────────────────────────

// Key: "providerId:window" → cached TimeSeriesResponse
const timeSeriesCache = new Map<string, { value: TimeSeriesResponse; expiresAt: number }>();
const timeSeriesInflight = new Map<string, Promise<TimeSeriesResponse>>();
const TS_CACHE_TTL_MS = 60_000;

// ─── queryProviderTimeSeries ──────────────────────────────────────────────────

/**
 * Query ClickHouse for time-bucketed metrics for a single provider.
 *
 * Single query covering both latency and freshness metrics.
 * Results are cached per provider+window for 60 s.
 *
 * @param ch         - ClickHouse client.
 * @param providerId - Provider ID (validated, not from raw user input).
 * @param window     - Time window key from WINDOW_CONFIGS.
 */
export async function queryProviderTimeSeries(
  ch: ClickHouseClient,
  providerId: string,
  window: TimeWindow,
): Promise<TimeSeriesResponse> {
  const cacheKey = `${providerId}:${window}`;
  const now = Date.now();
  const cached = timeSeriesCache.get(cacheKey);
  if (cached !== undefined && now < cached.expiresAt) return cached.value;

  const existing = timeSeriesInflight.get(cacheKey);
  if (existing !== undefined) return existing;

  const { bucketExpr, interval } = WINDOW_CONFIGS[window];
  const bucketSelect = `toUnixTimestamp(${bucketExpr}) * 1000`;

  const promise = ch.query({
      query: `
        SELECT
          ${bucketSelect}          AS bucket,
          region, endpoint_type,
          if(countIf(metric = 'latency_ms' AND success) > 0, quantileIf(0.5)(value,  metric = 'latency_ms' AND success), NULL) AS latency_p50,
          if(countIf(metric = 'latency_ms' AND success) > 0, quantileIf(0.9)(value,  metric = 'latency_ms' AND success), NULL) AS latency_p90,
          if(countIf(metric = 'latency_ms' AND success) > 0, quantileIf(0.99)(value, metric = 'latency_ms' AND success), NULL) AS latency_p99,
          countIf(metric = 'latency_ms')           AS total_count,
          countIf(metric = 'latency_ms' AND success) AS success_count,
          avgIf(value, metric = 'freshness_checkpoints' AND success) AS freshness_avg
        FROM measurements
        WHERE provider_id = {provider_id: String}
          AND metric IN ('latency_ms', 'freshness_checkpoints')
          AND timestamp >= now() - ${interval}
        GROUP BY bucket, region, endpoint_type
        ORDER BY bucket, region, endpoint_type ASC
      `,
      query_params: { provider_id: providerId },
      format: "JSONEachRow",
    })
    .then(async (res) => {
      interface CombinedSeriesRow {
        bucket: string;
        region: string;
        endpoint_type: string;
        latency_p50: number | null;
        latency_p90: number | null;
        latency_p99: number | null;
        total_count: string;
        success_count: string;
        freshness_avg: number | null;
      }
      const rows = await res.json<CombinedSeriesRow>();
      const seriesMap = new Map<string, TimeSeriesPoint[]>();

      for (const r of rows) {
        const sk = seriesKey(r.region, r.endpoint_type);
        if (!seriesMap.has(sk)) seriesMap.set(sk, []);
        const total = Number(r.total_count);
        const success = Number(r.success_count);
        seriesMap.get(sk)!.push({
          timestamp: Number(r.bucket),
          latency_p50: r.latency_p50,
          latency_p90: r.latency_p90,
          latency_p99: r.latency_p99,
          freshness_avg: r.freshness_avg,
          uptime: total > 0 ? success / total : null,
          error_rate: total > 0 ? 1 - success / total : null,
        });
      }

      const series: TimeSeriesSeries[] = Array.from(seriesMap.entries()).map(
        ([sk, points]) => {
          const [region, endpoint_type] = sk.split(":") as [string, string];
          return { region, endpoint_type, points };
        },
      );
      return { provider_id: providerId, window, series };
    })
    .then((result) => {
      timeSeriesCache.set(cacheKey, { value: result, expiresAt: Date.now() + TS_CACHE_TTL_MS });
      timeSeriesInflight.delete(cacheKey);
      return result;
    })
    .catch((err) => {
      timeSeriesInflight.delete(cacheKey);
      throw err;
    });

  timeSeriesInflight.set(cacheKey, promise);
  return promise;
}
