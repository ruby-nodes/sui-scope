/**
 * Placeholder data — will be replaced by real API responses in M3-05.
 * Shape intentionally mirrors the /v1/metrics response the API will serve.
 */

export type EndpointType = "grpc" | "graphql";

/** One aggregatable unit: a single probe endpoint for a provider in a region. */
export interface ProviderMetrics {
  provider_id: string;
  provider_name: string;
  endpoint_type: EndpointType;
  region: string;
  /** Whether this provider's endpoint is freely publicly accessible (no auth required). */
  is_public: boolean;
  /** Milliseconds — cold TCP+TLS latency, p50 */
  latency_p50: number | null;
  /** Milliseconds — cold TCP+TLS latency, p90 */
  latency_p90: number | null;
  /** Milliseconds — cold TCP+TLS latency, p99 */
  latency_p99: number | null;
  /** Checkpoints behind chain head — lower is better */
  freshness_avg: number | null;
  /** Fraction 0–1; successful probes / total over 1 h rolling window */
  uptime: number | null;
  /** Fraction 0–1; failed probes / total over 5 min rolling window */
  error_rate: number | null;
}

export const KNOWN_REGIONS = ["iad", "fra", "sin", "nrt", "lax"] as const;
export type Region = (typeof KNOWN_REGIONS)[number];

/** Maps Fly.io 3-letter region codes to human-readable city names. */
const REGION_LABELS: Record<string, string> = {
  ams: "Amsterdam",
  arn: "Stockholm",
  atl: "Atlanta",
  bog: "Bogotá",
  bom: "Mumbai",
  bos: "Boston",
  cdg: "Paris",
  den: "Denver",
  dfw: "Dallas",
  ewr: "Secaucus",
  fra: "Frankfurt",
  gdl: "Guadalajara",
  gig: "Rio de Janeiro",
  gru: "São Paulo",
  hkg: "Hong Kong",
  iad: "Ashburn",
  jnb: "Johannesburg",
  lax: "Los Angeles",
  lhr: "London",
  mad: "Madrid",
  mia: "Miami",
  nrt: "Tokyo",
  ord: "Chicago",
  otp: "Bucharest",
  phx: "Phoenix",
  qro: "Querétaro",
  scl: "Santiago",
  sea: "Seattle",
  sin: "Singapore",
  sjc: "San Jose",
  syd: "Sydney",
  waw: "Warsaw",
  yul: "Montreal",
  yyz: "Toronto",
};

/**
 * Returns a human-readable label for a Fly.io region code.
 * Falls back to the uppercase code for any unrecognised value.
 */
