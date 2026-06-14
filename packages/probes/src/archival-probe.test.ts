import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import { ArchivalLedgerService, probeArchival } from "./archival-probe.js";

// ─── Local test gRPC server ────────────────────────────────────────────────────
//
// We spin up a real (insecure, localhost) gRPC server using the same proto
// definition. Tests pass grpc.credentials.createInsecure() — no TLS, no
// network access required.

interface CheckpointResponse {
  checkpoint?: { sequence_number?: string };
}

type SendUnaryData = grpc.sendUnaryData<CheckpointResponse>;

function createTestServer(
  handler: (call: grpc.ServerUnaryCall<unknown, CheckpointResponse>, callback: SendUnaryData) => void,
): Promise<{ server: grpc.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const srv = new grpc.Server();
    srv.addService(ArchivalLedgerService.service, {
      getCheckpoint: handler,
      // Satisfy the service descriptor — unused by tests.
      getServiceInfo: (_call: unknown, cb: grpc.sendUnaryData<Record<string, unknown>>) => {
        cb(null, {});
      },
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

// ─── Success path ──────────────────────────────────────────────────────────────

describe("probeArchival — success", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_call, cb) => {
      cb(null, { checkpoint: { sequence_number: "3000000" } });
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns exactly one MeasurementEvent", async () => {
    const events = await probeArchival(
      { id: "archival-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      5_592_000,
      grpc.credentials.createInsecure(),
    );
    expect(events).toHaveLength(1);
  });

  it("latency_ms event has correct structure and is positive", async () => {
    const events = await probeArchival(
      { id: "acme-archival", endpoint: `127.0.0.1:${port}` },
      "eu-west-1",
      "0.2.0",
      5_592_000,
      grpc.credentials.createInsecure(),
    );
    const ev = events[0]!;
    expect(ev.success).toBe(true);
    expect(ev.error_type).toBeNull();
    expect(ev.value).toBeGreaterThan(0);
    expect(ev.provider_id).toBe("acme-archival");
    expect(ev.region).toBe("eu-west-1");
    expect(ev.endpoint_type).toBe("archival");
    expect(ev.probe_version).toBe("0.2.0");
    expect(typeof ev.timestamp).toBe("number");
  });

  it("does not emit a freshness_checkpoints metric", async () => {
    const events = await probeArchival(
      { id: "archival-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      5_592_000,
      grpc.credentials.createInsecure(),
    );
    expect(events.every((e) => e.metric !== "freshness_checkpoints")).toBe(true);
  });
});

// ─── Failure path ─────────────────────────────────────────────────────────────

describe("probeArchival — NOT_FOUND (archival lacks requested depth)", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_call, cb) => {
      cb({ code: grpc.status.NOT_FOUND, message: "checkpoint not found", name: "NOT_FOUND" }, null);
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns a failure event with error_type not_found", async () => {
    const events = await probeArchival(
      { id: "shallow-archival", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      5_592_000,
      grpc.credentials.createInsecure(),
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.success).toBe(false);
    expect(ev.error_type).toBe("not_found");
    expect(ev.value).toBe(0);
    expect(ev.endpoint_type).toBe("archival");
  });
});

describe("probeArchival — UNAVAILABLE", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_call, cb) => {
      cb({ code: grpc.status.UNAVAILABLE, message: "unavailable", name: "UNAVAILABLE" }, null);
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns a failure event with error_type connection_refused", async () => {
    const events = await probeArchival(
      { id: "down-archival", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      5_592_000,
      grpc.credentials.createInsecure(),
    );
    expect(events[0]!.success).toBe(false);
    expect(events[0]!.error_type).toBe("connection_refused");
  });
});
