/**
 * GraphQL probe runner for Sui GraphQL endpoints.
 *
 * Measures:
 *   - latency_ms            : cold TCP+TLS connect + POST + time-to-first-response-byte
 *                             (DNS pre-resolved, excluded from measurement)
 *   - freshness_checkpoints : chain_head − provider.sequenceNumber
 *
 * Each call to probeGraphQL() opens a brand-new connection (agent: false) —
 * no socket reuse between probe cycles, as required by architecture.md.
 */

import * as dns from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

import type { GraphQLProviderConfig, MeasurementEvent, ProviderToken } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 10_000;

/** Pre-serialised request body — identical for every probe cycle. */
const GRAPHQL_QUERY_BODY = Buffer.from(
  JSON.stringify({ query: "{ checkpoint { sequenceNumber } }" }),
  "utf8",
);

// ─── Internal types ───────────────────────────────────────────────────────────

interface CheckpointGraphQLResponse {
  data?: { checkpoint?: { sequenceNumber?: string | number } | null } | null;
  errors?: Array<{ message: string }>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function classifyError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "timeout";
    if (code === "ECONNREFUSED") return "connection_refused";
    if (code === "INVALID_RESPONSE") return "invalid_response";
  }
  return "unknown_error";
}

function parseEndpointUrl(endpoint: string): {
  protocol: "http:" | "https:";
  hostname: string;
  port: number;
  path: string;
} {
  const u = new URL(endpoint);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(
      `Unsupported protocol "${u.protocol}" in endpoint "${endpoint}". Must be http or https.`,
    );
  }
  const port = u.port
    ? Number.parseInt(u.port, 10)
    : u.protocol === "https:"
      ? 443
      : 80;
  return {
    protocol: u.protocol,
    hostname: u.hostname,
    port,
    path: u.pathname + u.search,
  };
}

// ─── Core measurement ─────────────────────────────────────────────────────────

/**
 * Opens a cold connection to `endpoint`, sends a GraphQL checkpoint query, and
 * returns the measured latency and checkpoint sequence number.
 *
 * DNS is pre-resolved and excluded from latency. The socket is created fresh
 * (cold TCP+TLS) on every call — `agent: false`.
 */
