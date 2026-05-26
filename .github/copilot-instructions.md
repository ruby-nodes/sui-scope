# SuiScope — AI Agent Instructions

## What this project is

SuiScope is a public benchmarking and observability platform for Sui infrastructure providers.
It continuously probes public gRPC, GraphQL, and Archival endpoints from multiple geographic
regions and publishes comparable metrics: latency, freshness, uptime, error rate, and stream
stability. The goal is a neutral, production-grade quality layer for the Sui ecosystem.

This is **not** an explorer, RPC business, or generic status page.

## Repository structure

Pnpm monorepo with Turborepo task orchestration.

```
sui-scope/
├── packages/
│   ├── probes/       # Regional probe agents (Node.js daemons)
│   ├── api/          # Central metrics API (REST, read-only public)
│   └── dashboard/    # Public dashboard (Next.js)
├── config/
│   ├── providers.yaml  # Provider registry (manual, curated)
│   └── regions.yaml    # Probe region definitions
├── .github/
│   ├── copilot-instructions.md  ← you are here
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
├── project.md        # Goals, non-goals, positioning
├── architecture.md   # System design, data model, deployment
├── decisions.md      # Architecture Decision Records (ADRs)
└── tasks.md          # Milestones and current work
```

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5, strict mode, no `any` |
| Monorepo | pnpm workspaces + Turborepo |
| Probes | packages/probes — long-running Node daemons |
| API | packages/api — Hono or Fastify, REST |
| Dashboard | packages/dashboard — Next.js 15, Tailwind v4 |
| Storage | ClickHouse (append-only time-series measurements) |
| Probe deploy | Fly.io (multi-region VMs) |
| Dashboard deploy | Vercel |
| Testing | Vitest |
| Lint/format | ESLint (typescript-eslint flat config) + Prettier |
| Env validation | Zod at startup — fail fast on missing config |

## Coding conventions

- All exported functions and types must be explicitly typed — no inferred `any` on boundaries
- Validate environment variables with Zod at process startup; throw before doing anything else
- Probe cycles must be stateless — no shared mutable state between cycles
- All latency measurements use **cold TCP connections** (reconnect each cycle); document when warm
- Use `pnpm` only — never `npm` or `yarn`
- Co-locate tests with source: `foo.ts` → `foo.test.ts`
- Use `const` assertions and discriminated unions over ad-hoc type casting
- Errors: structured objects with `code` and `message`, never raw `Error.message` strings in API responses

## Measurement definitions (canonical)

These are the source-of-truth definitions. Do not deviate without creating an ADR.

| Metric | Definition |
|---|---|
| **latency_ms** | Cold TCP connect + TLS + write + time-to-first-response-byte. DNS pre-resolved, excluded. |
| **freshness_checkpoints** | `chain_head_checkpoint − provider_latest_checkpoint` (integer, lower is better) |
| **error_rate** | Failed probes / total probes over a 5-minute rolling window |
| **uptime** | Successful probes / total probes over a 1-hour rolling window |
| **stream_uptime_pct** | % of observation window the gRPC subscription was connected |
| **stream_checkpoint_gap** | `chain_head − last_received_via_stream`, sampled every 30 s |
| **stream_disconnects_per_hour** | Unplanned stream terminations; 5 s grace window per event |

## Key constraints

- **Never store provider credentials in the repository.** Keys go in environment variables / Fly secrets.
- Public leaderboard shows only providers with freely accessible public endpoints.
- Probe agents must identify themselves with a User-Agent header: `SuiScope-Probe/<version>`.
- Do not add composite scoring without an ADR — raw metrics only for now.
- Stream metrics and Archival probes are **Phase 2**; do not build them during M1–M2.

## Navigation guide

Before making changes, read:
- `tasks.md` — what milestone is in progress and what is in scope
- `decisions.md` — decisions already made; do not re-open closed ADRs
- `architecture.md` — system design; update it when structural changes are made
- `project.md` — goals and non-goals; keep changes in scope

When completing a task: update `tasks.md` status. When making a significant technical decision:
add an ADR entry to `decisions.md` before implementing.
