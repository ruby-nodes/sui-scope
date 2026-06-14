import { Hono } from "hono";

import type { ClickHouseClient } from "../db/client.js";
import type { Provider } from "../providers.js";
import { toProviderApiResponse } from "../providers.js";
import {
  VALID_WINDOWS,
  queryLatestMetrics,
  queryProviderTimeSeries,
} from "../queries.js";
import type { MetricRow, TimeWindow } from "../queries.js";

// ─── Simple in-memory cache ───────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function makeCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  return {
    async get(fn: () => Promise<T>): Promise<T> {
      const now = Date.now();
      if (entry !== null && now < entry.expiresAt) return entry.value;

      // Deduplicate concurrent requests: if a fetch is already in flight,
      // wait for it rather than launching a second parallel query.
      if (inflight !== null) return inflight;

      inflight = fn().then((value) => {
        entry = { value, expiresAt: Date.now() + ttlMs };
        inflight = null;
        return value;
      }).catch((err) => {
        inflight = null;
        throw err;
      });

      return inflight;
    },
  };
}

const metricsCache = makeCache<MetricRow[]>(60_000); // 60 s TTL

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
    return c.json({ providers: toProviderApiResponse(providers) });
  });

  // ── GET /v1/metrics ───────────────────────────────────────────────────────

  app.get("/metrics", async (c) => {
    let rows;
    try {
      rows = await metricsCache.get(() => queryLatestMetrics(ch));
    } catch (err) {
      console.error("[api] /v1/metrics query error:", err);
      return c.json(
        { code: "internal_error", message: "Failed to query metrics" },
        503,
      );
    }

    // Enrich each row with provider_name and is_public from the provider list.
    const named = rows.map((r) => {
      const provider = providers.find((p) => p.id === r.provider_id);
      return {
        ...r,
        provider_name: provider?.name ?? r.provider_id,
        is_public: provider?.public ?? true,
      };
    });

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
