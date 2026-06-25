import { readFileSync } from "node:fs";

import yaml from "js-yaml";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Public gRPC endpoint as "host:port". */
  grpc: z.string().optional(),
  /** Public GraphQL endpoint as a full URL. */
  graphql: z.string().url().optional(),
  /** Public archival gRPC endpoint as "host:port". */
  archival: z.string().optional(),
  /** Name of the env var holding a private gRPC endpoint (never exposed via the API). */
  grpc_env: z.string().optional(),
  /** Name of the env var holding a private GraphQL endpoint (never exposed via the API). */
  graphql_env: z.string().optional(),
  /** Name of the env var holding a private archival endpoint (never exposed via the API). */
  archival_env: z.string().optional(),
  /** Static headers / metadata attached to every endpoint type. Not exposed via the API. */
  headers: z.record(z.string().min(1), z.string().min(1)).optional(),
  /** Static headers / metadata attached only to gRPC requests. Not exposed via the API. */
  grpc_headers: z.record(z.string().min(1), z.string().min(1)).optional(),
  /** Static HTTP headers attached only to GraphQL requests. Not exposed via the API. */
  graphql_headers: z.record(z.string().min(1), z.string().min(1)).optional(),
  /** Static headers / metadata attached only to archival requests. Not exposed via the API. */
  archival_headers: z.record(z.string().min(1), z.string().min(1)).optional(),
  /** gRPC token header name (safe to store; value lives in an env var). */
  grpc_token_header: z.string().optional(),
  /** Name of the env var holding the gRPC token value (never exposed via the API). */
  grpc_token_env: z.string().optional(),
  /** GraphQL token header name (safe to store; value lives in an env var). */
  graphql_token_header: z.string().optional(),
  /** Name of the env var holding the GraphQL token value (never exposed via the API). */
  graphql_token_env: z.string().optional(),
  /** Archival token header name (safe to store; value lives in an env var). */
  archival_token_header: z.string().optional(),
  /** Name of the env var holding the archival token value (never exposed via the API). */
  archival_token_env: z.string().optional(),
  /**
   * Whether this provider's endpoint URL is freely accessible without auth.
   * Defaults to true. When false the endpoint URL is withheld from API responses.
   */
  public: z.boolean().default(true),
  /** Optional provider-wide list of probe regions. Omitted means all regions. */
  regions: z.array(z.string().min(1)).min(1).optional(),
  /** Internal probe control: whether probes run long-lived gRPC stream checks. Not exposed via the API. */
  stream: z.boolean().optional(),
}).refine(
  (data) => data.regions == null || new Set(data.regions).size === data.regions.length,
  {
    message: "regions must not contain duplicate values",
  },
);

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderSchema),
});

export type Provider = z.infer<typeof ProviderSchema>;

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load and validate providers from a YAML file.
 * Throws with a descriptive message if the file is missing or invalid.
 *
 * @param filePath - Absolute or CWD-relative path to providers.yaml.
 */
export function loadProviders(filePath: string): Provider[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Cannot read providers config at "${filePath}": ${String(err)}`,
    );
  }

  const parsed = yaml.load(raw);
  const result = ProvidersFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid providers config at "${filePath}": ${result.error.message}`,
    );
  }

  return result.data.providers;
}

/**
 * Build a name lookup map from a provider list.
 * Returns provider_id → display name.
 */
export function buildProviderNameMap(
  providers: Provider[],
): ReadonlyMap<string, string> {
  return new Map(providers.map((p) => [p.id, p.name]));
}

/**
 * Shape of a single provider entry in public API responses.
 * Endpoint URLs are withheld for private providers (public === false).
 */
export type ProviderApiResponse = {
  id: string;
  name: string;
  public: boolean;
  endpoint_types: Array<"grpc" | "graphql" | "archival">;
  regions?: string[];
  grpc?: string;
  graphql?: string;
  archival?: string;
};

/**
 * Convert an internal Provider list into the public API response shape.
 * Strips endpoint URLs (and internal env-var field names) for private providers.
 */
export function toProviderApiResponse(providers: Provider[]): ProviderApiResponse[] {
  return providers.map((p) => {
    const endpointTypes: ProviderApiResponse["endpoint_types"] = [];
    if (p.grpc != null || p.grpc_env != null) endpointTypes.push("grpc");
    if (p.graphql != null || p.graphql_env != null) endpointTypes.push("graphql");
    if (p.archival != null || p.archival_env != null) endpointTypes.push("archival");

    const base: ProviderApiResponse = {
      id: p.id,
      name: p.name,
      public: p.public,
      endpoint_types: endpointTypes,
    };
    if (p.regions != null) base.regions = p.regions;
    if (p.public) {
      if (p.grpc != null) base.grpc = p.grpc;
      if (p.graphql != null) base.graphql = p.graphql;
      if (p.archival != null) base.archival = p.archival;
    }
    return base;
  });
}
