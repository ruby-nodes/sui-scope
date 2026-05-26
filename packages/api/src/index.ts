import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { createClickHouseClient } from "./db/client.js";
import { loadEnv } from "./env.js";
import { handleIngest } from "./ingest.js";

export const PACKAGE_NAME = "@sui-scope/api";

export type { ApiEnv } from "./env.js";
export { loadEnv } from "./env.js";
export { MeasurementEventSchema } from "./ingest.js";
export type { ValidatedMeasurementEvent } from "./ingest.js";
export { createClickHouseClient } from "./db/client.js";
export type { ClickHouseClient } from "./db/client.js";

// ─── App factory ─────────────────────────────────────────────────────────────

export function createApp(
  ch: ReturnType<typeof createClickHouseClient>,
  ingestSecret: string,
): Hono {
  const app = new Hono();
  app.post("/ingest", (c) => handleIngest(c, ch, ingestSecret));
  return app;
}

// ─── Daemon entry point ───────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = loadEnv();
  const ch = createClickHouseClient(env);
  const app = createApp(ch, env.INGEST_SECRET);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.error(`[api] listening on port ${info.port}`);
  });
}
