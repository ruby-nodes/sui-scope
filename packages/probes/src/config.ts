/**
 * Configuration loader for the probe daemon.
 *
 * Responsibilities:
 *   - Parse and validate `config/providers.yaml` with Zod
 *   - Parse and validate probe environment variables with Zod
 *   - Expose a stable default path resolution for providers.yaml
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";
import { z } from "zod";

import type { GrpcProviderConfig, GraphQLProviderConfig, ArchivalProviderConfig } from "./types.js";

// ─── Providers YAML schema ────────────────────────────────────────────────────

const ProviderEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    grpc: z.string().min(1).optional(),
    graphql: z.string().url().optional(),
    /** Name of an env var holding the gRPC "host:port" for this provider (private endpoint). */
    grpc_env: z.string().min(1).optional(),
    /** Name of an env var holding the archival gRPC "host:port" for this provider (private endpoint). */
    archival_env: z.string().min(1).optional(),
    /** Public archival gRPC endpoint as "host:port". */
    archival: z.string().min(1).optional(),
    /** Name of an env var holding the GraphQL full URL for this provider (private endpoint). */
    graphql_env: z.string().min(1).optional(),
    /**
     * Header/metadata key name for the gRPC auth token (e.g. "x-token", "authorization").
     * Must be paired with grpc_token_env.
     */
    grpc_token_header: z.string().min(1).optional(),
    /** Name of the env var holding the gRPC auth token value. Must be paired with grpc_token_header. */
    grpc_token_env: z.string().min(1).optional(),
    /**
     * HTTP header name for the GraphQL auth token (e.g. "Authorization", "x-api-key").
     * Must be paired with graphql_token_env.
     */
    graphql_token_header: z.string().min(1).optional(),
    /** Name of the env var holding the GraphQL auth token value. Must be paired with graphql_token_header. */
    graphql_token_env: z.string().min(1).optional(),
    /**
     * Whether this provider's endpoint URL is publicly accessible without auth.
     * Defaults to true. Set to false for providers whose URL contains an embedded API key.
     * Metrics are always published; only the URL is withheld when public is false.
     */
    public: z.boolean().default(true),
  })
  .refine(
    (data) =>
      data.grpc != null ||
      data.graphql != null ||
      data.archival != null ||
      data.grpc_env != null ||
      data.graphql_env != null ||
      data.archival_env != null,
    {
      message:
        "Each provider must have at least one of: grpc, graphql, archival, grpc_env, graphql_env, archival_env",
    },
  )
  .refine(
    (data) =>
      (data.grpc_token_header == null) === (data.grpc_token_env == null),
    {
      message: "grpc_token_header and grpc_token_env must both be set or both be absent",
    },
  )
  .refine(
    (data) =>
      (data.graphql_token_header == null) === (data.graphql_token_env == null),
    {
      message: "graphql_token_header and graphql_token_env must both be set or both be absent",
    },
  );

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderEntrySchema).min(1),
});

/** Parsed and split provider list ready for probe runners. */
export type LoadedProviders = {
  grpc: GrpcProviderConfig[];
  graphql: GraphQLProviderConfig[];
  archival: ArchivalProviderConfig[];
};

/**
 * Read and validate a providers YAML file.
 *
 * Resolves `grpc_env` / `graphql_env` references against `env` at call time.
 * Throws with a descriptive message if a referenced env var is not set.
 *
 * @param filePath - Absolute path to the YAML file.
 * @param env      - Environment variable map. Defaults to `process.env`.
 */
