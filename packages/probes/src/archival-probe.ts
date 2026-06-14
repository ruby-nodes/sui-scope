/**
 * Archival gRPC probe runner for Sui archival service endpoints.
 *
 * Measures:
 *   - latency_ms : cold TCP+TLS connect + GetCheckpoint round-trip (DNS excluded)
 *
 * The probe fetches a checkpoint ~30 days behind the current chain head to
 * verify that the archival node is actually serving deep historical data.
 * No freshness_checkpoints metric is emitted — archival nodes are intentionally
 * behind the head by design.
 *
 * Depth constant: 30 days × 86 400 s/day × ~1 checkpoint/s ≈ 2 592 000 checkpoints.
 *
 * Each call opens a brand-new gRPC channel — no connection reuse between probe
 * cycles, as required by architecture.md.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as dns from "node:dns/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as nodePath from "node:path";

import type { ArchivalProviderConfig, MeasurementEvent, ProviderToken } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 15_000;

/**
 * Number of checkpoints behind chain head to request.
 * 30 days × 86 400 s/day × ~1 checkpoint/s = 2 592 000.
 */
const ARCHIVAL_DEPTH_CHECKPOINTS = 2_592_000;

// ─── Proto loading (once per process) ────────────────────────────────────────

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = nodePath.resolve(
  __dirname,
  "../proto/sui/rpc/v2/ledger_service.proto",
);

const LOAD_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

// ─── TypeScript interfaces ────────────────────────────────────────────────────

interface GetCheckpointRequest {
  sequence_number?: string | number;
}

interface CheckpointSummary {
  sequence_number?: string;
}

interface GetCheckpointResponse {
  checkpoint?: CheckpointSummary;
}

interface ArchivalLedgerServiceClient extends grpc.Client {
  getCheckpoint(
    request: GetCheckpointRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<GetCheckpointResponse>,
  ): grpc.ClientUnaryCall;
}

export interface ArchivalLedgerServiceConstructor extends grpc.ServiceClientConstructor {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions,
  ): ArchivalLedgerServiceClient;
}

interface GrpcPackage {
  sui: {
    rpc: {
      v2: {
        LedgerService: ArchivalLedgerServiceConstructor;
      };
    };
  };
}

function initLedgerService(): ArchivalLedgerServiceConstructor {
  const pkgDef = protoLoader.loadSync(PROTO_PATH, LOAD_OPTIONS);
  const pkg = grpc.loadPackageDefinition(pkgDef) as unknown as GrpcPackage;
  return pkg.sui.rpc.v2.LedgerService;
}

export const ArchivalLedgerService: ArchivalLedgerServiceConstructor =
  initLedgerService();

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseEndpoint(endpoint: string): { host: string; port: number } {
  const lastColon = endpoint.lastIndexOf(":");
  if (lastColon === -1) {
    throw new Error(`Invalid gRPC endpoint (missing port): "${endpoint}"`);
  }
  const host = endpoint.slice(0, lastColon);
  const port = Number.parseInt(endpoint.slice(lastColon + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error(`Invalid gRPC endpoint (invalid port): "${endpoint}"`);
  }
  return { host, port };
}

function classifyGrpcError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: grpc.status }).code;
    if (code === grpc.status.DEADLINE_EXCEEDED) return "timeout";
    if (code === grpc.status.UNAVAILABLE) return "connection_refused";
    if (code === grpc.status.NOT_FOUND) return "not_found";
    if (code === grpc.status.CANCELLED) return "cancelled";
  }
  return "unknown_error";
}

/**
 * Opens a cold gRPC connection to `endpoint`, calls GetCheckpoint for a
 * checkpoint ~30 days behind the chain head, and returns the measured latency.
 *
 * DNS is pre-resolved and excluded from latency.
 */
async function callGetCheckpoint(
  endpoint: string,
  sequenceNumber: number,
  probeVersion: string,
  credentials: grpc.ChannelCredentials,
  token?: ProviderToken,
): Promise<{ latencyMs: number }> {
  const { host, port } = parseEndpoint(endpoint);

  const { address } = await dns.lookup(host);
  const resolvedTarget = `${address}:${port}`;

  const channelOptions: grpc.ClientOptions = {
    "grpc.primary_user_agent": `SuiScope-Probe/${probeVersion}`,
  };

  if (credentials._isSecure()) {
    channelOptions["grpc.default_authority"] = host;
    channelOptions["grpc.ssl_target_name_override"] = host;
  }

  const client = new ArchivalLedgerService(resolvedTarget, credentials, channelOptions);
  const startTime = performance.now();

  try {
    await new Promise<GetCheckpointResponse>((resolve, reject) => {
      const deadline = new Date(Date.now() + PROBE_TIMEOUT_MS);
      const metadata = new grpc.Metadata();
      if (token != null) {
        metadata.set(token.header, token.value);
      }
      client.getCheckpoint(
        { sequence_number: sequenceNumber },
        metadata,
        { deadline },
        (err, value) => {
          if (err != null) {
            reject(err);
          } else if (value == null) {
            reject(new Error("GetCheckpoint returned empty response"));
          } else {
            resolve(value);
          }
        },
      );
    });

    const latencyMs = Math.round(performance.now() - startTime);
    return { latencyMs };
  } finally {
    client.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Probe a single archival gRPC provider and return measurement events.
 *
 * Requests a checkpoint ~30 days behind chain head to confirm the archival
 * node serves deep historical data.
 *
 * On success, returns one event: `latency_ms` with `success: true`.
 * On failure (including NOT_FOUND, meaning the node lacks the requested depth),
 * returns one event: `latency_ms` with `success: false` and a classified
 * `error_type`.
 *
 * @param provider     - Provider config (id + endpoint).
 * @param region       - Fly.io region code, e.g. "iad".
 * @param probeVersion - Version string from package.json, e.g. "0.1.0".
 * @param chainHead    - Current chain head checkpoint (from fetchChainHead).
 * @param credentials  - Defaults to TLS. Pass createInsecure() in tests.
 */
export async function probeArchival(
  provider: ArchivalProviderConfig,
  region: string,
  probeVersion: string,
  chainHead: number,
  credentials: grpc.ChannelCredentials = grpc.credentials.createSsl(),
): Promise<MeasurementEvent[]> {
  const timestamp = Date.now();
  const targetCheckpoint = Math.max(0, chainHead - ARCHIVAL_DEPTH_CHECKPOINTS);

  try {
    const { latencyMs } = await callGetCheckpoint(
      provider.endpoint,
      targetCheckpoint,
      probeVersion,
      credentials,
      provider.token,
    );

    return [
      {
        provider_id: provider.id,
        region,
        endpoint_type: "archival",
        metric: "latency_ms",
        value: latencyMs,
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
        endpoint_type: "archival",
        metric: "latency_ms",
        value: 0,
        success: false,
        error_type: classifyGrpcError(error),
        probe_version: probeVersion,
        timestamp,
      },
    ];
  }
}
