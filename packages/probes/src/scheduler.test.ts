import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runOneCycle, startScheduler } from "./scheduler.js";
import type { MeasurementEvent } from "./types.js";
import type { SchedulerConfig } from "./scheduler.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_CONFIG: SchedulerConfig = {
  grpcProviders: [{ id: "test-grpc", endpoint: "grpc.example.com:443" }],
  graphqlProviders: [
    { id: "test-gql", endpoint: "https://gql.example.com/graphql" },
  ],
  archivalProviders: [],
  region: "us-east-1",
  probeVersion: "0.1.0",
  intervalMs: 60_000,
  archivalIntervalMs: 300_000,
};

function makeSuccessEvent(
  providerId: string,
  type: "grpc" | "graphql" | "archival",
): MeasurementEvent {
  return {
    provider_id: providerId,
    region: "us-east-1",
    endpoint_type: type,
    metric: "latency_ms",
    value: 42,
    success: true,
    error_type: null,
    probe_version: "0.1.0",
    timestamp: Date.now(),
  };
}

// ─── runOneCycle ──────────────────────────────────────────────────────────────

describe("runOneCycle", () => {
  it("calls fetchChainHead once per cycle", async () => {
    const fetchChainHead = vi.fn().mockResolvedValue(1000);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    await runOneCycle(BASE_CONFIG, { fetchChainHead, probeGrpc, probeGraphQL });

    expect(fetchChainHead).toHaveBeenCalledTimes(1);
  });

  it("passes chain head to all probe functions", async () => {
    const chainHead = 9999;
    const fetchChainHead = vi.fn().mockResolvedValue(chainHead);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    await runOneCycle(BASE_CONFIG, { fetchChainHead, probeGrpc, probeGraphQL });

    // Both probe functions receive the chain head as their 4th argument.
    expect(probeGrpc).toHaveBeenCalledWith(
      BASE_CONFIG.grpcProviders[0],
      BASE_CONFIG.region,
      BASE_CONFIG.probeVersion,
      chainHead,
    );
    expect(probeGraphQL).toHaveBeenCalledWith(
      BASE_CONFIG.graphqlProviders[0],
      BASE_CONFIG.region,
      BASE_CONFIG.probeVersion,
      chainHead,
    );
  });

  it("calls probeGrpc once per gRPC provider", async () => {
    const config: SchedulerConfig = {
      ...BASE_CONFIG,
      grpcProviders: [
        { id: "g1", endpoint: "g1.example.com:443" },
        { id: "g2", endpoint: "g2.example.com:443" },
      ],
      graphqlProviders: [],
    };

    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);

    await runOneCycle(config, { fetchChainHead, probeGrpc });

    expect(probeGrpc).toHaveBeenCalledTimes(2);
  });

  it("calls probeGraphQL once per GraphQL provider", async () => {
    const config: SchedulerConfig = {
      ...BASE_CONFIG,
      grpcProviders: [],
      graphqlProviders: [
        { id: "q1", endpoint: "https://q1.example.com/graphql" },
        { id: "q2", endpoint: "https://q2.example.com/graphql" },
        { id: "q3", endpoint: "https://q3.example.com/graphql" },
      ],
    };

    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    await runOneCycle(config, { fetchChainHead, probeGraphQL });

    expect(probeGraphQL).toHaveBeenCalledTimes(3);
  });

  it("emits all events returned by probe functions", async () => {
    const grpcEvent = makeSuccessEvent("test-grpc", "grpc");
    const gqlEvent = makeSuccessEvent("test-gql", "graphql");

    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([grpcEvent]);
    const probeGraphQL = vi.fn().mockResolvedValue([gqlEvent]);
    const emit = vi.fn();

    await runOneCycle(BASE_CONFIG, {
      fetchChainHead,
      probeGrpc,
      probeGraphQL,
      emit,
    });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(grpcEvent);
    expect(emit).toHaveBeenCalledWith(gqlEvent);
  });

  it("does not throw when a provider probe rejects unexpectedly", async () => {
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockRejectedValue(new Error("unexpected"));
    const probeGraphQL = vi.fn().mockResolvedValue([]);
    const emit = vi.fn();

    // Should resolve without throwing even if probeGrpc rejects.
    await expect(
      runOneCycle(BASE_CONFIG, {
        fetchChainHead,
        probeGrpc,
        probeGraphQL,
        emit,
      }),
    ).resolves.toBeUndefined();
  });

  it("emits events from successful providers even if one fails", async () => {
    const config: SchedulerConfig = {
      ...BASE_CONFIG,
      grpcProviders: [
        { id: "good", endpoint: "good.example.com:443" },
        { id: "bad", endpoint: "bad.example.com:443" },
      ],
    };

    const goodEvent = makeSuccessEvent("good", "grpc");
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi
      .fn()
      .mockResolvedValueOnce([goodEvent]) // "good" succeeds
      .mockRejectedValueOnce(new Error("network error")); // "bad" fails
    const probeGraphQL = vi.fn().mockResolvedValue([]);
    const emit = vi.fn();

    await runOneCycle(config, { fetchChainHead, probeGrpc, probeGraphQL, emit });

    expect(emit).toHaveBeenCalledWith(goodEvent);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("skips archival probes when includeArchival is false", async () => {
    const config: SchedulerConfig = {
      ...BASE_CONFIG,
      archivalProviders: [{ id: "archive", endpoint: "archive.example.com:443" }],
    };
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);
    const probeArchival = vi.fn().mockResolvedValue([]);

    await runOneCycle(
      config,
      { fetchChainHead, probeGrpc, probeGraphQL, probeArchival },
      { includeArchival: false },
    );

    expect(probeArchival).not.toHaveBeenCalled();
  });
});

