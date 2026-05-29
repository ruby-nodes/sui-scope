# SuiScope

**Public benchmarking and observability for Sui infrastructure providers.**

SuiScope continuously probes public gRPC and GraphQL endpoints from multiple geographic regions and publishes comparable, unbiased metrics: latency, freshness, uptime, and error rate.

- **Dashboard:** [suiscope.rubynodes.io](https://suiscope.rubynodes.io)
- **Built by:** [Ruby Nodes](https://rubynodes.io)
- **API docs:** [suiscope.rubynodes.io/api](https://suiscope.rubynodes.io/api)

---

## For providers: get listed on the leaderboard

Listing is free, open, and permanent as long as your endpoint stays publicly accessible. The process is a single pull request — no account required.

### Requirements

| Requirement | Detail |
|---|---|
| **Public endpoint** | No authentication, API keys, or IP-allowlists. Freely reachable from the internet. |
| **Mainnet** | SuiScope benchmarks Sui mainnet only. |
| **At least one endpoint** | gRPC, GraphQL, or both. |
| **Stable URL** | The endpoint must not be for testing or temporary use. |

> **Important:** Only freely accessible public endpoints appear in the leaderboard. Private or authenticated endpoints are out of scope by design.

---

### Step-by-step guide

#### 1. Fork the repository

Click **Fork** on [github.com/ruby-nodes/sui-scope](https://github.com/ruby-nodes/sui-scope) and clone your fork:

```bash
git clone https://github.com/<your-username>/sui-scope.git
cd sui-scope
git checkout -b add-provider-<your-name>
```

#### 2. Edit `config/providers.yaml`

Open [`config/providers.yaml`](config/providers.yaml) and add an entry for your provider at the end of the `providers` list.

**Schema:**

```yaml
- id: your-provider-id        # lowercase, hyphen-separated, stable — used in API responses
  name: "Your Provider Name"  # human-readable display name shown on the dashboard
  grpc: "host:port"           # optional — public gRPC endpoint
  graphql: "https://..."      # optional — public GraphQL endpoint (full URL)
```

- `id` must be **unique** across all providers, URL-safe, and stable. Once published it will appear in API responses and permalink URLs — do not change it later.
- At least one of `grpc` or `graphql` is required.
- For gRPC, use `host:port` without a scheme (e.g. `fullnode.example.com:443`).
- For GraphQL, include the full URL including path (e.g. `https://graphql.example.com/graphql`).

**Example — adding a provider with both endpoints:**

```yaml
providers:
  # ... existing entries ...

  - id: acme-infra
    name: "Acme Infrastructure"
    grpc: "sui-mainnet.acme.io:443"
    graphql: "https://sui-graphql.acme.io/graphql"
```

**Example — gRPC only:**

```yaml
  - id: acme-infra
    name: "Acme Infrastructure"
    grpc: "sui-mainnet.acme.io:443"
```

**Example — GraphQL only:**

```yaml
  - id: acme-infra
    name: "Acme Infrastructure"
    graphql: "https://sui-graphql.acme.io/graphql"
```

#### 3. Verify your endpoints manually

Before opening a PR, confirm your endpoints are live and publicly reachable:

**gRPC** — requires [`grpcurl`](https://github.com/fullstorydev/grpcurl):

```bash
grpcurl -plaintext your-host:443 list
```

**GraphQL:**

```bash
curl -s -X POST https://your-host/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ checkpoint { sequenceNumber } }"}' \
  | jq .
```

Both should return data without authentication errors.

#### 4. Open a pull request

Push your branch and open a PR against `main`:

```bash
git add config/providers.yaml
git commit -m "feat: add <Your Provider Name> to provider registry"
git push origin add-provider-<your-name>
```

Then go to [github.com/ruby-nodes/sui-scope/pulls](https://github.com/ruby-nodes/sui-scope/pulls) and click **New pull request**.

**PR checklist:**
- [ ] `id` is lowercase, hyphen-separated, and not already used
- [ ] At least one of `grpc` or `graphql` is present
- [ ] Endpoint is publicly reachable without authentication
- [ ] Endpoint serves Sui **mainnet**
- [ ] YAML is valid (no trailing commas, correct indentation)

#### 5. Review and merge

We review provider PRs within a few business days. Once merged, your provider will appear on the leaderboard within the next probe cycle (typically within 5 minutes).

---

## Metrics measured

| Metric | Definition |
|---|---|
| **Latency** | Cold TCP connect + TLS + write + time-to-first-response-byte. DNS pre-resolved, excluded. |
| **Freshness** | `chain_head_checkpoint − provider_latest_checkpoint` (lower is better) |
| **Error rate** | Failed probes / total probes, 5-minute rolling window |
| **Uptime** | Successful probes / total probes, 1-hour rolling window |

Full definitions: [suiscope.rubynodes.io/methodology](https://suiscope.rubynodes.io/methodology)

---

## Repository structure

```
sui-scope/
├── packages/
│   ├── probes/       # Regional probe agents (Node.js daemons)
│   ├── api/          # Central metrics API (REST, read-only public)
│   └── dashboard/    # Public dashboard (Next.js)
├── config/
│   ├── providers.yaml  # Provider registry ← edit this to get listed
│   └── regions.yaml    # Probe region definitions
└── docs/
    └── openapi.yaml    # Public API specification
```

---

## Questions

Open an issue at [github.com/ruby-nodes/sui-scope/issues](https://github.com/ruby-nodes/sui-scope/issues) or reach out via [rubynodes.io](https://rubynodes.io).

---

*SuiScope is a neutral, open-source project. It is not affiliated with any infrastructure provider.*
