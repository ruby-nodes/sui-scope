import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as http from "node:http";
import { probeGraphQL } from "./graphql-probe.js";

// ─── Local test HTTP server ────────────────────────────────────────────────────
//
// We spin up a real (plain HTTP, localhost) server for each test suite.
// Tests use http:// endpoints to avoid TLS certificate complexity in CI.
// No external network access required.

function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr == null || typeof addr === "string") {
        reject(new Error("Unexpected server address type"));
        return;
      }
      resolve({ server: srv, port: addr.port });
    });
    srv.on("error", reject);
  });
}

// ─── Success path ──────────────────────────────────────────────────────────────

describe("probeGraphQL — success", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_req, res) => {
      const body = JSON.stringify({
        data: { checkpoint: { sequenceNumber: 500050 } },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    }));
  });

  afterAll(() => {
    server.close();
  });

  it("returns exactly two MeasurementEvents", async () => {
    const events = await probeGraphQL(
      { id: "test-provider", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      500100,
    );
    expect(events).toHaveLength(2);
  });

  it("latency_ms event has correct structure and is non-negative", async () => {
    const events = await probeGraphQL(
      { id: "acme", endpoint: `http://127.0.0.1:${port}/graphql` },
      "eu-west-1",
      "0.2.0",
      500100,
    );
    const ev = events.find((e) => e.metric === "latency_ms");
    expect(ev).toBeDefined();
    expect(ev?.endpoint_type).toBe("graphql");
    expect(ev?.success).toBe(true);
    expect(ev?.error_type).toBeNull();
    expect(ev?.value).toBeGreaterThanOrEqual(0);
    expect(ev?.provider_id).toBe("acme");
    expect(ev?.region).toBe("eu-west-1");
    expect(ev?.probe_version).toBe("0.2.0");
    expect(typeof ev?.timestamp).toBe("number");
  });

  it("freshness_checkpoints event computes chain_head − sequenceNumber", async () => {
    const events = await probeGraphQL(
      { id: "test-provider", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      500100, // chain head
    );
    // provider returned sequenceNumber = 500050, chain head = 500100 → freshness = 50
    const ev = events.find((e) => e.metric === "freshness_checkpoints");
    expect(ev).toBeDefined();
    expect(ev?.value).toBe(50);
    expect(ev?.success).toBe(true);
    expect(ev?.error_type).toBeNull();
  });

  it("clamps freshness to 0 when provider is ahead of chain head", async () => {
    const events = await probeGraphQL(
      { id: "fast-provider", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      499000, // chain head behind provider (500050)
    );
    const ev = events.find((e) => e.metric === "freshness_checkpoints");
    expect(ev?.value).toBe(0);
  });
});

// ─── GraphQL errors array ──────────────────────────────────────────────────────

describe("probeGraphQL — GraphQL errors array", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_req, res) => {
      const body = JSON.stringify({
        errors: [{ message: "Internal server error" }],
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    }));
  });

  afterAll(() => {
    server.close();
  });

  it("returns one failure event with error_type=invalid_response", async () => {
    const events = await probeGraphQL(
      { id: "erroring", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      500000,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.error_type).toBe("invalid_response");
    expect(events[0]?.metric).toBe("latency_ms");
  });
});

// ─── HTTP 5xx path ─────────────────────────────────────────────────────────────

describe("probeGraphQL — HTTP 500", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_req, res) => {
      res.writeHead(500);
      res.end("Internal Server Error");
    }));
  });

  afterAll(() => {
    server.close();
  });

  it("returns one failure event with success: false and error_type=invalid_response", async () => {
    const events = await probeGraphQL(
      { id: "down", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      500000,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.error_type).toBe("invalid_response");
  });
});

// ─── Connection refused path ───────────────────────────────────────────────────

describe("probeGraphQL — connection refused", () => {
  let closedPort: number;

  beforeAll(async () => {
    // Bind a server to get a valid port, then close it — the port is now not listening.
    const { server, port } = await createTestServer((_req, res) => {
      res.end();
    });
    closedPort = port;
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it("returns one failure event with error_type=connection_refused", async () => {
    const events = await probeGraphQL(
      { id: "gone", endpoint: `http://127.0.0.1:${closedPort}/graphql` },
      "us-east-1",
      "0.1.0",
      500000,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.error_type).toBe("connection_refused");
  });
});

// ─── Invalid JSON path ─────────────────────────────────────────────────────────

describe("probeGraphQL — invalid JSON response", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("this is not json");
    }));
  });

  afterAll(() => {
    server.close();
  });

  it("returns one failure event with error_type=invalid_response", async () => {
    const events = await probeGraphQL(
      { id: "broken", endpoint: `http://127.0.0.1:${port}/graphql` },
      "us-east-1",
      "0.1.0",
      500000,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.success).toBe(false);
    expect(events[0]?.error_type).toBe("invalid_response");
  });
});
