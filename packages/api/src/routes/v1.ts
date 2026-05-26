import { Hono } from "hono";

import type { ClickHouseClient } from "../db/client.js";
import type { Provider } from "../providers.js";
import {
  VALID_WINDOWS,
  queryLatestMetrics,
  queryProviderTimeSeries,
} from "../queries.js";
import type { TimeWindow } from "../queries.js";

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the Hono router for all public /v1/* endpoints.
 *
 * @param ch        - ClickHouse client.
 * @param providers - Provider list loaded from providers.yaml at startup.
 */
export function createV1Router(
  ch: ClickHouseClient,
  providers: Provider[],
): Hono {
  const app = new Hono();
  const providerIds = new Set(providers.map((p) => p.id));

  // ── GET /v1/providers ─────────────────────────────────────────────────────

  app.get("/providers", (c) => {
    return c.json({ providers });
  });

  // ── GET /v1/metrics ───────────────────────────────────────────────────────

  app.get("/metrics", async (c) => {
    let rows;
    try {
      rows = await queryLatestMetrics(ch);
    } catch (err) {
      console.error("[api] /v1/metrics query error:", err);
      return c.json(
        { code: "internal_error", message: "Failed to query metrics" },
        503,
      );
    }

    // Enrich each row with provider_name from the provider list.
    const named = rows.map((r) => ({
      ...r,
      provider_name:
        providers.find((p) => p.id === r.provider_id)?.name ?? r.provider_id,
    }));

    return c.json({ metrics: named, generated_at: Date.now() });
  });

  // ── GET /v1/metrics/:id ───────────────────────────────────────────────────

  app.get("/metrics/:id", async (c) => {
    const id = c.req.param("id");

    if (!providerIds.has(id)) {
      return c.json(
        { code: "not_found", message: `Provider "${id}" not found` },
        404,
      );
    }

    const rawWindow = c.req.query("window") ?? "24h";
    if (!(VALID_WINDOWS as string[]).includes(rawWindow)) {
      return c.json(
        {
          code: "bad_request",
          message: `Invalid window "${rawWindow}". Valid values: ${VALID_WINDOWS.join(", ")}`,
        },
        400,
      );
    }
    const window = rawWindow as TimeWindow;

    let data;
    try {
      data = await queryProviderTimeSeries(ch, id, window);
    } catch (err) {
      console.error(`[api] /v1/metrics/${id} query error:`, err);
      return c.json(
        { code: "internal_error", message: "Failed to query time series" },
        503,
      );
    }

    return c.json({
      ...data,
      provider_name:
        providers.find((p) => p.id === id)?.name ?? id,
    });
  });

  return app;
}
