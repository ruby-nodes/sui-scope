# Deploying SuiScope to Fly.io

This guide covers a full production deployment: ClickHouse → API → Probes (multi-region).

All commands are run from the **repository root** unless otherwise noted.  
The Fly.io org used in production is **BlockMint**. App names below match the live deployment.

---

## Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated (`fly auth login`)
- `pnpm` installed (`npm install -g pnpm`)
- Repo cloned and dependencies installed (`pnpm install`)

Verify everything builds cleanly before deploying:

```bash
pnpm turbo typecheck lint test
pnpm turbo build
```

---

## Architecture overview

```
probe (iad)  ──┐
probe (fra)  ──┤──► POST /ingest  ──► suiscope-api (iad)  ──► suiscope-clickhouse (iad)
               │                       https://suiscope-api.fly.dev
               │
               └── all traffic stays on Fly's private IPv6 network (.internal hostnames)
```

The three apps must be deployed **in order**: ClickHouse first, then the API, then the probes. The API and probes communicate with ClickHouse exclusively via Fly's private network — ClickHouse is never exposed publicly.

---

## Step 1 — ClickHouse

### 1.1 Create the app and a persistent volume

```bash
fly apps create suiscope-clickhouse

# Volume is pinned to a region — create it in the same region as the machine.
fly volumes create clickhouse_data \
  --app suiscope-clickhouse \
  --region iad \
  --size 10 \
  --yes
```

### 1.2 Set secrets

```bash
fly secrets set \
  CLICKHOUSE_PASSWORD="<strong-random-password>" \
  --app suiscope-clickhouse
```

> **Note:** `CLICKHOUSE_USER=default` and `CLICKHOUSE_DB=suiscope` are plain env vars in `fly/clickhouse.fly.toml` — not secrets. Only the password is sensitive.

### 1.3 Deploy

```bash
fly deploy --config fly/clickhouse.fly.toml
```

ClickHouse is not exposed publicly. The API will reach it at `http://suiscope-clickhouse.internal:8123`.

### 1.4 Apply the schema

Run this **once** after the first deploy. The schema is idempotent (`IF NOT EXISTS`).

```bash
fly ssh console --app suiscope-clickhouse \
  --command "clickhouse-client --database suiscope --multiquery" \
  < packages/api/src/db/schema.sql
```

**Important caveats learned during initial deployment:**

- Pass `--database suiscope` to `clickhouse-client`. Without it, tables are created in the `default` database and the API will fail with `Table suiscope.measurements does not exist`.
- The schema uses `TTL toDateTime(timestamp) + INTERVAL 90 DAY`. ClickHouse 24.x requires a `DateTime` (not `DateTime64`) value in a TTL expression; the cast is already present in the file.

Verify:

```bash
fly ssh console --app suiscope-clickhouse \
  --command "clickhouse-client --query 'SHOW TABLES FROM suiscope'"
```

Expected output:
```
measurements
measurements_1m
measurements_mv
```

---

## Step 2 — API

### 2.1 Create the app

```bash
fly apps create suiscope-api
```

### 2.2 Set secrets

Generate a random string for `INGEST_SECRET` — probes and the API share this value.

```bash
fly secrets set \
  CLICKHOUSE_PASSWORD="<same password as in Step 1.2>" \
  INGEST_SECRET="<random shared secret>" \
  --app suiscope-api
```

### 2.3 Deploy

```bash
fly deploy --config fly/api.fly.toml
```

The API gets a public HTTPS endpoint: `https://suiscope-api.fly.dev`

Verify the health check:

```bash
curl https://suiscope-api.fly.dev/health
# → {"ok":true}
```

### Environment variables reference

| Variable | Where set | Value |
|---|---|---|
| `CLICKHOUSE_URL` | `fly/api.fly.toml` `[env]` | `http://suiscope-clickhouse.internal:8123` |
| `CLICKHOUSE_DATABASE` | `fly/api.fly.toml` `[env]` | `suiscope` |
| `CLICKHOUSE_USERNAME` | `fly/api.fly.toml` `[env]` | `default` |
| `PORT` | `fly/api.fly.toml` `[env]` | `3000` |
| `CLICKHOUSE_PASSWORD` | `fly secrets` | same as ClickHouse Step 1.2 |
| `INGEST_SECRET` | `fly secrets` | random shared secret |

---

## Step 3 — Probes

### 3.1 Create the app

```bash
fly apps create suiscope-probes
```

### 3.2 Set secrets

Use the same `INGEST_SECRET` you set on the API.

```bash
fly secrets set \
  INGEST_URL="http://suiscope-api.internal:3000/ingest" \
  INGEST_SECRET="<same shared secret as API Step 2.2>" \
  --app suiscope-probes
```

> `INGEST_URL` points to the API on the private network, not the public hostname. This keeps probe→API traffic within Fly's encrypted private network and avoids egress costs.

### 3.3 Deploy the first machine (primary region)

```bash
fly deploy --config fly/probes.fly.toml
```

This creates one app machine in `iad` (primary region defined in `fly/probes.fly.toml`).

