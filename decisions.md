# SuiScope — Architecture Decision Records

Decisions are append-only. Closed ADRs are not re-opened; superseded ADRs reference their replacement.

---

## ADR-001 — TypeScript / Node.js as the single runtime language

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
We needed a backend and probe language. Go was considered for probe agents due to its native gRPC support and low memory footprint.

**Decision:**  
Use TypeScript on Node.js 22 for all packages (probes, API, dashboard). A single language across the full stack reduces context switching, allows shared types and Zod schemas between packages, and keeps the toolchain simple.

**Consequences:**  
- `@grpc/grpc-js` for gRPC in probes; mature and well-maintained
- Performance is not a constraint — probe cycles fire every 60 s and are I/O-bound
- All packages use the same ESLint config, Prettier config, and Vitest setup

---

## ADR-002 — Monorepo with pnpm workspaces + Turborepo

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
Three packages (probes, api, dashboard) need shared types and config. Options were separate repos, Nx, or pnpm + Turborepo.

**Decision:**  
pnpm workspaces for package management, Turborepo for task orchestration (typecheck, lint, test, build). No Nx — it is over-engineered for this scale.

**Consequences:**  
- Shared packages (e.g. `packages/types`) can be added later without repo restructure
- `pnpm turbo typecheck lint test` is the single CI command
- Remote caching via Turborepo Cloud is optional and wired in CI via env vars

---

## ADR-003 — ClickHouse for time-series storage

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
Metrics are append-only measurement events. Needed fast aggregation (p99, rolling windows), SQL interface, and reasonable ops burden.

**Decision:**  
ClickHouse. Append-only writes, columnar storage, MergeTree engine, and native rolling-window aggregations match the access pattern exactly. TimescaleDB (Postgres extension) was the alternative — simpler ops, but slower aggregation at scale.

**Consequences:**  
- All writes are inserts — no updates, no deletes
- Queries scan the raw `measurements` table directly with rolling-window `WHERE` clauses; no materialized view layer (a `measurements_1m` + `measurements_mv` pre-aggregation was removed after causing OOM on the 2 GB ClickHouse machine due to `quantileTDigest` state overhead)
- MVP can run on a single Fly.io Machine; scale vertically first

---

## ADR-004 — Raw metrics only; no composite score

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
A single composite score (e.g. weighted average of latency + freshness + uptime) would be more shareable but any weighting will be disputed by providers who rank poorly.

**Decision:**  
Publish raw metrics only. The dashboard leaderboard is sortable by any individual metric. A composite score requires a new ADR with explicit methodology and community review before implementation.

**Consequences:**  
- Leaderboard has multiple columns, no single rank column
- Users choose the metric that matters to them
- Providers cannot dispute the score formula — only the measurement methodology

---

## ADR-005 — Manual, curated provider registry

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
Providers could self-register, or the registry could be community-driven. However, open self-registration creates quality and spam risk early on.

**Decision:**  
Provider list is a YAML file in the repository (`config/providers.yaml`), manually curated. Additions accepted via PR with human review. Only providers with freely accessible public endpoints appear in the public leaderboard.

**Consequences:**  
- Providers with auth-gated or private endpoints are excluded from the public view by default
- A provider can submit a PR to add or update their entry
- If a private-endpoint track is ever added, it requires a new ADR

---

## ADR-006 — Fly.io for probe deployment

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
Probes must run in multiple geographic regions. Options: Fly.io, Cloudflare Workers, AWS Lambda@Edge, self-hosted VPS.

**Decision:**  
Fly.io. Native multi-region VM support, per-region Machines, simple deploy from a single repo, reasonable cost for small always-on processes.

**Consequences:**  
- Each region runs one Machine from `packages/probes`
- Region identity is injected via `FLY_REGION` env var at runtime
- If a region needs to be added, it is a `fly scale` command, not a new deployment pipeline

---

## ADR-008 — Private endpoint support via env-var references

**Date:** 2026-06-10
**Status:** Accepted

**Context:**
Some infrastructure providers (e.g. QuickNode) can only offer authenticated endpoints where the API key is embedded in the URL (e.g. `https://proud-crimson.quiknode.pro/abc123/`). Storing such URLs in `config/providers.yaml` (which is public on GitHub) would expose secrets. ADR-005 explicitly deferred this case with the note: *"If a private-endpoint track is ever added, it requires a new ADR."*

