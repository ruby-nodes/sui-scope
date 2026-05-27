# SuiScope — Tasks

## Working conventions

- **Versions:** Always verify the latest stable version of every library, framework, and tool before adding it. Do not assume a version — check the registry. Pin exact versions in `package.json`.
- **Design:** Dashboard UI must be purpose-built for SuiScope. Do not use off-the-shelf component themes or UI kits as-is. Every page should feel intentional — custom typography scale, colour palette, and layout.

---

## M1 · Foundation
**Goal:** Working monorepo with CI, shared tooling, and a deployable skeleton for all three packages.

| ID | Task | Status |
|---|---|---|
| M1-01 | Scaffold monorepo: pnpm workspaces, Turborepo, root `package.json` with workspace globs | `[x]` |
| M1-02 | Configure shared tooling: strict `tsconfig.base.json`, ESLint flat config (typescript-eslint), Prettier, Vitest | `[x]` |
| M1-03 | Create skeleton packages: `probes`, `api`, `dashboard` — each with a passing typecheck, lint, and test | `[x]` |
| M1-04 | Wire GitHub Actions CI: install → `pnpm turbo typecheck lint test` on push and PR to `main` | `[x]` |

---

## M2 · Probe Engine
**Goal:** Probes run in at least 2 regions, collect gRPC and GraphQL metrics for ≥ 3 providers, and write to ClickHouse.

| ID | Task | Status |
|---|---|---|
| M2-01 | Implement gRPC probe runner: cold-connection latency, freshness via `GetLatestCheckpointSequenceNumber`, structured error capture | `[x]` |
| M2-02 | Implement GraphQL probe runner: cold-connection latency, freshness via checkpoint query, structured error capture | `[x]` |
| M2-03 | Seed `config/providers.yaml` with initial providers; wire probe scheduler to load config at startup | `[x]` |
| M2-04 | Implement ClickHouse schema (raw events table + materialized aggregation views) and API ingest endpoint with Zod validation | `[x]` |
| M2-05 | Deploy probe agents to Fly.io in 2 regions; verify measurements reach ClickHouse | `[x]` |

---

## M3 · Dashboard MVP
**Goal:** Public leaderboard live with real data; methodology page published. Design must be custom and production-quality.

| ID | Task | Status |
|---|---|---|
| M3-01 | Define design system: colour palette, typography scale, spacing, component primitives (no off-the-shelf theme) | `[x]` |
| M3-02 | Build leaderboard page: sortable raw metrics table, region and endpoint-type filters | `[x]` |
| M3-03 | Build methodology page: exact probe definitions, measurement rules, anti-gaming approach | `[x]` |
| M3-04 | Build provider detail page: per-region metric breakdown, 24 h / 7 d time-series charts | `[x]` |
| M3-05 | Implement public read API endpoints (`/v1/providers`, `/v1/metrics`, `/v1/metrics/:id`) with rate limiting | `[x]` |

---

## M4 · Hardening + Stream Metrics
**Goal:** Stream stability metrics live, ≥ 5 providers, 4+ regions, public API documented.

| ID | Task | Status |
|---|---|---|
| M4-01 | Implement gRPC stream probe: `stream_uptime_pct`, `stream_checkpoint_gap` (30 s sample), `stream_disconnects_per_hour` | `[x]` |
| M4-02 | Expand provider list to ≥ 5; deploy probes to 4+ Fly.io regions | `[x]` |
| M4-03 | Build comparison page: side-by-side metric charts for 2–4 selected providers | `[x]` |
| M4-04 | Publish public API reference documentation | `[ ]` |

---

