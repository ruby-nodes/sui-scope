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

/** Auth token to attach to every request for this provider. */
export type ProviderToken = {
  /** HTTP header name (GraphQL) or gRPC metadata key to send the token under. */
  header: string;
  /** The token value, resolved at startup from an env var. */
  value: string;
};

/** Static HTTP headers / gRPC metadata attached to provider requests. */
export type ProviderHeaders = Record<string, string>;

/** Configuration for a single gRPC provider endpoint. */
export type GrpcProviderConfig = {
  id: string;
  endpoint: string; // "host:port", e.g. "fullnode.mainnet.sui.io:443"
  /** Whether this provider's endpoint URL is publicly accessible without auth. Default: true. */
  isPublic?: boolean;
  /** Static gRPC metadata to attach on every request. */
  headers?: ProviderHeaders;
  /** If set, attach this token as gRPC call metadata on every request. */
  token?: ProviderToken;
};

/** Configuration for a single GraphQL provider endpoint. */
export type GraphQLProviderConfig = {
  id: string;
  endpoint: string; // full URL, e.g. "https://sui-mainnet.mystenlabs.com/graphql"
  /** Whether this provider's endpoint URL is publicly accessible without auth. Default: true. */
  isPublic?: boolean;
  /** Static HTTP headers to attach on every request. */
  headers?: ProviderHeaders;
  /** If set, attach this token as an HTTP header on every request. */
  token?: ProviderToken;
};

/** Configuration for a single archival gRPC provider endpoint. */
export type ArchivalProviderConfig = {
  id: string;
  endpoint: string; // "host:port", e.g. "archive.mainnet.sui.io:443"
  /** Whether this provider's endpoint URL is publicly accessible without auth. Default: true. */
  isPublic?: boolean;
  /** Static gRPC metadata to attach on every request. */
  headers?: ProviderHeaders;
  /** If set, attach this token as gRPC call metadata on every request. */
  token?: ProviderToken;
};
