import { beforeEach, describe, expect, it, vi } from "vitest";

import { PACKAGE_NAME, MeasurementEventSchema, createApp } from "./index.js";
import type { ClickHouseClient } from "./index.js";
import type { Provider } from "./providers.js";

// ─── Mock ClickHouse client ───────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue({ executed: true, query_id: "test" });
// Default query mock returns empty rows; individual tests override as needed.
const mockQuery = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
const mockCh = { insert: mockInsert, query: mockQuery } as unknown as ClickHouseClient;

const TEST_SECRET = "test-secret-abc";

const TEST_PROVIDERS: Provider[] = [
  { id: "test-provider", name: "Test Provider", grpc: "example.com:443", public: true },
  { id: "other-provider", name: "Other Provider", graphql: "https://other.example.com/graphql", public: true },
];

// Valid ingest event fixture
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
      mockQuery.mockClear();
    });

    it("returns 401 when Authorization header is missing", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
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
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
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
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
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
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
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
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      await app.request("/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEvent),
      });
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("GET /v1/providers", () => {
    it("returns the provider list", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/providers");
      expect(res.status).toBe(200);
      const json = await res.json() as { providers: Provider[] };
      expect(json.providers).toHaveLength(2);
      expect(json.providers[0]?.id).toBe("test-provider");
    });
  });

  describe("GET /v1/metrics", () => {
    it("returns enriched metric rows from ClickHouse", async () => {
      const mockLatRow = {
        provider_id: "test-provider",
        region: "us-east-1",
        endpoint_type: "grpc",
        latency_p50: 42,
        latency_p90: 80,
        latency_p99: 150,
        total_1h: "100",
        success_1h: "98",
      };
      // query is called 3 times (latency, error_rate, freshness)
      mockQuery
        .mockResolvedValueOnce({ json: () => Promise.resolve([mockLatRow]) })
        .mockResolvedValueOnce({
          json: () => Promise.resolve([
            { provider_id: "test-provider", region: "us-east-1", endpoint_type: "grpc", total_5m: "10", success_5m: "9" },
          ]),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve([
            { provider_id: "test-provider", region: "us-east-1", endpoint_type: "grpc", freshness_avg: 2 },
          ]),
        });

      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/metrics");
      expect(res.status).toBe(200);

      const json = await res.json() as { metrics: Array<{ provider_id: string; provider_name: string; uptime: number | null }> };
      expect(json.metrics).toHaveLength(1);
      expect(json.metrics[0]?.provider_name).toBe("Test Provider");
      expect(json.metrics[0]?.uptime).toBeCloseTo(0.98);
    });
  });

  describe("GET /v1/metrics/:id", () => {
    beforeEach(() => {
      mockQuery.mockReset();
      // Default: return empty series
      mockQuery.mockResolvedValue({ json: () => Promise.resolve([]) });
    });

    it("returns 404 for an unknown provider", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/metrics/no-such-provider");
      expect(res.status).toBe(404);
      const json = await res.json() as { code: string };
      expect(json.code).toBe("not_found");
    });

    it("returns 400 for an invalid window", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/metrics/test-provider?window=99d");
      expect(res.status).toBe(400);
      const json = await res.json() as { code: string };
      expect(json.code).toBe("bad_request");
    });

    it("returns a time-series response for a known provider", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/metrics/test-provider?window=24h");
      expect(res.status).toBe(200);
      const json = await res.json() as { provider_id: string; window: string; series: unknown[] };
      expect(json.provider_id).toBe("test-provider");
      expect(json.window).toBe("24h");
      expect(Array.isArray(json.series)).toBe(true);
    });

    it("defaults to window=24h when not specified", async () => {
      const app = createApp(mockCh, TEST_SECRET, TEST_PROVIDERS);
      const res = await app.request("/v1/metrics/test-provider");
      expect(res.status).toBe(200);
      const json = await res.json() as { window: string };
      expect(json.window).toBe("24h");
    });
  });
});

