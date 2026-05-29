import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";

import { createClickHouseClient } from "./db/client.js";
import { loadEnv } from "./env.js";
import { handleIngest } from "./ingest.js";
import { loadProviders } from "./providers.js";
import { createV1Router } from "./routes/v1.js";
import type { Provider } from "./providers.js";

export const PACKAGE_NAME = "@sui-scope/api";

export type { ApiEnv } from "./env.js";
export { loadEnv } from "./env.js";
export { MeasurementEventSchema } from "./ingest.js";
export type { ValidatedMeasurementEvent } from "./ingest.js";
export { createClickHouseClient } from "./db/client.js";
export type { ClickHouseClient } from "./db/client.js";
export { loadProviders } from "./providers.js";
export type { Provider } from "./providers.js";

// ─── Rate limiter ─────────────────────────────────────────────────────────────

/**
 * 60 requests per 60 s per IP for all public /v1/* routes.
 * Key: real client IP — prefer Fly-Client-IP (set by Fly.io proxy),
 * then X-Forwarded-For first hop, then X-Real-IP, then fallback.
 */
const v1RateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const flyIp = c.req.header("fly-client-ip");
    if (flyIp) return flyIp;
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return c.req.header("x-real-ip") ?? "unknown";
  },
});

// ─── App factory ─────────────────────────────────────────────────────────────

export function createApp(
  ch: ReturnType<typeof createClickHouseClient>,
  ingestSecret: string,
  providers: Provider[],
): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/ingest", (c) => handleIngest(c, ch, ingestSecret));

  // CORS — allow any browser origin to read public /v1/* endpoints
  app.use("/v1/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

  // Public read API — rate-limited
  app.use("/v1/*", v1RateLimiter);
  app.route("/v1", createV1Router(ch, providers));

  return app;
}

// ─── Daemon entry point ───────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = loadEnv();
  const ch = createClickHouseClient(env);
  const providers = loadProviders(env.PROVIDERS_CONFIG_PATH);
  const app = createApp(ch, env.INGEST_SECRET, providers);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.error(
      `[api] listening on port ${info.port} with ${providers.length} provider(s)`,
    );
  });
}

