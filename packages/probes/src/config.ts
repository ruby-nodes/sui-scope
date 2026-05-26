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

import type { GrpcProviderConfig, GraphQLProviderConfig } from "./types.js";

// ─── Providers YAML schema ────────────────────────────────────────────────────

const ProviderEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    grpc: z.string().min(1).optional(),
    graphql: z.string().url().optional(),
  })
  .refine((data) => data.grpc != null || data.graphql != null, {
    message: "Each provider must have at least one of: grpc, graphql",
  });

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderEntrySchema).min(1),
});

/** Parsed and split provider list ready for probe runners. */
export type LoadedProviders = {
  grpc: GrpcProviderConfig[];
  graphql: GraphQLProviderConfig[];
};

/**
 * Read and validate a providers YAML file.
 *
 * @param filePath - Absolute path to the YAML file.
 * @throws If the file cannot be read or fails Zod validation.
 */
export function loadProviders(filePath: string): LoadedProviders {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = ProvidersFileSchema.parse(loadYaml(raw));

  const grpc: GrpcProviderConfig[] = [];
  const graphql: GraphQLProviderConfig[] = [];

  for (const entry of parsed.providers) {
    if (entry.grpc != null) {
      grpc.push({ id: entry.id, endpoint: entry.grpc });
    }
    if (entry.graphql != null) {
      graphql.push({ id: entry.id, endpoint: entry.graphql });
    }
  }

  return { grpc, graphql };
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
});

export type ProbeEnv = z.infer<typeof EnvSchema>;

/**
 * Parse and validate probe environment variables.
 * Throws a Zod error (with a descriptive message) on any invalid or missing var.
 *
 * @param env - Defaults to `process.env`. Override in tests.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): ProbeEnv {
  return EnvSchema.parse(env);
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
