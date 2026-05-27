# SuiScope — Architecture

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Regional Probe Agents                      │
│  us-east (iad) · eu-west (fra) · ap-singapore (sin) ·          │
│  ap-northeast (nrt) · us-west (lax)                            │
│   Stateless probe cycles — one cold connection per measurement  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP POST  /ingest  (internal)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API Server                             │
│               packages/api  ·  Hono  ·  Node.js 22             │
│   /ingest (write, internal)   /v1/* (read, public, rate-limited)│
└───────────────┬──────────────────────────────┬─────────────────┘
                │ writes                        │ reads
                ▼                               ▼
┌───────────────────────┐            ┌──────────────────────────┐
│      ClickHouse       │            │       Dashboard           │
│  append-only events   │            │  packages/dashboard       │
│  pre-aggregated views │            │  Next.js 16 · Tailwind v4 │
└───────────────────────┘            └──────────────────────────┘
```

---

## Packages

### `packages/probes`

Long-running Node.js daemon deployed per region on Fly.io.

**Responsibilities:**
- Load provider list from `config/providers.yaml` at startup
- Run probe cycles on a fixed schedule (see timing below)
- Emit structured measurement events to the API ingest endpoint
- Identify itself with `User-Agent: SuiScope-Probe/<version>`

**Probe cycle (per provider per endpoint):**
1. Pre-resolve DNS (excluded from latency)
2. Open a cold TCP + TLS connection
3. Send request (gRPC unary or HTTP POST for GraphQL)
4. Record time-to-first-response-byte → `latency_ms`
5. Parse response, extract `latest_checkpoint` → compute `freshness_checkpoints` against chain head
6. Record success/failure and `error_type` if failed
7. Close connection

**Probe timing:**

| Metric | Interval |
|---|---|
| Latency + freshness | 60 s |
| Error rate (rolling) | derived from above |
| Uptime (rolling) | derived from above |
| Stream checkpoint gap | sampled every 30 s |
| Stream uptime + disconnects | emitted every 1 hour (window reset) |

**No shared mutable state between scheduler cycles.** Each cycle reads config, probes, emits, and exits.

**Stream probe:** runs as a long-lived background manager alongside the scheduler (one instance per gRPC provider). Uses `SubscriptionService.SubscribeCheckpoints` from the Sui v2 gRPC API (`subscription_service.proto`). Reconnects automatically on disconnect; applies a 5 s grace window when counting disconnect events. State is scoped per-provider to each `startStreamProbe()` closure — not shared across providers.

---

### `packages/api`

Hono server on Node.js 22. Two surface areas:

**Internal ingest (not public):**
- `POST /ingest` — accepts measurement events from probes, writes to ClickHouse
- Authenticated with a shared secret (env var, never in repo)
- Validates payload with Zod before writing

**Public read API (rate-limited, no auth):**
- `GET /v1/providers` — list of all providers
- `GET /v1/metrics` — latest aggregated metrics per provider + region
- `GET /v1/metrics/{provider}` — per-provider time-series (supports `?window=1h|24h|7d|30d`)
- Returns JSON only, no GraphQL, no websockets

---

### `packages/dashboard`

Next.js 16 app deployed on Vercel. All data fetched from the public API.

**Pages:**
- `/` — Leaderboard (sortable metrics table, all providers, filter by region/endpoint)
- `/provider/[id]` — Provider detail (per-region breakdown, time-series charts)
- `/compare` — Side-by-side comparison of 2–4 providers
- `/methodology` — Exact probe definitions, measurement rules, anti-gaming approach

No auth. No user accounts. Read-only.

---

## Data model

### Measurement event (raw, append-only)

```typescript
type MeasurementEvent = {
  provider_id: string;         // e.g. "shinami"
  region: string;              // e.g. "us-east-1"
  endpoint_type: "grpc" | "graphql" | "archival";
  metric: "latency_ms" | "freshness_checkpoints" | "stream_checkpoint_gap";
  value: number;
  success: boolean;
  error_type: string | null;   // "timeout" | "connection_refused" | "invalid_response" | null
  probe_version: string;
  timestamp: number;           // unix ms
};
```

### Aggregated views (materialized in ClickHouse)

- `latency_p50`, `latency_p90`, `latency_p99` — per provider, region, window
- `error_rate` — failed / total over rolling 5-minute window
- `uptime` — successful / total over rolling 1-hour window
- `freshness_avg` — average `freshness_checkpoints` over window

---

## Config files

### `config/providers.yaml`

Manual, curated list. Only providers with freely accessible public endpoints are listed.

```yaml
providers:
  - id: mysten-labs
    name: Mysten Labs
    endpoints:
      grpc: fullnode.mainnet.sui.io:443
      graphql: https://sui-mainnet.mystenlabs.com/graphql
    regions: [us-east-1, eu-west-1, ap-southeast-1]
```

### `config/regions.yaml`

Fly.io region codes and human-readable names for the regions where probes are deployed.

---

## Deployment topology

| Component | Platform | Notes |
|---|---|---|
| Probe agents | Fly.io (one Machine per region) | Deployed from `packages/probes` |
| API server | Fly.io (single region, auto-scaled) | Internal + public surface |
| ClickHouse | Fly.io (single region) or managed | Single node is fine for MVP |
| Dashboard | Vercel | Static + ISR, fetches public API |

---

## Security model

- Probe → API communication uses a shared secret in the `Authorization` header (env var / Fly secret)
- Public API is read-only, rate-limited by IP, no auth required
- Provider credentials (if any are ever needed) go in Fly secrets only — never in the repo
- No user data is collected — no cookies, no tracking, no accounts
