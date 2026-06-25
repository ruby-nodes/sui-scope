/**
 * Probe scheduler.
 *
 * Runs one probe cycle every `intervalMs` milliseconds:
 *   1. Fetch the canonical chain head (once per cycle, shared across all providers).
 *   2. Probe every gRPC provider concurrently.
 *   3. Probe every GraphQL provider concurrently.
 *   4. Probe archival providers only on archival ticks.
 *   5. Emit each resulting MeasurementEvent to stdout as a JSON line.
 *
 * Each cycle is fully stateless — no mutable state is shared between cycles.
 *
 * Dependencies are injectable so the scheduler can be unit-tested without
 * making real network calls.
 */

import { fetchChainHead, probeGrpc } from "./grpc-probe.js";
import { probeGraphQL } from "./graphql-probe.js";
import { probeArchival } from "./archival-probe.js";
import type { GrpcProviderConfig, GraphQLProviderConfig, ArchivalProviderConfig, MeasurementEvent } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchedulerConfig = {
  grpcProviders: GrpcProviderConfig[];
  graphqlProviders: GraphQLProviderConfig[];
  archivalProviders: ArchivalProviderConfig[];
  region: string;
  probeVersion: string;
  intervalMs: number;
  archivalIntervalMs: number;
};

/** Injectable dependencies — defaults to real probe functions and stdout. */
export type SchedulerDeps = {
  fetchChainHead?: () => Promise<number>;
  probeGrpc?: typeof probeGrpc;
  probeGraphQL?: typeof probeGraphQL;
  probeArchival?: typeof probeArchival;
  emit?: (event: MeasurementEvent) => void;
};

export type CycleOptions = {
  includeArchival?: boolean;
};

// ─── Default emit ─────────────────────────────────────────────────────────────

function defaultEmit(event: MeasurementEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// ─── Core cycle ───────────────────────────────────────────────────────────────

/**
 * Run a single probe cycle: fetch chain head, probe all providers, emit events.
 *
 * Failures from individual providers are caught and emitted as error events —
 * they do not abort the cycle for other providers.
 *
 * @param config - Scheduler configuration (providers, region, version, interval).
 * @param deps   - Injectable dependencies for testing.
 */
export async function runOneCycle(
  config: SchedulerConfig,
  deps: SchedulerDeps = {},
  options: CycleOptions = {},
): Promise<void> {
  const {
    fetchChainHead: doFetchChainHead = fetchChainHead,
    probeGrpc: doProbeGrpc = probeGrpc,
    probeGraphQL: doProbeGraphQL = probeGraphQL,
    probeArchival: doProbeArchival = probeArchival,
    emit = defaultEmit,
  } = deps;
  const includeArchival = options.includeArchival ?? true;

  const chainHead = await doFetchChainHead();

  const [grpcResults, graphqlResults, archivalResults] = await Promise.all([
    Promise.allSettled(
      config.grpcProviders.map((p) =>
        doProbeGrpc(p, config.region, config.probeVersion, chainHead),
      ),
    ),
    Promise.allSettled(
      config.graphqlProviders.map((p) =>
        doProbeGraphQL(p, config.region, config.probeVersion, chainHead),
      ),
    ),
    Promise.allSettled(
      includeArchival
        ? config.archivalProviders.map((p) =>
            doProbeArchival(p, config.region, config.probeVersion, chainHead),
          )
        : [],
    ),
  ]);

  for (const result of [...grpcResults, ...graphqlResults, ...archivalResults]) {
    if (result.status === "fulfilled") {
      for (const event of result.value) {
        emit(event);
      }
    }
    // Rejected promises are silently dropped — the probe function itself
    // is responsible for catching errors and returning a failure event.
    // A rejection here indicates an unexpected programming error; log it
    // only in development.
  }
}

// ─── Scheduler lifecycle ──────────────────────────────────────────────────────

/**
 * Start the probe scheduler.
 *
 * Runs the first cycle immediately, then repeats every `config.intervalMs`
 * milliseconds. Returns the interval handle so callers can stop it.
 *
 * @param config - Scheduler configuration.
 * @param deps   - Injectable dependencies for testing.
 */
export function startScheduler(
  config: SchedulerConfig,
  deps: SchedulerDeps = {},
): NodeJS.Timeout {
  let lastArchivalAt = Number.NEGATIVE_INFINITY;

  const runCycle = (label: string): void => {
    const now = Date.now();
    const includeArchival =
      config.archivalProviders.length > 0 &&
      now - lastArchivalAt >= config.archivalIntervalMs;

    if (includeArchival) {
      lastArchivalAt = now;
    }

    void runOneCycle(config, deps, { includeArchival }).catch((err: unknown) => {
      console.error(`[scheduler] unhandled error in ${label}:`, err);
    });
  };

  // Run first cycle immediately (do not wait for first interval tick).
  runCycle("first cycle");

  return setInterval(() => {
    runCycle("cycle");
  }, config.intervalMs);
}
