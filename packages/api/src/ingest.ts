import type { Context } from "hono";
import { z } from "zod";

import type { ClickHouseClient } from "./db/client.js";

// ─── Payload schema ───────────────────────────────────────────────────────────

/**
 * Zod schema for a single measurement event posted by a probe agent.
 * Mirrors the canonical MeasurementEvent type in packages/probes/src/types.ts.
 * Duplicated here so packages/api has no dependency on packages/probes.
 */
export const MeasurementEventSchema = z.object({
  provider_id: z.string().min(1),
  region: z.string().min(1),
  endpoint_type: z.enum(["grpc", "graphql", "archival"]),
  metric: z.enum([
    "latency_ms",
    "freshness_checkpoints",
    "stream_checkpoint_gap",
  ]),
  value: z.number().finite(),
  success: z.boolean(),
  error_type: z.string().nullable(),
  probe_version: z.string().min(1),
  /** Unix timestamp in milliseconds. */
  timestamp: z.number().int().positive(),
});

export type ValidatedMeasurementEvent = z.infer<typeof MeasurementEventSchema>;

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * POST /ingest handler.
 *
 * Auth: expects `Authorization: Bearer <INGEST_SECRET>`.
 * Body: a single MeasurementEvent as JSON.
 * On success: 202 { ok: true }.
 * On error: 400 or 401 with structured { code, message } — never raw Error.message.
 */
export async function handleIngest(
  c: Context,
  ch: ClickHouseClient,
  ingestSecret: string,
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${ingestSecret}`) {
    return c.json(
      { code: "unauthorized", message: "Invalid or missing Authorization header" },
      401,
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ code: "bad_request", message: "Request body must be valid JSON" }, 400);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const result = MeasurementEventSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        code: "validation_failed",
        message: "Payload validation failed",
        issues: result.error.issues,
      },
      400,
    );
  }

  // ── Write to ClickHouse ───────────────────────────────────────────────────
  // timestamp is unix ms; DateTime64(3) stores millisecond-precision unix epoch,
  // so the raw number maps directly to the column scale (1 unit = 1 ms).
  try {
    await ch.insert({
      table: "measurements",
      values: [result.data as Record<string, unknown>],
      format: "JSONEachRow",
    });
  } catch (err) {
    console.error("[ingest] ClickHouse insert failed:", err);
    return c.json(
      { code: "internal_error", message: "Failed to write measurement" },
      503,
    );
  }

  return c.json({ ok: true }, 202);
}
