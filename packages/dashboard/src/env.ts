import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  /**
   * Base URL of the SuiScope API server.
   * Used in Next.js server components to fetch metrics data.
   * Example: http://localhost:3000  or  https://api.suiscope.xyz
   */
  NEXT_PUBLIC_API_URL: z.string().url(),
});

export type DashboardEnv = z.infer<typeof EnvSchema>;

/**
 * Parse and validate dashboard environment variables.
 * Called from next.config.ts so the build / server fails fast on bad config.
 *
 * @param env - Defaults to `process.env`. Override in tests.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): DashboardEnv {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return result.data;
}