### 3.4 Add a second region by cloning

```bash
# Get the ID of the running app machine
fly machine list --app suiscope-probes

# Clone it into Frankfurt
fly machine clone <machine-id> --app suiscope-probes --region fra
```

The cloned machine inherits all secrets and the same Docker image. No additional secret-setting is needed.

> **If a cloned machine shows `stopped` immediately**, start it manually:
> ```bash
> fly machine start <cloned-machine-id> --app suiscope-probes
> ```
> This can happen if the machine was cloned before the ClickHouse schema was applied (probes emit HTTP 500 from the API but do not crash — the probe process stays up). Once the schema is in place, subsequent starts succeed.

### 3.5 Verify data is flowing

Wait ~75 seconds (one full probe cycle) then query ClickHouse:

```bash
fly ssh console --app suiscope-clickhouse \
  --command "clickhouse-client --query \
    'SELECT count(), region, min(timestamp), max(timestamp) \
     FROM suiscope.measurements \
     GROUP BY region ORDER BY region'"
```

Expected output (one row per active region):

```
22    fra    2026-05-26 12:14:30    2026-05-26 12:15:30
33    iad    2026-05-26 12:13:31    2026-05-26 12:15:31
```

### Environment variables reference

| Variable | Where set | Value |
|---|---|---|
| `PROBE_INTERVAL_MS` | `fly/probes.fly.toml` `[env]` | `60000` (ms) |
| `REGION` | auto-detected | Falls back to `FLY_REGION` (see below) |
| `INGEST_URL` | `fly secrets` | `http://suiscope-api.internal:3000/ingest` |
| `INGEST_SECRET` | `fly secrets` | same as API Step 2.2 |

#### REGION / FLY_REGION fallback

Fly.io automatically injects `FLY_REGION` into every machine with the two-letter region code (`iad`, `fra`, etc.). The probe config loader merges this as a fallback:

```
const merged = { REGION: env.FLY_REGION, ...env };
return EnvSchema.parse(merged);
```

This means:
- You **do not** need to set `REGION` manually when deploying on Fly.io.
- Each cloned machine reports its own region automatically in every emitted measurement.
- In local development, set `REGION=local` (or any string) in `.env`.

---

## Adding more probe regions

Each additional region requires one `fly machine clone` command:

```bash
fly machine clone <existing-machine-id> --app suiscope-probes --region <region-code>
```

Available Fly.io regions: `iad` (Virginia), `fra` (Frankfurt), `sin` (Singapore), `syd` (Sydney), `nrt` (Tokyo), `lax` (Los Angeles), and [more](https://fly.io/docs/reference/regions/).

No redeployment of ClickHouse or the API is needed — they are region-agnostic.

---

## Updating a deployment

### Code changes (probes or API)

Rebuild and redeploy the affected app:

```bash
# API
fly deploy --config fly/api.fly.toml

# Probes — redeploys all machines in all regions simultaneously
fly deploy --config fly/probes.fly.toml
```

### Schema changes

Connect to ClickHouse and run the migration manually. ClickHouse does not support transactions, so test DDL changes on a non-production instance first.

### Rotating secrets

```bash
fly secrets set INGEST_SECRET="<new-value>" --app suiscope-api
fly secrets set INGEST_SECRET="<new-value>" --app suiscope-probes
```

Fly restarts affected machines automatically after a `secrets set`.

---

## Fly.io config files

| File | App | Purpose |
|---|---|---|
| `fly/clickhouse.fly.toml` | `suiscope-clickhouse` | ClickHouse 24.12-alpine, private-only, 2 GB RAM, persistent volume |
| `fly/api.fly.toml` | `suiscope-api` | Hono API, public HTTPS, 512 MB RAM, health check on `GET /health` |
| `fly/probes.fly.toml` | `suiscope-probes` | Probe daemon, no HTTP service, 256 MB RAM |

All `fly deploy` commands must be run from the **repository root** because the Dockerfiles use `../` relative paths to include `packages/` and `config/` in the build context.

---

## Troubleshooting

### `Table suiscope.measurements does not exist`

The API schema was applied without `--database suiscope`. Re-run:

```bash
fly ssh console --app suiscope-clickhouse \
  --command "clickhouse-client --database suiscope --multiquery" \
  < packages/api/src/db/schema.sql
```

### `[emit] ingest responded with HTTP 500`

Seen in probe logs when the ClickHouse schema doesn't exist yet. The probe does not crash — it logs the error and retries on the next cycle. Apply the schema (see Step 1.4) and errors will resolve automatically.

### Probe machine stops immediately after clone

Start it manually once:

```bash
fly machine start <machine-id> --app suiscope-probes
```

### Verify API → ClickHouse connectivity from the probe machine

```bash
fly ssh console --app suiscope-probes --machine <id> \
  --command "wget -q -O- http://suiscope-api.internal:3000/health"
# → {"ok":true}
```

### Check live probe logs

```bash
fly logs --app suiscope-probes --no-tail
fly logs --app suiscope-api --no-tail
```
