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

interface LatencyUptimeRow {
  provider_id: string;
  region: string;
  endpoint_type: string;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  /** ClickHouse returns UInt64 counts as strings. */
  total_1h: string;
  success_1h: string;
}

interface ErrorRateRow {
  provider_id: string;
  region: string;
  endpoint_type: string;
  total_5m: string;
  success_5m: string;
}

interface FreshnessRow {
  provider_id: string;
  region: string;
  endpoint_type: string;
  freshness_avg: number;
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
 *   2. Error-rate counts                  (metric=latency_ms, last 5 min)
 *   3. Freshness average                  (metric=freshness_checkpoints, last 1 h)
 *
 * Merges results by (provider_id, region, endpoint_type).
 */
export async function queryLatestMetrics(
  ch: ClickHouseClient,
): Promise<MetricRow[]> {
  const [latRes, errRes, freshRes] = await Promise.all([
    ch.query({
      query: `
        SELECT
          provider_id, region, endpoint_type,
          if(countIf(success) > 0, quantileIf(0.5)(value, success),  NULL) AS latency_p50,
          if(countIf(success) > 0, quantileIf(0.9)(value, success),  NULL) AS latency_p90,
          if(countIf(success) > 0, quantileIf(0.99)(value, success), NULL) AS latency_p99,
          count()       AS total_1h,
          countIf(success) AS success_1h
        FROM measurements
        WHERE metric = 'latency_ms'
          AND timestamp >= now() - INTERVAL 1 HOUR
        GROUP BY provider_id, region, endpoint_type
      `,
      format: "JSONEachRow",
    }),
    ch.query({
      query: `
        SELECT
          provider_id, region, endpoint_type,
          count()          AS total_5m,
          countIf(success) AS success_5m
        FROM measurements
        WHERE metric = 'latency_ms'
          AND timestamp >= now() - INTERVAL 5 MINUTE
        GROUP BY provider_id, region, endpoint_type
      `,
      format: "JSONEachRow",
    }),
    ch.query({
      query: `
        SELECT
          provider_id, region, endpoint_type,
          avg(value) AS freshness_avg
        FROM measurements
        WHERE metric = 'freshness_checkpoints'
          AND success = true
          AND timestamp >= now() - INTERVAL 1 HOUR
        GROUP BY provider_id, region, endpoint_type
      `,
      format: "JSONEachRow",
    }),
  ]);

  const latRows = await latRes.json<LatencyUptimeRow>();
  const errRows = await errRes.json<ErrorRateRow>();
  const freshRows = await freshRes.json<FreshnessRow>();

  // Build lookup maps keyed by "provider_id:region:endpoint_type"
  const errMap = new Map(
    errRows.map((r) => [
      `${r.provider_id}:${r.region}:${r.endpoint_type}`,
      r,
    ]),
  );
  const freshMap = new Map(
    freshRows.map((r) => [
      `${r.provider_id}:${r.region}:${r.endpoint_type}`,
      r.freshness_avg,
    ]),
  );

  return latRows.map((r): MetricRow => {
    const key = `${r.provider_id}:${r.region}:${r.endpoint_type}`;
    const total1h = Number(r.total_1h);
    const success1h = Number(r.success_1h);
    const err = errMap.get(key);
    const total5m = err ? Number(err.total_5m) : 0;
    const success5m = err ? Number(err.success_5m) : 0;

    return {
      provider_id: r.provider_id,
      region: r.region,
      endpoint_type: r.endpoint_type,
      latency_p50: r.latency_p50,
      latency_p90: r.latency_p90,
      latency_p99: r.latency_p99,
      freshness_avg: freshMap.has(key) ? (freshMap.get(key) ?? null) : null,
      uptime: total1h > 0 ? success1h / total1h : null,
      error_rate: total5m > 0 ? 1 - success5m / total5m : null,
    };
  });
}

// ─── queryProviderTimeSeries ──────────────────────────────────────────────────

/**
 * Query ClickHouse for time-bucketed metrics for a single provider.
 *
 * Runs 2 parallel queries:
 *   1. Latency percentiles + uptime counts (latency_ms)
 *   2. Freshness average                   (freshness_checkpoints, success only)
 *
 * Merges by (bucket, region, endpoint_type) and returns a TimeSeriesResponse.
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
  const { bucketExpr, interval } = WINDOW_CONFIGS[window];

  // Bucket expression is from a hardcoded lookup — never user input.
  // provider_id is passed as a parameterized query parameter.
  const bucketSelect = `toUnixTimestamp(${bucketExpr}) * 1000`;

  const [latRes, freshRes] = await Promise.all([
    ch.query({
      query: `
        SELECT
          ${bucketSelect}          AS bucket,
          region, endpoint_type,
          if(countIf(success) > 0, quantileIf(0.5)(value, success),  NULL) AS latency_p50,
          if(countIf(success) > 0, quantileIf(0.9)(value, success),  NULL) AS latency_p90,
          if(countIf(success) > 0, quantileIf(0.99)(value, success), NULL) AS latency_p99,
          count()          AS total_count,
          countIf(success) AS success_count
        FROM measurements
        WHERE provider_id = {provider_id: String}
          AND metric = 'latency_ms'
          AND timestamp >= now() - ${interval}
        GROUP BY bucket, region, endpoint_type
        ORDER BY bucket, region, endpoint_type ASC
      `,
      query_params: { provider_id: providerId },
      format: "JSONEachRow",
    }),
    ch.query({
      query: `
        SELECT
          ${bucketSelect} AS bucket,
          region, endpoint_type,
          avg(value)      AS freshness_avg
        FROM measurements
        WHERE provider_id = {provider_id: String}
          AND metric = 'freshness_checkpoints'
          AND success = true
          AND timestamp >= now() - ${interval}
        GROUP BY bucket, region, endpoint_type
        ORDER BY bucket, region, endpoint_type ASC
      `,
      query_params: { provider_id: providerId },
      format: "JSONEachRow",
    }),
  ]);

  const latRows = await latRes.json<LatencySeriesRow>();
  const freshRows = await freshRes.json<FreshnessSeriesRow>();

  // Build freshness lookup: "bucket:region:endpoint_type" → freshness_avg
  const freshMap = new Map(
    freshRows.map((r) => [
      `${r.bucket}:${r.region}:${r.endpoint_type}`,
      r.freshness_avg,
    ]),
  );

  // Group by (region, endpoint_type)
  const seriesMap = new Map<string, TimeSeriesPoint[]>();

  for (const r of latRows) {
    const sk = seriesKey(r.region, r.endpoint_type);
    if (!seriesMap.has(sk)) seriesMap.set(sk, []);

    const bk = `${r.bucket}:${r.region}:${r.endpoint_type}`;
    const total = Number(r.total_count);
    const success = Number(r.success_count);

    seriesMap.get(sk)!.push({
      timestamp: Number(r.bucket),
      latency_p50: r.latency_p50,
      latency_p90: r.latency_p90,
      latency_p99: r.latency_p99,
      freshness_avg: freshMap.has(bk) ? (freshMap.get(bk) ?? null) : null,
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
}