// ─── startScheduler ───────────────────────────────────────────────────────────

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs first cycle immediately (before first interval tick)", async () => {
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    const handle = startScheduler(BASE_CONFIG, {
      fetchChainHead,
      probeGrpc,
      probeGraphQL,
    });

    // Flush the first cycle's async work (timers at 0 flushes pending microtasks).
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchChainHead).toHaveBeenCalledTimes(1);
    clearInterval(handle);
  });

  it("runs additional cycles on interval", async () => {
    const config: SchedulerConfig = { ...BASE_CONFIG, intervalMs: 1000 };
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    const handle = startScheduler(config, {
      fetchChainHead,
      probeGrpc,
      probeGraphQL,
    });

    // Advance 2 500 ms: flushes the immediate first cycle + 2 interval ticks.
    await vi.advanceTimersByTimeAsync(2500);

    // 1 immediate + 2 interval ticks = 3 total
    expect(fetchChainHead).toHaveBeenCalledTimes(3);
    clearInterval(handle);
  });

  it("runs archival providers on their own interval", async () => {
    const config: SchedulerConfig = {
      ...BASE_CONFIG,
      archivalProviders: [{ id: "archive", endpoint: "archive.example.com:443" }],
      intervalMs: 1000,
      archivalIntervalMs: 3000,
    };
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);
    const probeArchival = vi.fn().mockResolvedValue([]);

    const handle = startScheduler(config, {
      fetchChainHead,
      probeGrpc,
      probeGraphQL,
      probeArchival,
    });

    await vi.advanceTimersByTimeAsync(2500);

    expect(probeGrpc).toHaveBeenCalledTimes(3);
    expect(probeGraphQL).toHaveBeenCalledTimes(3);
    expect(probeArchival).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(probeGrpc).toHaveBeenCalledTimes(4);
    expect(probeGraphQL).toHaveBeenCalledTimes(4);
    expect(probeArchival).toHaveBeenCalledTimes(2);
    clearInterval(handle);
  });

  it("returns a clearable interval handle", () => {
    const fetchChainHead = vi.fn().mockResolvedValue(0);
    const probeGrpc = vi.fn().mockResolvedValue([]);
    const probeGraphQL = vi.fn().mockResolvedValue([]);

    const handle = startScheduler(BASE_CONFIG, {
      fetchChainHead,
      probeGrpc,
      probeGraphQL,
    });

    expect(handle).toBeDefined();
    clearInterval(handle); // must not throw
  });
});
