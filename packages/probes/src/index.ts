import * as http from "node:http";
import * as https from "node:https";
import { fileURLToPath } from "node:url";

import {
  loadEnv,
  loadProviders,
  readProbeVersion,
  resolveDefaultProvidersPath,
} from "./config.js";
import { startScheduler } from "./scheduler.js";
import { startStreamProbe } from "./stream-probe.js";
import type { MeasurementEvent } from "./types.js";

export const PACKAGE_NAME = "@sui-scope/probes";

export type { GrpcProviderConfig, GraphQLProviderConfig, ArchivalProviderConfig, MeasurementEvent } from "./types.js";
export { fetchChainHead, probeGrpc } from "./grpc-probe.js";
export { probeGraphQL } from "./graphql-probe.js";
export { probeArchival } from "./archival-probe.js";
export { loadProviders, loadEnv, resolveDefaultProvidersPath, readProbeVersion } from "./config.js";
export type { LoadedProviders, ProbeEnv } from "./config.js";
export { runOneCycle, startScheduler } from "./scheduler.js";
export type { SchedulerConfig, SchedulerDeps } from "./scheduler.js";
export { startStreamProbe, SubscriptionService } from "./stream-probe.js";
export type { StreamProbeDeps } from "./stream-probe.js";

// ─── Network emit ─────────────────────────────────────────────────────────────

/**
 * Creates an emit function that POSTs each MeasurementEvent to the API ingest
 * endpoint using a cold TCP connection (agent: false) as required by architecture.md.
 */
function createNetworkEmit(
  ingestUrl: string,
  ingestSecret: string,
): (event: MeasurementEvent) => void {
  const parsed = new URL(ingestUrl);
  const transport = parsed.protocol === "https:" ? https : http;

  return (event: MeasurementEvent): void => {
    const body = JSON.stringify(event);
    const options: http.RequestOptions = {
      method: "POST",
      hostname: parsed.hostname,
      port: parsed.port !== "" ? parsed.port : undefined,
      path: parsed.pathname + parsed.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${ingestSecret}`,
      },
      agent: false, // cold connection per architecture.md
    };

    const req = transport.request(options, (res) => {
      if (res.statusCode !== undefined && res.statusCode >= 400) {
        console.error(`[emit] ingest responded with HTTP ${res.statusCode}`);
      }
      res.resume(); // drain to free socket
    });

    req.on("error", (err: Error) => {
      console.error("[emit] failed to post measurement:", err.message);
    });

    req.write(body);
    req.end();
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// Run as the daemon entry point when invoked directly (node packages/probes/dist/index.js).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = loadEnv();
  const providersPath = env.PROVIDERS_YAML_PATH ?? resolveDefaultProvidersPath();
  const providers = loadProviders(providersPath);
  const probeVersion = readProbeVersion();

  console.error(
    `[scheduler] starting — region=${env.REGION} interval=${env.PROBE_INTERVAL_MS}ms ` +
      `grpc_providers=${providers.grpc.length} graphql_providers=${providers.graphql.length} ` +
      `archival_providers=${providers.archival.length}`,
  );

  const networkEmit = createNetworkEmit(env.INGEST_URL, env.INGEST_SECRET);

  startScheduler(
    {
      grpcProviders: providers.grpc,
      graphqlProviders: providers.graphql,
      archivalProviders: providers.archival,
      region: env.REGION,
      probeVersion,
      intervalMs: env.PROBE_INTERVAL_MS,
    },
    { emit: networkEmit },
  );

  // Start one stream probe per gRPC provider (Phase 2 — M4-01).
  // All gRPC providers are assumed to expose SubscriptionService.SubscribeCheckpoints.
  for (const provider of providers.grpc) {
    startStreamProbe(provider, env.REGION, probeVersion, { emit: networkEmit });
  }
}