**Decision:**
Extend `config/providers.yaml` with two new optional fields per provider entry: `grpc_env` and `graphql_env`. These hold the **name of an environment variable** that the probe daemon resolves at startup. The actual secret URL lives only in Fly.io secrets and is never committed to the repository.

A new boolean field `public` (default: `true`) marks whether a provider's endpoint URL is freely accessible. For `public: false` providers:
- The probe daemon still probes and emits measurement events normally.
- The public API (`GET /v1/providers`) does **not** expose the endpoint URL in its response.
- All metrics (latency, freshness, uptime, error rate) are still published — the leaderboard shows a private provider's performance, just not its URL.

The probe daemon fails fast at startup with a descriptive error if a referenced env var is not set, consistent with the existing Zod-based env validation pattern.

**Public providers** continue to use the existing `grpc` / `graphql` literal fields unchanged. Mixing `grpc` (literal) with `graphql_env` (env var) on the same provider is allowed.

**Consequences:**
- Private providers can participate in the public leaderboard and benchmarks.
- Secrets never touch the repository.
- Fly secrets (`fly secrets set PROVIDER_GRAPHQL_URL="..."`) are the single source of truth for private URLs.
- `loadProviders()` in `packages/probes/src/config.ts` accepts an optional `env` parameter (default `process.env`) to keep tests hermetic.
- The API's `GET /v1/providers` response shape gains a `public` boolean field on each provider entry.

---

## ADR-007 — Stream stability metric definitions

**Date:** 2026-05-26  
**Status:** Accepted

**Context:**  
gRPC subscriptions (checkpoint streams) are stateful and require precise definitions to measure fairly.

**Decision:**  
Three metrics, defined canonically:

| Metric | Definition |
|---|---|
| `stream_uptime_pct` | % of observation window the gRPC subscription was connected |
| `stream_checkpoint_gap` | `chain_head − last_received_via_stream`, sampled every 30 s |
| `stream_disconnects_per_hour` | Unplanned stream terminations; reconnects within 5 s grace window count as one event |

Stream metrics apply to gRPC subscriptions only. GraphQL subscriptions are out of scope unless a provider exposes them and an ADR covers the methodology.

**Consequences:**  
- Stream metrics are Phase 2 (M4) — not built during M1–M3
- The 5 s grace window prevents noise from transient TCP hiccups
- `stream_checkpoint_gap` provides a continuous lag signal independent of disconnect events

---

## ADR-009 — Archival endpoint support

**Date:** 2026-06-14
**Status:** Accepted

**Context:**
The Sui Archival Service exposes the same `sui.rpc.v2.LedgerService` gRPC API as a full node but serves historical data beyond the full-node retention window. Mysten Labs operates the first public archival endpoint (`archive.mainnet.sui.io:443`). Treating archival as a separate provider entry would create a misleading split; a provider is a single entity that may offer multiple endpoint types.

**Decision:**
Add an `archival` field (and `archival_env` for private endpoints) to `config/providers.yaml`, parallel to the existing `grpc` and `graphql` fields. A single provider entry may combine any of the three types.

The archival probe measures:
- **`latency_ms`** — cold TCP+TLS connect + `GetCheckpoint` round-trip (DNS excluded, same definition as gRPC/GraphQL latency).
- **`success`** — whether the archival node returned data for a checkpoint ~30 days behind the chain head (`chain_head − 2 592 000`). A `NOT_FOUND` response counts as failure.

**`freshness_checkpoints` is deliberately not emitted** for archival probes — archival nodes are by design behind the chain head, so reporting a large gap would be misleading.

The 30-day depth constant (2 592 000 ≈ 30 × 86 400 checkpoints at ~1/s) is fixed and deterministic per cycle. No randomness is introduced; caching at the Bigtable-backed archival layer is considered unlikely in practice.

**Consequences:**
- `ArchivalProviderConfig` is a new type in `packages/probes/src/types.ts`.
- `loadProviders()` returns `{ grpc, graphql, archival }`.
- `SchedulerConfig` gains `archivalProviders`.
- `archival-probe.ts` is a new probe module using the existing `LedgerService` proto (extended with `GetCheckpoint`).
- The leaderboard endpoint-type filter gains an `archival` option (UI update deferred to next milestone).
- The methodology page documents the archival probe mechanics.