export function loadProviders(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): LoadedProviders {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = ProvidersFileSchema.parse(loadYaml(raw));

  const grpc: GrpcProviderConfig[] = [];
  const graphql: GraphQLProviderConfig[] = [];
  const archival: ArchivalProviderConfig[] = [];

  for (const entry of parsed.providers) {
    const isPublic = entry.public;

    // ── Resolve token helper ─────────────────────────────────────────────────
    function resolveToken(
      header: string | undefined,
      envVarName: string | undefined,
      label: string,
    ): { header: string; value: string } | undefined {
      if (envVarName == null) return undefined;
      const val = env[envVarName];
      if (!val) {
        throw new Error(
          `Provider "${entry.id}": env var "${envVarName}" (${label}) is not set`,
        );
      }
      return { header: header!, value: val };
    }

    // ── gRPC endpoint ────────────────────────────────────────────────────────
    let grpcEndpoint = entry.grpc;
    if (entry.grpc_env != null) {
      const val = env[entry.grpc_env];
      if (!val) {
        throw new Error(
          `Provider "${entry.id}": env var "${entry.grpc_env}" (grpc_env) is not set`,
        );
      }
      grpcEndpoint = val;
    }
    if (grpcEndpoint != null) {
      const token = resolveToken(entry.grpc_token_header, entry.grpc_token_env, "grpc_token_env");
      grpc.push({ id: entry.id, endpoint: grpcEndpoint, isPublic, ...(token ? { token } : {}) });
    }

    // ── GraphQL endpoint ─────────────────────────────────────────────────────
    let graphqlEndpoint = entry.graphql;
    if (entry.graphql_env != null) {
      const val = env[entry.graphql_env];
      if (!val) {
        throw new Error(
          `Provider "${entry.id}": env var "${entry.graphql_env}" (graphql_env) is not set`,
        );
      }
      graphqlEndpoint = val;
    }
    if (graphqlEndpoint != null) {
      const token = resolveToken(entry.graphql_token_header, entry.graphql_token_env, "graphql_token_env");
      graphql.push({ id: entry.id, endpoint: graphqlEndpoint, isPublic, ...(token ? { token } : {}) });
    }

    // ── Archival gRPC endpoint ───────────────────────────────────────────────
    let archivalEndpoint = entry.archival;
    if (entry.archival_env != null) {
      const val = env[entry.archival_env];
      if (!val) {
        throw new Error(
          `Provider "${entry.id}": env var "${entry.archival_env}" (archival_env) is not set`,
        );
      }
      archivalEndpoint = val;
    }
    if (archivalEndpoint != null) {
      archival.push({ id: entry.id, endpoint: archivalEndpoint, isPublic });
    }
  }

  return { grpc, graphql, archival };
}

// ─── Environment schema ───────────────────────────────────────────────────────

const EnvSchema = z.object({
  /** Geographic region identifier injected by the deployment platform (e.g. FLY_REGION). */
  REGION: z.string().min(1, "REGION env var is required"),
  /**
   * Probe cycle interval in milliseconds.
   * Optional — defaults to 60 000 (1 minute).
   */
  PROBE_INTERVAL_MS: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return 60_000;
      const n = Number.parseInt(val, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(
          `PROBE_INTERVAL_MS must be a positive integer, got "${val}"`,
        );
      }
      return n;
    }),
  /**
   * Override the path to providers.yaml.
   * Optional — defaults to the resolved path from resolveDefaultProvidersPath().
   */
  PROVIDERS_YAML_PATH: z.string().optional(),
  /** Full URL of the API ingest endpoint, e.g. http://suiscope-api.internal:3000/ingest */
  INGEST_URL: z.string().url("INGEST_URL must be a valid URL"),
  /** Shared secret matching the API server's INGEST_SECRET (sent as Authorization: Bearer). */
  INGEST_SECRET: z.string().min(1, "INGEST_SECRET env var is required"),
});

export type ProbeEnv = z.infer<typeof EnvSchema>;

/**
 * Parse and validate probe environment variables.
 * Throws a Zod error (with a descriptive message) on any invalid or missing var.
 *
 * FLY_REGION (set automatically by Fly.io per machine) is used as a fallback
 * for REGION if REGION is not explicitly set.
 *
 * @param env - Defaults to `process.env`. Override in tests.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): ProbeEnv {
  // FLY_REGION is injected automatically by Fly.io; use as fallback if REGION is absent.
  const merged: NodeJS.ProcessEnv = { REGION: env.FLY_REGION, ...env };
  return EnvSchema.parse(merged);
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the default path to `config/providers.yaml` relative to this
 * source file's location.
 *
 * Layout assumption (monorepo root):
 *   config/providers.yaml
 *   packages/probes/src/config.ts  ← this file
 *
 * Three levels up from `src/` (or `dist/` when compiled) reaches the repo root.
 */
export function resolveDefaultProvidersPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../../config/providers.yaml");
}

/**
 * Read the probe version from the package's `package.json`.
 * Falls back to `"0.0.0"` if the file cannot be read.
 */
export function readProbeVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const raw = fs.readFileSync(
      path.resolve(dir, "../package.json"),
      "utf8",
    );
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
