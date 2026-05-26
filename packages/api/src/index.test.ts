import { beforeEach, describe, expect, it, vi } from "vitest";

import { PACKAGE_NAME, MeasurementEventSchema, createApp } from "./index.js";
import type { ClickHouseClient } from "./index.js";

// ─── Mock ClickHouse client ───────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue({ executed: true, query_id: "test" });
const mockCh = { insert: mockInsert } as unknown as ClickHouseClient;

const TEST_SECRET = "test-secret-abc";

// Valid event fixture
const validEvent = {
  provider_id: "test-provider",
  region: "us-east-1",
  endpoint_type: "grpc",
  metric: "latency_ms",
  value: 42.5,
  success: true,
  error_type: null,
  probe_version: "0.1.0",
  timestamp: 1748224800000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("api", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@sui-scope/api");
  });

  describe("MeasurementEventSchema", () => {
    it("rejects a missing payload", () => {
      const result = MeasurementEventSchema.safeParse({ bad: "payload" });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown endpoint_type", () => {
      const result = MeasurementEventSchema.safeParse({
        ...validEvent,
        endpoint_type: "websocket",
      });
      expect(result.success).toBe(false);
    });

    it("accepts a valid event", () => {
      const result = MeasurementEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });
  });

  describe("POST /ingest", () => {
    beforeEach(() => {
      mockInsert.mockClear();
    });

    it("returns 401 when Authorization header is missing", async () => {
      const app = createApp(mockCh, TEST_SECRET);
      const res = await app.request("/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEvent),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as { code: string };
      expect(json.code).toBe("unauthorized");
    });

    it("returns 401 when the secret is wrong", async () => {
      const app = createApp(mockCh, TEST_SECRET);
      const res = await app.request("/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-secret",
        },
        body: JSON.stringify(validEvent),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when payload fails Zod validation", async () => {
      const app = createApp(mockCh, TEST_SECRET);
      const res = await app.request("/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify({ bad: "payload" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json() as { code: string };
      expect(json.code).toBe("validation_failed");
    });

    it("returns 202 and calls ch.insert for a valid payload", async () => {
      const app = createApp(mockCh, TEST_SECRET);
      const res = await app.request("/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify(validEvent),
      });
      expect(res.status).toBe(202);
      const json = await res.json() as { ok: boolean };
      expect(json.ok).toBe(true);
      expect(mockInsert).toHaveBeenCalledOnce();
    });

    it("does not call ch.insert when auth fails", async () => {
      const app = createApp(mockCh, TEST_SECRET);
      await app.request("/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEvent),
      });
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
