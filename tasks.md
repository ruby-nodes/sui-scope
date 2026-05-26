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
| M2-03 | Seed `config/providers.yaml` with initial providers; wire probe scheduler to load config at startup | `[ ]` |
| M2-04 | Implement ClickHouse schema (raw events table + materialized aggregation views) and API ingest endpoint with Zod validation | `[ ]` |
| M2-05 | Deploy probe agents to Fly.io in 2 regions; verify measurements reach ClickHouse | `[ ]` |

---

## M3 · Dashboard MVP
**Goal:** Public leaderboard live with real data; methodology page published. Design must be custom and production-quality.

| ID | Task | Status |
|---|---|---|
| M3-01 | Define design system: colour palette, typography scale, spacing, component primitives (no off-the-shelf theme) | `[ ]` |
| M3-02 | Build leaderboard page: sortable raw metrics table, region and endpoint-type filters | `[ ]` |
| M3-03 | Build methodology page: exact probe definitions, measurement rules, anti-gaming approach | `[ ]` |
| M3-04 | Build provider detail page: per-region metric breakdown, 24 h / 7 d time-series charts | `[ ]` |
| M3-05 | Implement public read API endpoints (`/v1/providers`, `/v1/metrics`, `/v1/metrics/:id`) with rate limiting | `[ ]` |

---

## M4 · Hardening + Stream Metrics
**Goal:** Stream stability metrics live, ≥ 5 providers, 4+ regions, public API documented.

| ID | Task | Status |
|---|---|---|
| M4-01 | Implement gRPC stream probe: `stream_uptime_pct`, `stream_checkpoint_gap` (30 s sample), `stream_disconnects_per_hour` | `[ ]` |
| M4-02 | Expand provider list to ≥ 5; deploy probes to 4+ Fly.io regions | `[ ]` |
| M4-03 | Build comparison page: side-by-side metric charts for 2–4 selected providers | `[ ]` |
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
