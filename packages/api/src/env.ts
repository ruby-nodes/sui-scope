import { z } from "zod";

// ─── Environment schema ───────────────────────────────────────────────────────

const EnvSchema = z.object({
  /** ClickHouse server URL, e.g. http://localhost:8123 */
  CLICKHOUSE_URL: z.string().url(),
  /** ClickHouse database name. Defaults to "suiscope". */
  CLICKHOUSE_DATABASE: z.string().default("suiscope"),
  /** ClickHouse username. Defaults to "default". */
  CLICKHOUSE_USERNAME: z.string().default("default"),
  /** ClickHouse password. May be empty string for local no-auth setups. */
  CLICKHOUSE_PASSWORD: z.string(),
  /** Shared secret that probe agents must send as `Authorization: Bearer <token>`. */
  INGEST_SECRET: z.string().min(1),
  /** HTTP port for the API server. Defaults to 3000. */
  PORT: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return 3000;
      const n = Number.parseInt(val, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`PORT must be a positive integer, got "${val}"`);
      }
      return n;
    }),
  /**
   * Filesystem path to config/providers.yaml.
   * Relative paths are resolved from the process working directory.
   * Defaults to "config/providers.yaml" (correct when starting from repo root).
   */
  PROVIDERS_CONFIG_PATH: z.string().default("config/providers.yaml"),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

/**
 * Parse and validate API environment variables.
 * Throws with a descriptive message on any missing or invalid variable.
 *
 * @param env - Defaults to `process.env`. Override in tests.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return result.data;
}
