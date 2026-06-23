/**
 * gRPC stream probe for Sui SubscriptionService.SubscribeCheckpoints.
 *
 * Measures per provider over a 1-hour observation window (ADR-007):
 *   - stream_checkpoint_gap    : chain_head − last cursor from stream (30 s samples)
 *   - stream_uptime_pct        : % of observation window the stream was connected
 *   - stream_disconnects_per_hour : # of unplanned terminations (5 s grace window)
 *
 * Architecture: runs as a long-lived background manager alongside the scheduler.
 * Each call to startStreamProbe() is fully independent — state is scoped to the
 * closure and never shared between providers or probe instances.
 *
 * The 5 s grace window de-bounces rapid reconnect flaps: at most one disconnect
 * event is counted per graceWindowMs interval.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import * as nodePath from "node:path";

import { fetchChainHead } from "./grpc-probe.js";
import type { GrpcProviderConfig, MeasurementEvent } from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SAMPLE_INTERVAL_MS = 30_000;  // stream_checkpoint_gap every 30 s
const DEFAULT_WINDOW_MS = 3_600_000;        // 1-hour observation window
const DEFAULT_RECONNECT_DELAY_MS = 1_000;   // wait 1 s before reconnecting
const DEFAULT_GRACE_WINDOW_MS = 5_000;      // 5 s disconnect de-bounce

// ─── Proto loading ──────────────────────────────────────────────────────────────

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = nodePath.resolve(
  __dirname,
  "../proto/sui/rpc/v2/subscription_service.proto",
);

const LOAD_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,   // uint64 fields decoded as strings
  enums: String,
  defaults: true,
  oneofs: true,
};

/** Shape of the SubscribeCheckpointsResponse fields we use (longs → strings). */
interface SubscribeCheckpointsResponse {
  cursor?: string;
}

/** Typed wrapper around the dynamically-loaded SubscriptionService client. */
export interface SubscriptionServiceConstructor
  extends grpc.ServiceClientConstructor {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions,
  ): SubscriptionServiceClient;
}

interface SubscriptionServiceClient extends grpc.Client {
  subscribeCheckpoints(
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
  ): grpc.ClientReadableStream<SubscribeCheckpointsResponse>;
}

interface SubscriptionPackage {
  sui: {
    rpc: {
      v2: { SubscriptionService: SubscriptionServiceConstructor };
    };
  };
}

function initSubscriptionService(): SubscriptionServiceConstructor {
  const pkgDef = protoLoader.loadSync(PROTO_PATH, LOAD_OPTIONS);
  const pkg = grpc.loadPackageDefinition(
    pkgDef,
  ) as unknown as SubscriptionPackage;
  return pkg.sui.rpc.v2.SubscriptionService;
}

/**
 * The loaded SubscriptionService client class.
 * Exported so tests can spin up a local server with the same service definition.
 */
export const SubscriptionService: SubscriptionServiceConstructor =
  initSubscriptionService();

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Injectable dependencies for startStreamProbe.
 * All timing parameters are configurable so tests can use small intervals.
 */
export type StreamProbeDeps = {
  /** Receives every emitted MeasurementEvent. Required. */
  emit: (event: MeasurementEvent) => void;
  /** gRPC credentials. Defaults to TLS. Pass createInsecure() in tests. */
  credentials?: grpc.ChannelCredentials;
  /**
   * Fetch the canonical chain head checkpoint height.
   * Defaults to calling GetServiceInfo on the reference mainnet endpoint.
   */
  fetchChainHead?: () => Promise<number>;
  /** Milliseconds between stream_checkpoint_gap samples. Default 30_000. */
  sampleIntervalMs?: number;
  /** Observation window duration in ms. Default 3_600_000 (1 hour). */
  windowMs?: number;
  /**
   * Grace window for disconnect de-bounce in ms. Default 5_000.
   * Disconnects within this interval of each other count as one event.
   */
  graceWindowMs?: number;
  /** Delay before reconnecting after a disconnect in ms. Default 1_000. */
  reconnectDelayMs?: number;
  /** Clock function injectable for deterministic tests. Default Date.now. */
  now?: () => number;
};