export function regionLabel(code: string): string {
  return REGION_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

export const MOCK_METRICS: ProviderMetrics[] = (
  [
  // Mysten Labs — gRPC
  { provider_id: "mystenlab", provider_name: "Mysten Labs", endpoint_type: "grpc",    region: "iad", latency_p50: 42,  latency_p90: 68,  latency_p99: 112, freshness_avg: 1, uptime: 0.999, error_rate: 0.001 },
  { provider_id: "mystenlab", provider_name: "Mysten Labs", endpoint_type: "grpc",    region: "fra", latency_p50: 88,  latency_p90: 130, latency_p99: 210, freshness_avg: 2, uptime: 0.998, error_rate: 0.002 },
  // Mysten Labs — GraphQL
  { provider_id: "mystenlab", provider_name: "Mysten Labs", endpoint_type: "graphql", region: "iad", latency_p50: 55,  latency_p90: 90,  latency_p99: 150, freshness_avg: 1, uptime: 0.997, error_rate: 0.003 },
  { provider_id: "mystenlab", provider_name: "Mysten Labs", endpoint_type: "graphql", region: "fra", latency_p50: 110, latency_p90: 175, latency_p99: 280, freshness_avg: 2, uptime: 0.996, error_rate: 0.004 },
  // Ankr — gRPC
  { provider_id: "ankr",      provider_name: "Ankr",        endpoint_type: "grpc",    region: "iad", latency_p50: 65,  latency_p90: 105, latency_p99: 190, freshness_avg: 3, uptime: 0.992, error_rate: 0.008 },
  { provider_id: "ankr",      provider_name: "Ankr",        endpoint_type: "grpc",    region: "fra", latency_p50: 120, latency_p90: 200, latency_p99: 350, freshness_avg: 5, uptime: 0.989, error_rate: 0.011 },
  // Ankr — GraphQL
  { provider_id: "ankr",      provider_name: "Ankr",        endpoint_type: "graphql", region: "iad", latency_p50: 78,  latency_p90: 125, latency_p99: 220, freshness_avg: 3, uptime: 0.990, error_rate: 0.010 },
  { provider_id: "ankr",      provider_name: "Ankr",        endpoint_type: "graphql", region: "fra", latency_p50: 140, latency_p90: 230, latency_p99: 400, freshness_avg: 6, uptime: 0.986, error_rate: 0.014 },
  // 01node — gRPC
  { provider_id: "01node",    provider_name: "01node",      endpoint_type: "grpc",    region: "iad", latency_p50: 95,  latency_p90: 160, latency_p99: 280, freshness_avg: 4, uptime: 0.985, error_rate: 0.015 },
  { provider_id: "01node",    provider_name: "01node",      endpoint_type: "grpc",    region: "fra", latency_p50: 55,  latency_p90: 90,  latency_p99: 160, freshness_avg: 2, uptime: 0.993, error_rate: 0.007 },
  // 01node — GraphQL
  { provider_id: "01node",    provider_name: "01node",      endpoint_type: "graphql", region: "iad", latency_p50: 112, latency_p90: 185, latency_p99: 310, freshness_avg: 5, uptime: 0.982, error_rate: 0.018 },
  { provider_id: "01node",    provider_name: "01node",      endpoint_type: "graphql", region: "fra", latency_p50: 68,  latency_p90: 115, latency_p99: 195, freshness_avg: 3, uptime: 0.990, error_rate: 0.010 },
] as Omit<ProviderMetrics, "is_public">[]
).map((r) => ({ ...r, is_public: true }));

// ─── Time-series mock data ────────────────────────────────────────────────────

/** A single time-bucketed observation for one provider / endpoint / region. */
export interface TimeSeriesPoint {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p99: number | null;
  /** Average checkpoints behind chain head over the bucket. */
  freshness_avg: number | null;
  /** Successful probes / total over the rolling 1-hour window. */
  uptime: number | null;
  /** Failed probes / total over the rolling 5-minute window. */
  error_rate: number | null;
}

export interface SeriesWindows {
  /** 24 hourly data points (24 h window). */
  h24: TimeSeriesPoint[];
  /** 28 six-hour data points (7 d window). */
  d7: TimeSeriesPoint[];
}

/** Key format: `${provider_id}:${endpoint_type}:${region}` */
export type TimeSeriesMap = Record<string, SeriesWindows>;

/**
 * Fixed "now" for deterministic mock data generation.
 * 2026-05-26T12:00:00Z
 */
const SERIES_EPOCH = 1748260800000;
const HOUR_MS = 3_600_000;

/**
 * Generates a deterministic time-series using overlapping sin waves.
 * `seed` offsets the phase so each series looks visually distinct.
 */
function buildSeries(
  base: ProviderMetrics,
  seed: number,
  intervalMs: number,
  count: number,
): TimeSeriesPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const w =
      (Math.sin(i * 0.32 + seed) + Math.sin(i * 1.1 + seed * 2.3)) / 2;
    const j = (v: number, amp: number) => Math.max(0, v * (1 + w * amp));
    return {
      timestamp: SERIES_EPOCH - (count - 1 - i) * intervalMs,
      latency_p50:
        base.latency_p50 === null
          ? null
          : Math.round(j(base.latency_p50, 0.12)),
      latency_p90:
        base.latency_p90 === null
          ? null
          : Math.round(j(base.latency_p90, 0.12)),
      latency_p99:
        base.latency_p99 === null
          ? null
          : Math.round(j(base.latency_p99, 0.15)),
      freshness_avg:
        base.freshness_avg === null
          ? null
          : Math.round(j(base.freshness_avg, 0.3)),
      uptime:
        base.uptime === null ? null : Math.min(1, j(base.uptime, 0.005)),
      error_rate:
        base.error_rate === null
          ? null
          : Math.min(1, j(base.error_rate, 0.5)),
    };
  });
}

export const MOCK_TIME_SERIES: TimeSeriesMap = Object.fromEntries(
  MOCK_METRICS.map((row, idx) => {
    const key = `${row.provider_id}:${row.endpoint_type}:${row.region}`;
    const seed = idx * 1.73 + 0.5;
    return [
      key,
      {
        h24: buildSeries(row, seed, HOUR_MS, 24),
        d7: buildSeries(row, seed + 100, 6 * HOUR_MS, 28),
      },
    ];
  }),
);
