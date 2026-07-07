import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageContainer, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "API Reference",
  description:
    "Public REST API reference for SuiScope: endpoints, parameters, response schemas, and examples.",
};

// ─── Design helpers ───────────────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <SectionHeading as="h2" className="mb-4">
        {title}
      </SectionHeading>
      <div className="space-y-4 text-text-secondary leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function EndpointBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold bg-accent-dim text-accent">
      {method}
    </span>
  );
}

function EndpointBlock({
  method,
  path,
  summary,
  children,
}: {
  method: "GET" | "POST";
  path: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-surface px-4 py-3">
        <EndpointBadge method={method} />
        <code className="font-mono text-sm text-text-primary">{path}</code>
        <span className="text-sm text-text-muted">{summary}</span>
      </div>
      {/* Body */}
      <div className="space-y-4 px-4 py-4 bg-bg-base text-sm">{children}</div>
    </div>
  );
}

function ParamTable({
  rows,
}: {
  rows: Array<{
    name: string;
    in: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-surface">
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Name
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              In
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Type
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.name}
              className={i < rows.length - 1 ? "border-b border-border-subtle" : ""}
            >
              <td className="px-3 py-2.5 whitespace-nowrap">
                <code className="font-mono text-accent text-xs">{row.name}</code>
                {row.required && (
                  <span className="ml-1.5 text-tier-poor text-xs">*</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-text-muted text-xs">{row.in}</td>
              <td className="px-3 py-2.5 font-mono text-text-secondary text-xs whitespace-nowrap">
                {row.type}
              </td>
              <td className="px-3 py-2.5 text-text-secondary">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponseBlock({
  status,
  description,
  children,
}: {
  status: number;
  description: string;
  children: ReactNode;
}) {
  const statusColor =
    status >= 500
      ? "text-tier-poor"
      : status >= 400
        ? "text-tier-degraded"
        : "text-tier-good";

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-text-muted">
        <span className={`font-mono font-semibold ${statusColor}`}>
          {status}
        </span>{" "}
        {description}
      </p>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-border bg-bg-surface px-4 py-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre">
      {children}
    </pre>
  );
}

function FieldTable({
  rows,
}: {
  rows: Array<{ field: string; type: string; description: string }>;
}) {
  return (
    <div className="overflow-hidden rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-surface">
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Field
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Type
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.field}
              className={i < rows.length - 1 ? "border-b border-border-subtle" : ""}
            >
              <td className="px-3 py-2.5 whitespace-nowrap">
                <code className="font-mono text-accent text-xs">{row.field}</code>
              </td>
              <td className="px-3 py-2.5 font-mono text-text-secondary text-xs whitespace-nowrap">
                {row.type}
              </td>
              <td className="px-3 py-2.5 text-text-secondary">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ToC ──────────────────────────────────────────────────────────────────────

const TOC: Array<{ href: string; label: string }> = [
  { href: "#overview", label: "Overview" },
  { href: "#rate-limits", label: "Rate limits" },
  { href: "#errors", label: "Errors" },
  { href: "#providers", label: "GET /v1/providers" },
  { href: "#metrics", label: "GET /v1/metrics" },
  { href: "#metrics-id", label: "GET /v1/metrics/:id" },
  { href: "#openapi", label: "OpenAPI spec" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiReferencePage() {
  return (
    <PageContainer>
      <div className="mb-8">
        <SectionHeading as="h1">API Reference</SectionHeading>
        <p className="mt-2 text-text-secondary">
          Read-only public REST API for SuiScope benchmark data. No
          authentication required.
        </p>
        <p className="mt-1 font-mono text-sm text-text-muted">
          Base URL:{" "}
          <span className="text-accent">https://scope.rubynodes.io</span>
        </p>
      </div>

      <div className="flex gap-10 lg:gap-16">
        {/* Sticky ToC */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              On this page
            </p>
            {TOC.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="block rounded px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
              >
                {label}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-12">

          {/* ── Overview ─────────────────────────────────────────── */}
          <Section id="overview" title="Overview">
            <p>
              All API responses are JSON. Every endpoint is publicly accessible
              — no API key or OAuth token is required. The API serves
              pre-aggregated benchmark data collected by SuiScope probe agents
              running in five geographic regions.
            </p>
            <p>
              Timestamps are Unix milliseconds (integer). Latency values are
              floating-point milliseconds. Fractions such as{" "}
              <code className="font-mono text-sm text-accent">uptime</code> and{" "}
              <code className="font-mono text-sm text-accent">error_rate</code>{" "}
              are in the range 0–1. A{" "}
              <code className="font-mono text-sm text-accent">null</code> value
              means no data was recorded for that window (e.g. the provider was
              not tracked yet or was entirely offline).
            </p>
          </Section>

          {/* ── Rate limits ───────────────────────────────────────── */}
          <Section id="rate-limits" title="Rate limits">
            <p>
              60 requests per 60 seconds per IP address. Rate-limit headers are
              included on every response per{" "}
              <span className="font-mono text-sm text-accent">
                IETF draft-ietf-httpapi-ratelimit-headers-06
              </span>
              :
            </p>
            <FieldTable
              rows={[
                {
                  field: "RateLimit-Limit",
                  type: "integer",
                  description: "Maximum requests allowed in the current window.",
                },
                {
                  field: "RateLimit-Remaining",
                  type: "integer",
                  description: "Requests remaining in the current window.",
                },
                {
                  field: "RateLimit-Reset",
                  type: "integer (seconds)",
                  description: "Seconds until the current window resets.",
                },
              ]}
            />
            <p>
              When the limit is exceeded the API returns{" "}
              <span className="font-mono text-sm text-accent">429</span> with a
              JSON error body.
            </p>
          </Section>

          {/* ── Errors ────────────────────────────────────────────── */}
          <Section id="errors" title="Errors">
            <p>
              All error responses share a common shape regardless of HTTP status
              code:
            </p>
            <FieldTable
              rows={[
                {
                  field: "code",
                  type: "string",
                  description:
                    'Machine-readable error token. Examples: "not_found", "bad_request", "rate_limited", "internal_error".',
                },
                {
                  field: "message",
                  type: "string",
                  description: "Human-readable explanation.",
                },
              ]}
            />
            <CodeBlock>{`// Example 404
{
  "code": "not_found",
  "message": "Provider \\"unknown-id\\" not found"
}

// Example 400
{
  "code": "bad_request",
  "message": "Invalid window \\"2h\\". Valid values: 1h, 24h, 7d, 30d"
}`}</CodeBlock>
          </Section>

          {/* ── GET /v1/providers ─────────────────────────────────── */}
          <Section id="providers" title="GET /v1/providers">
            <EndpointBlock
              method="GET"
              path="/v1/providers"
              summary="List all providers"
            >
              <p className="text-text-secondary">
                Returns every provider in the curated registry. Public providers
                include endpoint addresses; private providers omit URLs.
              </p>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Responses
                </p>
                <ResponseBlock status={200} description="OK">
                  <FieldTable
                    rows={[
                      {
                        field: "providers",
                        type: "Provider[]",
                        description: "Ordered list of registered providers.",
                      },
                    ]}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Provider object fields:
                  </p>
                  <FieldTable
                    rows={[
                      {
                        field: "id",
                        type: "string",
                        description:
                          "Stable identifier — use this as the path parameter in /v1/metrics/:id.",
                      },
                      {
                        field: "name",
                        type: "string",
                        description: "Human-readable display name.",
                      },
                      {
                        field: "public",
                        type: "boolean",
                        description:
                          "Whether endpoint URLs are publicly accessible and included in this response.",
                      },
                      {
                        field: "endpoint_types",
                        type: "string[]",
                        description:
                          "Configured endpoint categories: grpc, graphql, and/or archival.",
                      },
                      {
                        field: "regions",
                        type: "string[]?",
                        description:
                          "Fly.io probe region allowlist. Absent means all deployed probe regions.",
                      },
                      {
                        field: "grpc",
                        type: "string?",
                        description:
                          'Public gRPC endpoint as "host:port". Absent if the provider does not expose gRPC.',
                      },
                      {
                        field: "graphql",
                        type: "string?",
                        description:
                          "Public GraphQL endpoint URL. Absent if the provider does not expose GraphQL.",
                      },
                      {
                        field: "archival",
                        type: "string?",
                        description:
                          'Public archival gRPC endpoint as "host:port". Absent if the provider does not expose archival.',
                      },
                    ]}
                  />
                  <CodeBlock>{`GET /v1/providers

{
  "providers": [
    {
      "id": "mysten",
      "name": "Mysten Labs",
      "public": true,
      "endpoint_types": ["grpc", "graphql", "archival"],
      "grpc": "fullnode.mainnet.sui.io:443",
      "graphql": "https://sui-mainnet.mystenlabs.com/graphql",
      "archival": "archive.mainnet.sui.io:443"
    },
    {
      "id": "ankr",
      "name": "Ankr",
      "public": true,
      "endpoint_types": ["grpc", "graphql"],
      "grpc": "sui.grpc.ankr.com:443",
      "graphql": "https://rpc.ankr.com/sui/graphql"
    },
    {
      "id": "regional-provider",
      "name": "Regional Provider",
      "public": true,
      "endpoint_types": ["grpc"],
      "regions": ["iad", "fra"],
      "grpc": "sui.example.com:443"
    }
  ]
}`}</CodeBlock>
                </ResponseBlock>
              </div>
            </EndpointBlock>
          </Section>

          {/* ── GET /v1/metrics ───────────────────────────────────── */}
          <Section id="metrics" title="GET /v1/metrics">
            <EndpointBlock
              method="GET"
              path="/v1/metrics"
              summary="Latest aggregated metrics for all providers"
            >
              <p className="text-text-secondary">
                Returns one row per{" "}
                <code className="font-mono text-sm text-accent">
                  (provider_id, region, endpoint_type)
                </code>{" "}
                tuple, computed over rolling windows:
              </p>
              <FieldTable
                rows={[
                  {
                    field: "latency_p50/p90/p99",
                    type: "number? ms",
                    description: "Cold-connection latency percentiles — 1-hour rolling window.",
                  },
                  {
                    field: "uptime",
                    type: "number? 0–1",
                    description: "Fraction of successful probes — 1-hour rolling window.",
                  },
                  {
                    field: "error_rate",
                    type: "number? 0–1",
                    description: "Fraction of failed probes — 5-minute rolling window.",
                  },
                  {
                    field: "freshness_avg",
                    type: "number?",
                    description:
                      "Average checkpoint lag (chain_head − provider_latest) — 1-hour rolling window. Lower is better.",
                  },
                ]}
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Responses
                </p>
                <ResponseBlock status={200} description="OK">
                  <FieldTable
                    rows={[
                      {
                        field: "metrics",
                        type: "MetricRow[]",
                        description:
                          "One row per (provider_id, region, endpoint_type).",
                      },
                      {
                        field: "generated_at",
                        type: "integer (ms)",
                        description:
                          "Unix timestamp in milliseconds when this response was generated.",
                      },
                    ]}
                  />
                  <CodeBlock>{`GET /v1/metrics

{
  "generated_at": 1748383200000,
  "metrics": [
    {
      "provider_id": "mysten",
      "provider_name": "Mysten Labs",
      "region": "iad",
      "endpoint_type": "grpc",
      "latency_p50": 42.1,
      "latency_p90": 68.4,
      "latency_p99": 110.2,
      "freshness_avg": 0.8,
      "uptime": 0.999,
      "error_rate": 0.001
    }
  ]
}`}</CodeBlock>
                </ResponseBlock>
                <ResponseBlock status={503} description="ClickHouse query failed">
                  <CodeBlock>{`{ "code": "internal_error", "message": "Failed to query metrics" }`}</CodeBlock>
                </ResponseBlock>
              </div>
            </EndpointBlock>
          </Section>

          {/* ── GET /v1/metrics/:id ───────────────────────────────── */}
          <Section id="metrics-id" title="GET /v1/metrics/:id">
            <EndpointBlock
              method="GET"
              path="/v1/metrics/{provider}"
              summary="Time-series for one provider"
            >
              <p className="text-text-secondary">
                Returns bucketed time-series across all regions and endpoint
                types the provider exposes.
              </p>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Parameters
                </p>
                <ParamTable
                  rows={[
                    {
                      name: "provider",
                      in: "path",
                      type: "string",
                      required: true,
                      description: "Provider ID from /v1/providers.",
                    },
                    {
                      name: "window",
                      in: "query",
                      type: "1h | 24h | 7d | 30d",
                      required: false,
                      description: "Time window. Default: 24h.",
                    },
                  ]}
                />
              </div>

              <div className="overflow-hidden rounded border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg-surface">
                      <th className="px-3 py-2 text-left font-medium text-text-muted">
                        window
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-text-muted">
                        Bucket size
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-text-muted">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["1h", "5 minutes", "≤12"],
                        ["24h", "1 hour", "≤24"],
                        ["7d", "6 hours", "≤28"],
                        ["30d", "1 day", "≤30"],
                      ] as const
                    ).map(([w, b, p], i) => (
                      <tr
                        key={w}
                        className={i < 3 ? "border-b border-border-subtle" : ""}
                      >
                        <td className="px-3 py-2.5 font-mono text-accent text-xs">
                          {w}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary text-xs">{b}</td>
                        <td className="px-3 py-2.5 text-text-muted text-xs">{p}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Responses
                </p>
                <ResponseBlock status={200} description="OK">
                  <FieldTable
                    rows={[
                      {
                        field: "provider_id",
                        type: "string",
                        description: "Provider identifier.",
                      },
                      {
                        field: "provider_name",
                        type: "string",
                        description: "Display name.",
                      },
                      {
                        field: "window",
                        type: "string",
                        description: "The window used for this response.",
                      },
                      {
                        field: "series",
                        type: "Series[]",
                        description:
                          "One entry per (region, endpoint_type) combination. Each series contains an ordered array of time-bucketed points.",
                      },
                    ]}
                  />
                  <CodeBlock>{`GET /v1/metrics/mysten?window=24h

{
  "provider_id": "mysten",
  "provider_name": "Mysten Labs",
  "window": "24h",
  "series": [
    {
      "region": "iad",
      "endpoint_type": "grpc",
      "points": [
        {
          "timestamp": 1748296800000,
          "latency_p50": 41.3,
          "latency_p90": 65.2,
          "latency_p99": 104.0,
          "freshness_avg": 0.7,
          "uptime": 1.0,
          "error_rate": 0.0
        }
      ]
    }
  ]
}`}</CodeBlock>
                </ResponseBlock>
                <ResponseBlock status={400} description="Invalid window parameter">
                  <CodeBlock>{`{ "code": "bad_request", "message": "Invalid window \\"2h\\". Valid values: 1h, 24h, 7d, 30d" }`}</CodeBlock>
                </ResponseBlock>
                <ResponseBlock status={404} description="Provider not found">
                  <CodeBlock>{`{ "code": "not_found", "message": "Provider \\"unknown-id\\" not found" }`}</CodeBlock>
                </ResponseBlock>
                <ResponseBlock status={503} description="ClickHouse query failed">
                  <CodeBlock>{`{ "code": "internal_error", "message": "Failed to query time series" }`}</CodeBlock>
                </ResponseBlock>
              </div>
            </EndpointBlock>
          </Section>

          {/* ── OpenAPI spec ──────────────────────────────────────── */}
          <Section id="openapi" title="OpenAPI spec">
            <p>
              A machine-readable OpenAPI 3.1 specification is available for
              client generation and tooling:
            </p>
            <a
              href="https://github.com/ruby-nodes/sui-scope/blob/main/docs/openapi.yaml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-surface px-3 py-2 text-sm text-accent transition-colors hover:bg-bg-raised hover:border-accent/40"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0 fill-current"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              docs/openapi.yaml
            </a>
            <p className="text-sm text-text-muted">
              The spec covers all three public endpoints with full schema
              definitions, annotated examples, and error responses. Use it with
              any OpenAPI-compatible tool (Swagger UI, Redoc, openapi-generator,
              etc.).
            </p>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
