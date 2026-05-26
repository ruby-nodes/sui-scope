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

export const KNOWN_REGIONS = ["iad", "fra"] as const;
export type Region = (typeof KNOWN_REGIONS)[number];

export const MOCK_METRICS: ProviderMetrics[] = [
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
];