## Status key

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[!]` | Blocked |

---

## Change log

<!-- Decisions recorded during task execution are appended here.
     Format: YYYY-MM-DD · {TASK-ID} · {Decision summary in one sentence.} -->
- 2026-05-26 · M1-01 · Pinned turbo@2.9.14, typescript@6.0.3, eslint@10.4.0, typescript-eslint@8.60.0, vitest@4.1.7, prettier@3.8.3; package stubs created in packages/ with Option A (bare stubs now, full skeleton in M1-03); config/ files deferred to M2-03.
- 2026-05-26 · M1-02 · eslint.config.js uses ESM ("type":"module" added to root package.json); tsconfig.base.json sets module/moduleResolution NodeNext (dashboard overrides in M1-03); Prettier defaults (double quotes, 80 cols, trailing commas all, semi true); root vitest.workspace.ts referencing packages/*/vitest.config.ts added for direct vitest runs.
- 2026-05-26 · M1-03 · Next.js upgraded from 15 to 16.2.6 (latest stable at time of task); architecture.md updated accordingly. Dashboard tsconfig overrides to module:ESNext + moduleResolution:Bundler. Plain TS stubs for all three packages; framework deps (Hono, Next.js, @grpc/grpc-js) deferred to M2/M3 tasks.
- 2026-05-26 · M1-04 · CI workflow was already present from earlier scaffolding; pnpm action uses version: 9 (floating major, accepted); GitHub Actions pinned at @v4 major tags (SHA-pinning deferred as out of M1 scope).
- 2026-05-26 · M2-01 · Used LedgerService.GetServiceInfo (sui.rpc.v2) instead of deprecated GetLatestCheckpointSequenceNumber JSON-RPC method; minimal proto vendored from MystenLabs/sui-apis; longs decoded via String constructor (type-safe); chain head from fullnode.mainnet.sui.io as fixed reference (Option B); 10 s probe timeout; credentials parameter injectable for tests; unit tests use a real local gRPC server (no mocks).
- 2026-05-26 · M2-02 · Node.js built-in `node:https` with `agent: false` for cold connections (no new deps); caller-supplied `chainHead` parameter (consistent with gRPC probe); GraphQL query `{ checkpoint { sequenceNumber } }`; endpoint stored as full URL in GraphQLProviderConfig; tests use a real local HTTP server.
- 2026-05-26 · M2-03 · Initial providers: Mysten Labs (fullnode.mainnet.sui.io), Ankr (sui.grpc.ankr.com / rpc.ankr.com), 01node (sui.01.ro) — all with public gRPC and GraphQL endpoints; js-yaml@4.1.1 for YAML parsing; zod@4.4.3 for env var validation; scheduler emits MeasurementEvent JSON lines to stdout (ingest endpoint wired in M2-04); PROBE_INTERVAL_MS env var added (default 60 000 ms); probes package version bumped to 0.1.0.
- 2026-05-26 · M2-04 · hono@4.12.23 + @hono/node-server@2.0.4 for the API server (Node.js adapter); @clickhouse/client@1.18.5 for ClickHouse writes; zod@4.4.3 for payload validation; ClickHouse schema uses MergeTree raw events + AggregatingMergeTree per-minute rollup + materialized view (Option A); schema lives at packages/api/src/db/schema.sql (Option A); ingest auth via Authorization: Bearer token; @types/node@25.9.1 added as devDep with "types":["node"] in tsconfig to fix TypeScript 6 globals resolution.
- 2026-05-26 · M3-01 · Dark theme with Sui cyan accent (#4da2ff); Geist Sans + Geist Mono via next/font (geist@1.7.1); Next.js 16.2.6 + Tailwind v4 (tailwindcss@4.3.0, @tailwindcss/postcss@4.3.0) bootstrapped in dashboard package with App Router; design tokens defined via Tailwind v4 @theme CSS directive; component primitives: StatCard, MetricBadge, DataTable (client), PageContainer, SectionHeading.
- 2026-05-26 · M2-05 · Probe daemon posts measurements via node:http/https (cold, agent:false) to INGEST_URL rather than stdout; FLY_REGION used as fallback for REGION env var; multi-stage Dockerfiles for probes and api with pnpm@10.12.4; ClickHouse deployed as a Fly.io Machine on private network (suiscope-clickhouse.internal:8123); schema applied with CREATE DATABASE suiscope + TTL cast fix (toDateTime); probes running in iad + fra; verified 33 rows iad / 22 rows fra in suiscope.measurements.
- 2026-05-26 · M3-02 · Leaderboard built with typed mock data (src/lib/mock-data.ts) matching the future /v1/metrics API shape; real data wired in M3-05. One display row per provider × endpoint-type; region filter aggregates worst-case uptime/error_rate across regions. Tier thresholds: latency good <100 ms / degraded <300 ms; freshness good ≤2 ckpts; uptime good ≥99.5%; error_rate good <0.5%. Filters and sort state stored in URL search params.
- 2026-05-26 · M3-03 · Methodology page is static TSX (no MDX); a minimal sticky NavBar added to root layout linking Leaderboard and Methodology; anti-gaming content drafted from implemented probe mechanics (cold TCP, opaque timing, transparent User-Agent, independent chain-head reference).
- 2026-05-26 · M3-04 · recharts@3.8.1 (+ react-is@19.2.6 peer dep) for time-series charts; MetricCharts loaded via dynamic(ssr:false) to avoid ResizeObserver SSR; deterministic sin-wave mock time series (fixed epoch 2026-05-26T12:00:00Z) — 24 hourly points (h24) + 28 six-hour points (d7) per series; provider names in leaderboard are now links to /provider/[id].
- 2026-05-26 · M3-05 · hono-rate-limiter@0.5.3 for /v1/* rate limiting (60 req/60 s per IP, Fly-Client-IP header preferred); providers loaded from PROVIDERS_CONFIG_PATH (default config/providers.yaml) at startup with Zod validation; /v1/providers returns YAML registry; /v1/metrics queries raw measurements table (3 parallel queries: latency+uptime 1h, error_rate 5min, freshness 1h; if() wrapping quantileIf to emit NULL instead of NaN); /v1/metrics/:id supports window=1h|24h|7d|30d with bucket-function lookup; dashboard wired to real API via fetchMetrics/fetchProviderTimeSeries with 60 s Next.js revalidation; zod@4.4.3 added to dashboard for NEXT_PUBLIC_API_URL validation in next.config.ts.
- 2026-05-26 · M4-01 · SubscriptionService.SubscribeCheckpoints used for stream probe (subscription_service.proto vendored); stream probe runs as a long-lived background manager alongside the scheduler (one instance per gRPC provider, state scoped per closure); 30 s gap samples via separate GetServiceInfo chain-head call; 1-hour observation window for stream_uptime_pct and stream_disconnects_per_hour; 5 s grace window de-bounces rapid disconnect events; all gRPC providers assumed to support streaming (no config change needed).
- 2026-05-27 · M4-02 · Added Triton One (gRPC-only, sui-mainnet.nodeinfra.com:443 — confirmed HTTP/2 + GetServiceInfo responding); Allnodes skipped (no public gRPC or GraphQL endpoint — only JSON-RPC at publicnode.com which is unsupported); provider count is 4 (not 5) by explicit user decision; probe machines cloned to sin, nrt, lax (new) + fra restarted → 5 active regions: iad, fra, sin, nrt, lax.
- 2026-05-27 · M4-03 · Comparison page at /compare uses URL query params (?p=) for shareable provider selection; leaderboard gains checkbox column + "Compare (N) →" button; one overlay chart per metric (4 charts) with one line per provider; stat cards row shows current snapshot per provider; endpoint type + region + 24h/7d controls on the compare page; provider add/remove via pill UI on the compare page itself.