/** Per-probe window state. Scoped to each startStreamProbe() closure. */
type WindowState = {
  windowStart: number;
  /** Accumulated connected milliseconds in the current window. */
  connectedMs: number;
  /** Timestamp when the current connection started; null when disconnected. */
  connectSince: number | null;
  /** Disconnect events counted (after grace de-bounce) in this window. */
  disconnectCount: number;
  /** Timestamp of the last counted disconnect, for grace-window enforcement. */
  lastCountedDisconnectAt: number | null;
  /** Last checkpoint cursor received from the stream. */
  lastCursorFromStream: number | null;
};

// ─── Endpoint parser ────────────────────────────────────────────────────────────

function extractHost(endpoint: string): string {
  const lastColon = endpoint.lastIndexOf(":");
  if (lastColon === -1) {
    throw new Error(`Invalid gRPC endpoint (missing port): "${endpoint}"`);
  }
  return endpoint.slice(0, lastColon);
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Start a long-lived gRPC stream probe for a single provider.
 *
 * Opens a SubscribeCheckpoints stream, tracks uptime and disconnect events over
 * a configurable observation window (default 1 h), and samples checkpoint gap
 * every 30 s. Returns a stop() function that cancels all timers and the stream.
 *
 * @param provider     - Provider endpoint to probe.
 * @param region       - Region identifier injected by the deployment platform.
 * @param probeVersion - Semver string from package.json.
 * @param deps         - Injectable dependencies (emit, credentials, timings).
 * @returns            stop() — call to cleanly shut down this probe.
 */
export function startStreamProbe(
  provider: GrpcProviderConfig,
  region: string,
  probeVersion: string,
  deps: StreamProbeDeps,
): () => void {
  const {
    emit,
    credentials: explicitCredentials,
    fetchChainHead: doFetchChainHead = fetchChainHead,
    sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
    windowMs = DEFAULT_WINDOW_MS,
    graceWindowMs = DEFAULT_GRACE_WINDOW_MS,
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
    now = (): number => Date.now(),
  } = deps;

  let stopped = false;
  const host = extractHost(provider.endpoint);

  const state: WindowState = {
    windowStart: now(),
    connectedMs: 0,
    connectSince: null,
    disconnectCount: 0,
    lastCountedDisconnectAt: null,
    lastCursorFromStream: null,
  };

  let activeCall: grpc.ClientReadableStream<SubscribeCheckpointsResponse> | null =
    null;
  let activeClient: grpc.Client | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function buildCredentials(): grpc.ChannelCredentials {
    return explicitCredentials ?? grpc.credentials.createSsl();
  }

  function connect(): void {
    if (stopped) return;
    reconnectTimer = null;

    const creds = buildCredentials();
    const channelOptions: grpc.ClientOptions = {
      "grpc.primary_user_agent": `SuiScope-Probe/${probeVersion}`,
    };

    // Set authority/SNI to the original hostname so certificate validation
    // succeeds (mirrors the pattern in grpc-probe.ts).
    if (creds._isSecure()) {
      channelOptions["grpc.default_authority"] = host;
      channelOptions["grpc.ssl_target_name_override"] = host;
    }

    const client = new SubscriptionService(
      provider.endpoint,
      creds,
      channelOptions,
    );
    const metadata = new grpc.Metadata();
    for (const [header, value] of Object.entries(provider.headers ?? {})) {
      metadata.set(header, value);
    }
    if (provider.token != null) {
      metadata.set(provider.token.header, provider.token.value);
    }
    const call = client.subscribeCheckpoints({}, metadata, {});

    activeClient = client;
    activeCall = call;
    state.connectSince = now();

    call.on("data", (response: SubscribeCheckpointsResponse) => {
      if (response.cursor != null) {
        const cursor = Number.parseInt(response.cursor, 10);
        if (!Number.isNaN(cursor)) {
          state.lastCursorFromStream = cursor;
        }
      }
    });

    // Both 'end' and 'error' fire when the stream terminates. The `handled`
    // flag ensures exactly one disconnect is processed per connection.
    let handled = false;
    const handleDisconnect = (): void => {
      if (handled) return;
      handled = true;

      if (state.connectSince != null) {
        state.connectedMs += now() - state.connectSince;
        state.connectSince = null;
      }

      // Only count unplanned disconnects (not deliberate stop() cancellations).
      if (!stopped) {
        // Grace-window de-bounce: at most one counted event per graceWindowMs.
        const t = now();
        if (
          state.lastCountedDisconnectAt == null ||
          t - state.lastCountedDisconnectAt >= graceWindowMs
        ) {
          state.disconnectCount++;
          state.lastCountedDisconnectAt = t;
        }
      }

      activeCall = null;
      client.close();
      activeClient = null;

      if (!stopped) {
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      }
    };

    call.on("end", handleDisconnect);
    call.on("error", handleDisconnect);
  }

  // ─── 30 s sampling interval (stream_checkpoint_gap) ────────────────────────

  const sampleTimer = setInterval(() => {
    if (stopped) return;

    const cursor = state.lastCursorFromStream;

    if (cursor === null) {
      // Stream connected but no checkpoint received yet.
      emit({
        provider_id: provider.id,
        region,
        endpoint_type: "grpc",
        metric: "stream_checkpoint_gap",
        value: 0,
        success: false,
        error_type: "no_data",
        probe_version: probeVersion,
        timestamp: now(),
      });
      return;
    }

    doFetchChainHead()
      .then((chainHead) => {
        if (stopped) return;
        emit({
          provider_id: provider.id,
          region,
          endpoint_type: "grpc",
          metric: "stream_checkpoint_gap",
          value: Math.max(0, chainHead - cursor),
          success: true,
          error_type: null,
          probe_version: probeVersion,
          timestamp: now(),
        });
      })
      .catch(() => {
        // Reference endpoint temporarily unreachable — skip this sample silently.
      });
  }, sampleIntervalMs);

  // ─── Observation window reset (stream_uptime_pct, stream_disconnects_per_hour)

  const windowTimer = setInterval(() => {
    if (stopped) return;

    const t = now();
    // Include time connected up to this moment if the stream is live.
    const effectiveConnectedMs =
      state.connectedMs +
      (state.connectSince != null ? t - state.connectSince : 0);

    emit({
      provider_id: provider.id,
      region,
      endpoint_type: "grpc",
      metric: "stream_uptime_pct",
      value: Math.min(100, Math.max(0, (effectiveConnectedMs / windowMs) * 100)),
      success: true,
      error_type: null,
      probe_version: probeVersion,
      timestamp: t,
    });

    emit({
      provider_id: provider.id,
      region,
      endpoint_type: "grpc",
      metric: "stream_disconnects_per_hour",
      value: state.disconnectCount,
      success: true,
      error_type: null,
      probe_version: probeVersion,
      timestamp: t,
    });

    // Reset window counters. If still connected, carry over the connection
    // start to track the new window's uptime from now.
    state.windowStart = t;
    state.connectedMs = 0;
    state.connectSince = state.connectSince != null ? t : null;
    state.disconnectCount = 0;
    state.lastCountedDisconnectAt = null;
    // lastCursorFromStream intentionally not reset — stream position is continuous.
  }, windowMs);

  // Kick off the first connection.
  connect();

  // ─── Stop function ──────────────────────────────────────────────────────────

  return (): void => {
    stopped = true;
    clearInterval(sampleTimer);
    clearInterval(windowTimer);
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (activeCall != null) {
      activeCall.cancel();
      activeCall = null;
    }
    if (activeClient != null) {
      activeClient.close();
      activeClient = null;
    }
  };
}
