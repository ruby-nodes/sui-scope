import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import { SubscriptionService, startStreamProbe } from "./stream-probe.js";
import type { MeasurementEvent } from "./types.js";

// ─── Test server helper ──────────────────────────────────────────────────────
//
// Spins up a real (insecure, localhost) gRPC server using the same proto
// definition loaded by stream-probe.ts. Tests pass createInsecure() credentials
// so no TLS handshake is required. No external network access needed.

type StreamCall = grpc.ServerWritableStream<
  Record<string, unknown>,
  Record<string, unknown>
>;

function createTestStreamServer(
  handler: (call: StreamCall) => void,
): Promise<{ server: grpc.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const srv = new grpc.Server();
    srv.addService(SubscriptionService.service, {
      subscribeCheckpoints: handler,
    });
    srv.bindAsync(
      "127.0.0.1:0",
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err != null) reject(err);
        else resolve({ server: srv, port });
      },
    );
  });
}

/** Collect emitted events and resolve a promise once a matching event arrives. */
function collectEvents(): {
  events: MeasurementEvent[];
  waitFor: (
    metric: string,
    predicate?: (e: MeasurementEvent) => boolean,
    timeoutMs?: number,
  ) => Promise<MeasurementEvent>;
  emit: (e: MeasurementEvent) => void;
} {
  const events: MeasurementEvent[] = [];
  const waiters: Array<{
    metric: string;
    predicate?: (e: MeasurementEvent) => boolean;
    resolve: (e: MeasurementEvent) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  const emit = (e: MeasurementEvent): void => {
    events.push(e);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w == null) continue;
      if (w.metric === e.metric && (w.predicate == null || w.predicate(e))) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(e);
      }
    }
  };

  const waitFor = (
    metric: string,
    predicate?: (e: MeasurementEvent) => boolean,
    timeoutMs = 3000,
  ): Promise<MeasurementEvent> =>
    new Promise((resolve, reject) => {
      // Check if already collected.
      const existing = events.find(
        (e) => e.metric === metric && (predicate == null || predicate(e)),
      );
      if (existing != null) {
        resolve(existing);
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for metric "${metric}"`));
      }, timeoutMs);
      waiters.push({ metric, predicate, resolve, reject, timer });
    });

  return { events, waitFor, emit };
}

// ─── Tests: stream_checkpoint_gap ───────────────────────────────────────────

describe("startStreamProbe — stream_checkpoint_gap", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    // Server that immediately pushes cursor=100 and stays open.
    ({ server, port } = await createTestStreamServer((call) => {
      call.write({ cursor: "100" });
      // Stream stays open (call is held alive by gRPC framework until end/error).
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("emits stream_checkpoint_gap with gap = chainHead - cursor", async () => {
    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      { id: "test-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(110),
        sampleIntervalMs: 50,
        windowMs: 60_000,
        graceWindowMs: 5_000,
        reconnectDelayMs: 100,
      },
    );

    const event = await waitFor(
      "stream_checkpoint_gap",
      (e) => e.success === true,
    );
    stop();

    expect(event.value).toBe(10); // 110 - 100
    expect(event.success).toBe(true);
    expect(event.error_type).toBeNull();
    expect(event.provider_id).toBe("test-provider");
    expect(event.region).toBe("us-east-1");
    expect(event.endpoint_type).toBe("grpc");
  });

  it("emits a failure event when no stream data has been received yet", async () => {
    // Start a probe against a server that stays open but has not yet sent data.
    // The sample fires before any checkpoint arrives.
    const { server: emptyServer, port: emptyPort } =
      await createTestStreamServer(() => {
        // Intentionally send no messages — stream stays open with no data.
      });

    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      { id: "empty", endpoint: `127.0.0.1:${emptyPort}` },
      "eu-west-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(200),
        sampleIntervalMs: 30,
        windowMs: 60_000,
        graceWindowMs: 5_000,
        reconnectDelayMs: 100,
      },
    );

    const event = await waitFor("stream_checkpoint_gap");
    stop();
    emptyServer.forceShutdown();

    expect(event.success).toBe(false);
    expect(event.error_type).toBe("no_data");
    expect(event.value).toBe(0);
  });

  it("attaches static headers as gRPC stream metadata", async () => {
    let receivedNetworkHeader: unknown[] = [];
    const { server: headerServer, port: headerPort } =
      await createTestStreamServer((call) => {
        receivedNetworkHeader = call.metadata.get("x-network");
        call.write({ cursor: "100" });
      });

    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      {
        id: "stream-header",
        endpoint: `127.0.0.1:${headerPort}`,
        headers: { "x-network": "sui-mainnet" },
      },
      "us-east-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(110),
        sampleIntervalMs: 50,
        windowMs: 60_000,
        graceWindowMs: 5_000,
        reconnectDelayMs: 100,
      },
    );

    const event = await waitFor(
      "stream_checkpoint_gap",
      (e) => e.success === true,
    );
    stop();
    headerServer.forceShutdown();

    expect(event.value).toBe(10);
    expect(receivedNetworkHeader).toEqual(["sui-mainnet"]);
  });
});

// ─── Tests: window metrics (stream_uptime_pct, stream_disconnects_per_hour) ──

describe("startStreamProbe — window metrics", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestStreamServer((call) => {
      call.write({ cursor: "500" });
      // Stream stays open.
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("emits stream_uptime_pct > 0 and stream_disconnects_per_hour = 0 at window end", async () => {
    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      { id: "window-test", endpoint: `127.0.0.1:${port}` },
      "ap-southeast-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(600),
        sampleIntervalMs: 60_000,
        windowMs: 100, // 100 ms window — fires quickly
        graceWindowMs: 5_000,
        reconnectDelayMs: 100,
      },
    );

    const [uptimeEvent, disconnectsEvent] = await Promise.all([
      waitFor("stream_uptime_pct"),
      waitFor("stream_disconnects_per_hour"),
    ]);
    stop();

    expect(uptimeEvent.value).toBeGreaterThan(0);
    expect(uptimeEvent.value).toBeLessThanOrEqual(100);
    expect(uptimeEvent.success).toBe(true);
    expect(disconnectsEvent.value).toBe(0);
    expect(disconnectsEvent.success).toBe(true);
  });
});

// ─── Tests: disconnect counting ──────────────────────────────────────────────

describe("startStreamProbe — disconnect counting", () => {
  it("counts each disconnect when graceWindowMs is 0", async () => {
    // Server that immediately ends each stream connection.
    const { server, port } = await createTestStreamServer((call) => {
      call.end();
    });

    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      { id: "drop-test", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(0),
        sampleIntervalMs: 60_000,
        windowMs: 200, // 200 ms window
        graceWindowMs: 0, // no de-bounce — every disconnect counted
        reconnectDelayMs: 10,
      },
    );

    const event = await waitFor("stream_disconnects_per_hour");
    stop();
    server.forceShutdown();

    // Multiple rapid reconnects within 200 ms → disconnect count > 1
    expect(event.value).toBeGreaterThan(1);
    expect(event.success).toBe(true);
  });

  it("collapses rapid disconnects within graceWindowMs into one event", async () => {
    // Server that immediately ends each stream connection.
    const { server, port } = await createTestStreamServer((call) => {
      call.end();
    });

    const { waitFor, emit } = collectEvents();

    const stop = startStreamProbe(
      { id: "grace-test", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      {
        emit,
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(0),
        sampleIntervalMs: 60_000,
        windowMs: 300,  // 300 ms window
        graceWindowMs: 1000, // 1 s grace — all disconnects within window collapse to 1
        reconnectDelayMs: 10,
      },
    );

    const event = await waitFor("stream_disconnects_per_hour");
    stop();
    server.forceShutdown();

    // All reconnects happen within 1 s grace window → only 1 counted disconnect
    expect(event.value).toBe(1);
    expect(event.success).toBe(true);
  });

  it("does not count the disconnect triggered by stop()", async () => {
    const { server, port } = await createTestStreamServer((call) => {
      call.write({ cursor: "999" });
      // Stay open.
    });

    const events: MeasurementEvent[] = [];

    const stop = startStreamProbe(
      { id: "stop-test", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      {
        emit: (e) => events.push(e),
        credentials: grpc.credentials.createInsecure(),
        fetchChainHead: () => Promise.resolve(1000),
        sampleIntervalMs: 60_000,
        windowMs: 60_000,
        graceWindowMs: 5_000,
        reconnectDelayMs: 100,
      },
    );

    // Allow connection to establish, then stop.
    await new Promise<void>((r) => setTimeout(r, 50));
    stop();
    server.forceShutdown();

    // No window events were emitted (window is 60 s) and no unplanned disconnects.
    const disconnectEvents = events.filter(
      (e) => e.metric === "stream_disconnects_per_hour",
    );
    expect(disconnectEvents).toHaveLength(0);
  });
});
