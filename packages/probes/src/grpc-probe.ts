/**
 * gRPC probe runner for Sui fullnode endpoints.
 *
 * Measures:
 *   - latency_ms   : cold TCP+TLS connect + GetServiceInfo round-trip (DNS excluded)
 *   - freshness_checkpoints : chain_head − provider.checkpoint_height
 *
 * Each call to probeGrpc() opens a brand-new gRPC channel — no connection reuse
 * between probe cycles, as required by architecture.md.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as dns from "node:dns/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as nodePath from "node:path";

import type { GrpcProviderConfig, MeasurementEvent, ProviderToken } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 10_000;
/** Reference endpoint used to determine canonical chain head. */
const REFERENCE_ENDPOINT = "fullnode.mainnet.sui.io:443";

// ─── Proto loading (once per process) ────────────────────────────────────────

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = nodePath.resolve(
  __dirname,
  "../proto/sui/rpc/v2/ledger_service.proto",
);

const LOAD_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String, // String constructor → uint64 fields decoded as strings
  enums: String, // enum values decoded as their names
  defaults: true,
  oneofs: true,
};

// ─── TypeScript interfaces for the proto-loaded service ───────────────────────

/** Shape of GetServiceInfoResponse fields we care about (longs come back as strings). */
interface GetServiceInfoResponse {
  chain_id?: string;
  chain?: string;
  epoch?: string;
  checkpoint_height?: string;
  lowest_available_checkpoint?: string;
  lowest_available_checkpoint_objects?: string;
  server?: string;
}

/** Typed wrapper around the dynamically-loaded LedgerService client class. */
export interface LedgerServiceConstructor extends grpc.ServiceClientConstructor {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions,
  ): LedgerServiceClient;
}

interface LedgerServiceClient extends grpc.Client {
  getServiceInfo(
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<GetServiceInfoResponse>,
  ): grpc.ClientUnaryCall;
}

/** Package shape after loadPackageDefinition. */
interface GrpcPackage {
  sui: {
    rpc: {
      v2: {
        LedgerService: LedgerServiceConstructor;
      };
    };
  };
}

function initLedgerService(): LedgerServiceConstructor {
  const pkgDef = protoLoader.loadSync(PROTO_PATH, LOAD_OPTIONS);
  const pkg = grpc.loadPackageDefinition(pkgDef) as unknown as GrpcPackage;
  return pkg.sui.rpc.v2.LedgerService;
}

/**
 * Exported so that tests can access LedgerService.service for spinning up a
 * local test server with the same service definition.
 */
export const LedgerService: LedgerServiceConstructor = initLedgerService();

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
    if (code === grpc.status.CANCELLED) return "cancelled";
  }
  return "unknown_error";
}

/**
 * Opens a cold gRPC connection to `endpoint`, calls GetServiceInfo, and
 * returns the measured latency and checkpoint height.
 *
 * DNS is pre-resolved and excluded from latency; the channel is created fresh
 * (cold TCP+TLS) on every call.
 *
 * @param credentials - Defaults to TLS. Pass createInsecure() in tests.
 */
async function callGetServiceInfo(
  endpoint: string,
  probeVersion: string,
  credentials: grpc.ChannelCredentials,
  token?: ProviderToken,
): Promise<{ latencyMs: number; checkpointHeight: number }> {
  const { host, port } = parseEndpoint(endpoint);

  // Pre-resolve DNS so its duration is excluded from the latency measurement.
  const { address } = await dns.lookup(host);
  const resolvedTarget = `${address}:${port}`;

  const channelOptions: grpc.ClientOptions = {
    "grpc.primary_user_agent": `SuiScope-Probe/${probeVersion}`,
  };

  // TLS-specific: set the authority header and SNI to the original hostname
  // so that certificate validation succeeds when connecting via resolved IP.
  if (credentials._isSecure()) {
    channelOptions["grpc.default_authority"] = host;
    channelOptions["grpc.ssl_target_name_override"] = host;
  }

  // Cold connection: a new channel (and therefore a new TCP+TLS handshake) is
  // created on every call. Never reuse channels across probe cycles.
  const client = new LedgerService(resolvedTarget, credentials, channelOptions);
  const startTime = performance.now();

  try {
    const response = await new Promise<GetServiceInfoResponse>(
      (resolve, reject) => {
        const deadline = new Date(Date.now() + PROBE_TIMEOUT_MS);
        const metadata = new grpc.Metadata();
        if (token != null) {
          metadata.set(token.header, token.value);
        }
        client.getServiceInfo(
          {},
          metadata,
          { deadline },
          (err, value) => {
            if (err != null) {
              reject(err);
            } else if (value == null) {
              reject(new Error("GetServiceInfo returned empty response"));
            } else {
              resolve(value);
            }
          },
        );
      },
    );

    const latencyMs = Math.round(performance.now() - startTime);
    const checkpointHeight = Number.parseInt(
      response.checkpoint_height ?? "0",
      10,
    );

    return { latencyMs, checkpointHeight };
  } finally {
    client.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the canonical chain head checkpoint height from the reference endpoint
 * (fullnode.mainnet.sui.io). Called once per probe cycle; the result is shared
 * across all provider probes in that cycle.
 *
 * @param credentials - Defaults to TLS. Pass createInsecure() in tests.
 */
export async function fetchChainHead(
  credentials: grpc.ChannelCredentials = grpc.credentials.createSsl(),
): Promise<number> {
  const { checkpointHeight } = await callGetServiceInfo(
    REFERENCE_ENDPOINT,
    "0.0.0",
    credentials,
  );
  return checkpointHeight;
}

/**
 * Probe a single gRPC provider and return measurement events.
 *
 * On success, returns two events: `latency_ms` and `freshness_checkpoints`.
 * On failure, returns one event: `latency_ms` with `success: false` and a
 * classified `error_type`.
 *
 * @param provider      - Provider config (id + endpoint).
 * @param region        - Fly.io region code, e.g. "us-east-1".
 * @param probeVersion  - Version string from package.json, e.g. "0.1.0".
 * @param chainHead     - Current chain head checkpoint (from fetchChainHead).
 * @param credentials   - Defaults to TLS. Pass createInsecure() in tests.
 */
export async function probeGrpc(
  provider: GrpcProviderConfig,
  region: string,
  probeVersion: string,
  chainHead: number,
  credentials: grpc.ChannelCredentials = grpc.credentials.createSsl(),
): Promise<MeasurementEvent[]> {
  const timestamp = Date.now();

  try {
    const { latencyMs, checkpointHeight } = await callGetServiceInfo(
      provider.endpoint,
      probeVersion,
      credentials,
      provider.token,
    );

    // Clamp to 0: if provider is somehow ahead of the reference, report 0.
    const freshness = Math.max(0, chainHead - checkpointHeight);

    return [
      {
        provider_id: provider.id,
        region,
        endpoint_type: "grpc",
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
        endpoint_type: "grpc",
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
        endpoint_type: "grpc",
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
