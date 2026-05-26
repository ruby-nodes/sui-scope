/**
 * Canonical measurement event emitted by every probe cycle.
 * Definition source: architecture.md — do not change field semantics without an ADR.
 */
export type MeasurementEvent = {
  provider_id: string;
  region: string;
  endpoint_type: "grpc" | "graphql" | "archival";
  metric:
    | "latency_ms"
    | "freshness_checkpoints"
    | "stream_checkpoint_gap"
    | "stream_uptime_pct"
    | "stream_disconnects_per_hour";
  value: number;
  success: boolean;
  error_type: string | null;
  probe_version: string;
  timestamp: number; // unix ms
};

/** Configuration for a single gRPC provider endpoint. */
export type GrpcProviderConfig = {
  id: string;
  endpoint: string; // "host:port", e.g. "fullnode.mainnet.sui.io:443"
};

/** Configuration for a single GraphQL provider endpoint. */
export type GraphQLProviderConfig = {
  id: string;
  endpoint: string; // full URL, e.g. "https://sui-mainnet.mystenlabs.com/graphql"
};
