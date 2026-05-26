import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageContainer, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How SuiScope probes Sui infrastructure providers: exact measurement definitions, probe mechanics, and anti-gaming approach.",
};

/* ── Small layout helpers ──────────────────────────────────────────── */

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

function SubSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DefinitionTable({
  rows,
}: {
  rows: Array<{ metric: string; definition: string; unit: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-surface">
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">
              Metric
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">
              Definition
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">
              Unit
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.metric}
              className={`${i < rows.length - 1 ? "border-b border-border-subtle" : ""}`}
            >
              <td className="px-4 py-3 font-mono text-accent whitespace-nowrap">
                {row.metric}
              </td>
              <td className="px-4 py-3 text-text-secondary">{row.definition}</td>
              <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                {row.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-dim font-mono text-xs font-semibold text-accent">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function CalloutBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-accent/20 bg-accent-dim/30 px-4 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">
        {title}
      </p>
      <div className="text-sm text-text-secondary space-y-1">{children}</div>
    </div>
  );
}

/* ── Table of contents ─────────────────────────────────────────────── */

const TOC: Array<{ href: string; label: string }> = [
  { href: "#overview", label: "Overview" },
  { href: "#probe-cycle", label: "Probe cycle" },
  { href: "#metrics", label: "Metric definitions" },
  { href: "#tier-thresholds", label: "Tier thresholds" },
  { href: "#anti-gaming", label: "Anti-gaming approach" },
  { href: "#scope", label: "What is not measured" },
];

/* ── Page ──────────────────────────────────────────────────────────── */

export default function MethodologyPage() {
  return (
    <PageContainer>
      <div className="mb-8">
        <SectionHeading as="h1">Methodology</SectionHeading>
        <p className="mt-2 text-text-secondary">
          Exact definitions for every metric shown on the leaderboard. The goal
          is a transparent, reproducible benchmark that any operator can
          independently verify.
        </p>
      </div>

      {/* Two-column layout: ToC sidebar + content */}
      <div className="flex gap-10 lg:gap-16">
        {/* Sticky ToC — hidden on small screens */}
        <aside className="hidden lg:block w-44 shrink-0">
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

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-12">
          {/* ── Overview ───────────────────────────────────────────── */}
          <Section id="overview" title="Overview">
            <p>
              SuiScope is a continuous, neutral benchmarking platform for
              public Sui infrastructure endpoints. Probes run as stateless
              agents deployed across multiple geographic regions and fire on a
              fixed 60-second schedule. Every probe cycle produces one
              measurement event per provider per endpoint type; results are
              stored in ClickHouse and exposed through a read-only public API.
            </p>
            <p>
              SuiScope measures what a client actually experiences: the
              round-trip cost of a cold TCP connection, TLS handshake, request
              encoding, network transit, server processing, and time to first
              response byte. It does not simulate internal server behaviour or
              measure capacity under load.
            </p>
          </Section>

          {/* ── Probe cycle ────────────────────────────────────────── */}
          <Section id="probe-cycle" title="Probe cycle">
            <p>
              Each probe cycle for a given provider and endpoint type follows
              these steps in strict order:
            </p>
            <StepList
              steps={[
                "DNS resolution — the target hostname is resolved once before the timing window opens. DNS time is excluded from all latency measurements.",
                "Open a new TCP connection — no connection pooling, no keep-alive reuse. Each probe cycle establishes a fresh socket from scratch.",
                "TLS handshake — for TLS endpoints the full handshake is included in the latency measurement.",
                "Send request — for gRPC endpoints a GetServiceInfo unary call (sui.rpc.v2.LedgerService); for GraphQL endpoints an HTTP POST with query { checkpoint { sequenceNumber } }.",
                "Record time-to-first-response-byte (TTFB) — the timer starts at the moment the first byte of the request is sent over the wire and stops when the first byte of the response is received. This is latency_ms.",
                "Parse response — extract the provider's latest checkpoint sequence number.",
                "Fetch chain head — a separate cold-connection call to a trusted Mysten Labs reference endpoint (fullnode.mainnet.sui.io) retrieves the current chain head checkpoint. This call is made inside the same probe cycle and is not cached across cycles.",
                "Compute freshness — freshness_checkpoints = chain_head − provider_latest_checkpoint. A value of 0 means the provider is at the head of the chain.",
                "Record outcome — success or failure, with a structured error code if failed.",
                "Close connection — the socket is closed. No state is retained between probe cycles.",
              ]}
            />

            <SubSection title="Probe timing">
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg-surface">
                      <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                        Measurement
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                        Interval
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                        Derivation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        m: "Latency + freshness",
                        i: "60 s",
                        d: "Direct measurement per cycle",
                      },
                      {
                        m: "Error rate",
                        i: "Derived",
                        d: "Failed / total over 5-minute rolling window",
                      },
                      {
                        m: "Uptime",
                        i: "Derived",
                        d: "Successful / total over 1-hour rolling window",
                      },
                    ].map((row, idx, arr) => (
                      <tr
                        key={row.m}
                        className={idx < arr.length - 1 ? "border-b border-border-subtle" : ""}
                      >
                        <td className="px-4 py-3 font-mono text-accent">
                          {row.m}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {row.i}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {row.d}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SubSection>

            <SubSection title="Endpoint types">
              <p>
                Each provider may expose gRPC and/or GraphQL endpoints. Probes
                run independently for each endpoint type. If a provider
                exposes both, both appear as separate rows in the leaderboard.
              </p>
            </SubSection>
          </Section>

          {/* ── Metric definitions ─────────────────────────────────── */}
          <Section id="metrics" title="Metric definitions">
            <p>
              These definitions are canonical. The dashboard, API, and probes
              all use exactly these semantics. Any deviation requires an
              Architecture Decision Record.
            </p>
            <DefinitionTable
              rows={[
                {
                  metric: "latency_ms",
                  definition:
                    "Cold TCP connect + TLS handshake + request write + time to first response byte. DNS pre-resolved and excluded.",
                  unit: "milliseconds",
                },
                {
                  metric: "freshness_checkpoints",
                  definition:
                    "chain_head_checkpoint − provider_latest_checkpoint. Integer lag; 0 means at chain head. Lower is better.",
                  unit: "checkpoints",
                },
                {
                  metric: "error_rate",
                  definition:
                    "Failed probes ÷ total probes over a 5-minute rolling window. A probe fails if no valid response is received within 10 seconds.",
                  unit: "ratio (0–1)",
                },
                {
                  metric: "uptime",
                  definition:
                    "Successful probes ÷ total probes over a 1-hour rolling window.",
                  unit: "ratio (0–1)",
                },
              ]}
            />
          </Section>

          {/* ── Tier thresholds ────────────────────────────────────── */}
          <Section id="tier-thresholds" title="Tier thresholds">
            <p>
              Each metric value is classified into a display tier for the
              leaderboard. Thresholds reflect real-world client expectations
              for production Sui infrastructure.
            </p>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-surface">
                    <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                      Metric
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                      <span className="text-tier-good">Good</span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                      <span className="text-tier-degraded">Degraded</span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-text-muted">
                      <span className="text-tier-poor">Poor</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      metric: "latency_ms",
                      good: "< 100 ms",
                      degraded: "100 – 300 ms",
                      poor: "≥ 300 ms",
                    },
                    {
                      metric: "freshness_checkpoints",
                      good: "≤ 2",
                      degraded: "3 – 10",
                      poor: "> 10",
                    },
                    {
                      metric: "uptime",
                      good: "≥ 99.5 %",
                      degraded: "98 – 99.5 %",
                      poor: "< 98 %",
                    },
                    {
                      metric: "error_rate",
                      good: "< 0.5 %",
                      degraded: "0.5 – 5 %",
                      poor: "≥ 5 %",
                    },
                  ].map((row, idx, arr) => (
                    <tr
                      key={row.metric}
                      className={idx < arr.length - 1 ? "border-b border-border-subtle" : ""}
                    >
                      <td className="px-4 py-3 font-mono text-accent">
                        {row.metric}
                      </td>
                      <td className="px-4 py-3 text-tier-good">{row.good}</td>
                      <td className="px-4 py-3 text-tier-degraded">
                        {row.degraded}
                      </td>
                      <td className="px-4 py-3 text-tier-poor">{row.poor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Anti-gaming approach ───────────────────────────────── */}
          <Section id="anti-gaming" title="Anti-gaming approach">
            <p>
              A benchmarking platform is only useful if its results cannot be
              artificially inflated. The following design choices make it
              structurally difficult for a provider to perform well on
              SuiScope without actually providing a fast, reliable service to
              real clients.
            </p>

            <SubSection title="Cold TCP connections">
              <p>
                Every probe opens a fresh TCP socket. There is no connection
                reuse, no keep-alive, and no HTTP/2 or gRPC multiplexing
                across cycles. This means a provider cannot benefit from a
                warm connection pool — each measurement reflects the full
                connection-establishment cost a cold client would pay.
              </p>
            </SubSection>

            <SubSection title="Opaque probe timing">
              <p>
                Probe cycles fire on a fixed 60-second schedule, but the exact
                wall-clock start time within that window is not published. A
                provider that attempted to pre-warm connections or cache
                responses for expected probe traffic would need to do so
                continuously — indistinguishable from simply running a
                well-maintained service.
              </p>
            </SubSection>

            <SubSection title="Transparent User-Agent">
              <p>
                All probe requests carry the header{" "}
                <code className="rounded bg-bg-raised px-1 py-0.5 font-mono text-xs text-accent">
                  User-Agent: SuiScope-Probe/&lt;version&gt;
                </code>
                . Providers can see probe traffic in their own logs. This is
                intentional: SuiScope is a neutral observer, not a secret
                auditor. However, a provider that routes SuiScope traffic to
                faster infrastructure must apply those same optimisations
                globally — there is no practical way to identify only probe
                requests in production traffic without also improving service
                for real clients.
              </p>
            </SubSection>

            <SubSection title="DNS excluded; network path not controlled">
              <p>
                DNS resolution is excluded from latency to avoid penalising
                providers for slow DNS propagation. However, the network path
                from each probe region to the provider endpoint is not
                controlled or disclosed. Providers cannot selectively optimise
                routing for probe source IPs without deploying equivalent
                improvements for all traffic from those regions.
              </p>
            </SubSection>

            <SubSection title="Independent chain-head reference">
              <p>
                Freshness is calculated against the chain head observed from
                Mysten Labs&rsquo; reference endpoint (
                <code className="rounded bg-bg-raised px-1 py-0.5 font-mono text-xs text-accent">
                  fullnode.mainnet.sui.io
                </code>
                ) within the same probe cycle. This reference is fetched via
                its own cold connection and is not shared across providers or
                cached. A provider cannot influence its freshness score by
                manipulating the reference point.
              </p>
            </SubSection>

            <SubSection title="Public methodology">
              <p>
                This page is the authoritative specification. Any change to a
                measurement definition requires an Architecture Decision Record
                in the public repository. Providers who believe a measurement
                is incorrect can file an issue or submit a PR — the methodology
                is open to review.
              </p>
            </SubSection>

            <CalloutBox title="Important">
              <p>
                SuiScope measures publicly accessible endpoints only. Providers
                with private or auth-gated infrastructure are not included in
                the leaderboard unless they expose a freely accessible public
                endpoint.
              </p>
            </CalloutBox>
          </Section>

          {/* ── What is not measured ───────────────────────────────── */}
          <Section id="scope" title="What is not measured">
            <p>
              Understanding the limits of SuiScope is as important as
              understanding what it measures.
            </p>
            <ul className="space-y-2 list-none">
              {[
                "Throughput or capacity — SuiScope fires one probe per provider per 60 seconds. It does not load-test endpoints.",
                "Geographic fairness — probe regions are fixed. A provider optimised for US-East will score better from the iad region than from ap-southeast. Filter by region to compare on a level footing.",
                "Internal server performance — SuiScope observes external behaviour only. It cannot distinguish between a slow network path and a slow server.",
                "Transaction submission success — probes use read-only queries. Write-path reliability (transaction throughput, finality latency) is not measured.",
                "Stream stability (Phase 2) — gRPC subscription metrics (stream_uptime_pct, stream_checkpoint_gap, stream_disconnects_per_hour) are defined but not yet deployed. They will be added in a future milestone.",
                "Composite scores — no weighted aggregate score is published. Raw metrics only, sortable by the user. See ADR-004.",
              ].map((item) => (
                <li key={item} className="flex gap-2 text-text-secondary">
                  <span className="mt-1 text-text-muted">–</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
