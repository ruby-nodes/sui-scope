import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import { LedgerService, probeGrpc } from "./grpc-probe.js";

// ─── Local test gRPC server ────────────────────────────────────────────────────
//
// We spin up a real (insecure, localhost) gRPC server using the same proto
// definition loaded by grpc-probe.ts. Tests pass grpc.credentials.createInsecure()
// so no TLS handshake is needed. No network access required.

interface ServiceInfoResponse {
  checkpoint_height?: string;
  chain?: string;
  server?: string;
}

type SendUnaryData = grpc.sendUnaryData<ServiceInfoResponse>;
type ServerErrorArg = {
  code: grpc.status;
  message: string;
  name: string;
};

function createTestServer(
  handler: (
    callback: SendUnaryData,
    call: grpc.ServerUnaryCall<unknown, ServiceInfoResponse>,
  ) => void,
): Promise<{ server: grpc.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const srv = new grpc.Server();
    srv.addService(LedgerService.service, {
      getServiceInfo: (
        call: grpc.ServerUnaryCall<unknown, ServiceInfoResponse>,
        callback: SendUnaryData,
      ) => {
        handler(callback, call);
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

describe("probeGrpc — success", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((cb) => {
      cb(null, { checkpoint_height: "500050", chain: "mainnet" });
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns exactly two MeasurementEvents", async () => {
    const events = await probeGrpc(
      { id: "test-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      500100,
      grpc.credentials.createInsecure(),
    );
    expect(events).toHaveLength(2);
  });

  it("latency_ms event has correct structure and is positive", async () => {
    const events = await probeGrpc(
      { id: "acme", endpoint: `127.0.0.1:${port}` },
      "eu-west-1",
      "0.2.0",
      500100,
      grpc.credentials.createInsecure(),
    );
    const ev = events.find((e) => e.metric === "latency_ms");
    expect(ev).toBeDefined();
    expect(ev?.success).toBe(true);
    expect(ev?.error_type).toBeNull();
    expect(ev?.value).toBeGreaterThan(0);
    expect(ev?.provider_id).toBe("acme");
    expect(ev?.region).toBe("eu-west-1");
    expect(ev?.endpoint_type).toBe("grpc");
    expect(ev?.probe_version).toBe("0.2.0");
    expect(typeof ev?.timestamp).toBe("number");
  });

  it("freshness_checkpoints event computes chain_head − provider correctly", async () => {
    const events = await probeGrpc(
      { id: "test-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      500100, // chain head
      grpc.credentials.createInsecure(),
    );
    // provider returned checkpoint_height = "500050", chain head = 500100 → freshness = 50
    const ev = events.find((e) => e.metric === "freshness_checkpoints");
    expect(ev).toBeDefined();
    expect(ev?.success).toBe(true);
    expect(ev?.value).toBe(50);
    expect(ev?.error_type).toBeNull();
  });

  it("freshness is clamped to 0 when provider is ahead of or at chain head", async () => {
    const events = await probeGrpc(
      { id: "test-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      499000, // chain head behind provider (500050) — should clamp to 0
      grpc.credentials.createInsecure(),
    );
    const ev = events.find((e) => e.metric === "freshness_checkpoints");
    expect(ev?.value).toBe(0);
  });

  it("attaches static headers as gRPC metadata", async () => {
    let receivedNetworkHeader: unknown[] = [];
    const { server: headerServer, port: headerPort } = await createTestServer(
      (cb, call) => {
        receivedNetworkHeader = call.metadata.get("x-network");
        cb(null, { checkpoint_height: "500050", chain: "mainnet" });
      },
    );

    const events = await probeGrpc(
      {
        id: "header-provider",
        endpoint: `127.0.0.1:${headerPort}`,
        headers: { "x-network": "sui-mainnet" },
      },
      "us-east-1",
      "0.1.0",
      500100,
      grpc.credentials.createInsecure(),
    );
    headerServer.forceShutdown();

    expect(events[0]?.success).toBe(true);
    expect(receivedNetworkHeader).toEqual(["sui-mainnet"]);
  });
});

// ─── Failure paths ─────────────────────────────────────────────────────────────

describe("probeGrpc — UNAVAILABLE error", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((cb) => {
      const err: ServerErrorArg = {
        code: grpc.status.UNAVAILABLE,
        message: "service unavailable",
        name: "ServiceUnavailable",
      };
      cb(err, null);
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns a single failure event with error_type=connection_refused", async () => {
    const events = await probeGrpc(
      { id: "bad-provider", endpoint: `127.0.0.1:${port}` },
      "us-east-1",
      "0.1.0",
      500100,
      grpc.credentials.createInsecure(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.metric).toBe("latency_ms");
    expect(events[0]?.error_type).toBe("connection_refused");
    expect(events[0]?.value).toBe(0);
  });
});

describe("probeGrpc — DEADLINE_EXCEEDED error", () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((cb) => {
      const err: ServerErrorArg = {
        code: grpc.status.DEADLINE_EXCEEDED,
        message: "deadline exceeded",
        name: "DeadlineExceeded",
      };
      cb(err, null);
    }));
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it("returns a single failure event with error_type=timeout", async () => {
    const events = await probeGrpc(
      { id: "slow-provider", endpoint: `127.0.0.1:${port}` },
      "ap-southeast-1",
      "0.1.0",
      500100,
      grpc.credentials.createInsecure(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.error_type).toBe("timeout");
  });
});