async function callCheckpointQuery(
  endpoint: string,
  probeVersion: string,
  token?: ProviderToken,
): Promise<{ latencyMs: number; sequenceNumber: number }> {
  const { protocol, hostname, port, path } = parseEndpointUrl(endpoint);

  // Pre-resolve DNS so its duration is excluded from the latency measurement.
  const { address } = await dns.lookup(hostname);

  // `servername` sets SNI for TLS certificate verification against the
  // original hostname when connecting via a pre-resolved IP address.
  // It is silently ignored by http.request.
  const headers: Record<string, string | number> = {
    "Content-Type": "application/json",
    "Content-Length": GRAPHQL_QUERY_BODY.byteLength,
    "User-Agent": `SuiScope-Probe/${probeVersion}`,
    Host: hostname, // virtual-host header (required when connecting via IP)
  };
  if (token != null) {
    headers[token.header] = token.value;
  }

  const requestOptions: https.RequestOptions = {
    hostname: address, // pre-resolved IP
    port,
    path,
    method: "POST",
    headers,
    agent: false, // cold connection: new TCP socket per request, never reused
    servername: hostname, // SNI — used by https.request, ignored by http.request
  };

  // Timer starts immediately before the cold TCP(+TLS) connection is initiated.
  const startTime = performance.now();
  let latencyMs = 0;
  let firstByteReceived = false;

  const responseBody = await new Promise<string>((resolve, reject) => {
    const req = (protocol === "https:" ? https.request : http.request)(
      requestOptions,
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: unknown) => {
          // Capture time to first response byte.
          if (!firstByteReceived) {
            latencyMs = Math.round(performance.now() - startTime);
            firstByteReceived = true;
          }
          chunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
          );
        });

        res.on("end", () => {
          if (!firstByteReceived) {
            // Empty body — capture time at response end as a fallback.
            latencyMs = Math.round(performance.now() - startTime);
          }
          if (res.statusCode != null && res.statusCode >= 400) {
            reject(
              Object.assign(new Error(`HTTP ${res.statusCode}`), {
                code: "INVALID_RESPONSE",
              }),
            );
          } else {
            resolve(Buffer.concat(chunks).toString("utf8"));
          }
        });

        res.on("error", reject);
      },
    );

    req.setTimeout(PROBE_TIMEOUT_MS, () => {
      req.destroy(
        Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }),
      );
    });

    req.on("error", reject);
    req.write(GRAPHQL_QUERY_BODY);
    req.end();
  });

  // Parse and validate the GraphQL response.
  // `JSON.parse` returns `any`; cast through `unknown` first so the
  // `no-unsafe-assignment` rule is satisfied.
  let raw: unknown;
  try {
    raw = JSON.parse(responseBody) as unknown;
  } catch {
    throw Object.assign(new Error("Invalid JSON response"), {
      code: "INVALID_RESPONSE",
    });
  }
  const parsed = raw as CheckpointGraphQLResponse;

  if (parsed.errors != null && parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw Object.assign(
      new Error(`GraphQL error: ${firstError?.message ?? "unknown"}`),
      { code: "INVALID_RESPONSE" },
    );
  }

  const rawSeq = parsed.data?.checkpoint?.sequenceNumber;
  if (rawSeq == null) {
    throw Object.assign(
      new Error("Missing data.checkpoint.sequenceNumber in response"),
      { code: "INVALID_RESPONSE" },
    );
  }

  const sequenceNumber =
    typeof rawSeq === "string" ? Number.parseInt(rawSeq, 10) : rawSeq;
  if (!Number.isFinite(sequenceNumber)) {
    throw Object.assign(
      new Error(`Invalid sequenceNumber: "${String(rawSeq)}"`),
      { code: "INVALID_RESPONSE" },
    );
  }

  return { latencyMs, sequenceNumber };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Probe a single GraphQL provider and return measurement events.
 *
 * On success, returns two events: `latency_ms` and `freshness_checkpoints`.
 * On failure, returns one event: `latency_ms` with `success: false` and a
 * classified `error_type`.
 *
 * @param provider      - Provider config (id + endpoint URL).
 * @param region        - Fly.io region code, e.g. "us-east-1".
 * @param probeVersion  - Version string from package.json, e.g. "0.1.0".
 * @param chainHead     - Current chain head checkpoint (from fetchChainHead).
 */
export async function probeGraphQL(
  provider: GraphQLProviderConfig,
  region: string,
  probeVersion: string,
  chainHead: number,
): Promise<MeasurementEvent[]> {
  const timestamp = Date.now();

  try {
    const { latencyMs, sequenceNumber } = await callCheckpointQuery(
      provider.endpoint,
      probeVersion,
      provider.token,
    );

    // Clamp to 0: if provider is somehow ahead of the reference, report 0.
    const freshness = Math.max(0, chainHead - sequenceNumber);

    return [
      {
        provider_id: provider.id,
        region,
        endpoint_type: "graphql",
        metric: "latency_ms",
        value: latencyMs,
        success: true,
        error_type: null,
        probe_version: probeVersion,
        timestamp,
      },
      {
        provider_id: provider.id,
        region,
        endpoint_type: "graphql",
        metric: "freshness_checkpoints",
        value: freshness,
        success: true,
        error_type: null,
        probe_version: probeVersion,
        timestamp,
      },
    ];
  } catch (error: unknown) {
    return [
      {
        provider_id: provider.id,
        region,
        endpoint_type: "graphql",
        metric: "latency_ms",
        value: 0,
        success: false,
        error_type: classifyError(error),
        probe_version: probeVersion,
        timestamp,
      },
    ];
  }
}
