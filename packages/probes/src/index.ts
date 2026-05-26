import { fileURLToPath } from "node:url";

import {
  loadEnv,
  loadProviders,
  readProbeVersion,
  resolveDefaultProvidersPath,
} from "./config.js";
import { startScheduler } from "./scheduler.js";

export const PACKAGE_NAME = "@sui-scope/probes";

export type { GrpcProviderConfig, GraphQLProviderConfig, MeasurementEvent } from "./types.js";
export { fetchChainHead, probeGrpc } from "./grpc-probe.js";
export { probeGraphQL } from "./graphql-probe.js";
export { loadProviders, loadEnv, resolveDefaultProvidersPath, readProbeVersion } from "./config.js";
export type { LoadedProviders, ProbeEnv } from "./config.js";
export { runOneCycle, startScheduler } from "./scheduler.js";
export type { SchedulerConfig, SchedulerDeps } from "./scheduler.js";

// ─── Main entry point ─────────────────────────────────────────────────────────

// Run as the daemon entry point when invoked directly (node packages/probes/src/index.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = loadEnv();
  const providersPath = env.PROVIDERS_YAML_PATH ?? resolveDefaultProvidersPath();
  const providers = loadProviders(providersPath);
  const probeVersion = readProbeVersion();

  console.error(
    `[scheduler] starting — region=${env.REGION} interval=${env.PROBE_INTERVAL_MS}ms ` +
      `grpc_providers=${providers.grpc.length} graphql_providers=${providers.graphql.length}`,
  );

  startScheduler({
    grpcProviders: providers.grpc,
    graphqlProviders: providers.graphql,
    region: env.REGION,
    probeVersion,
    intervalMs: env.PROBE_INTERVAL_MS,
  });
}
