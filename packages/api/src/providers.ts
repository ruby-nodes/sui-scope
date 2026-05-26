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
});

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
