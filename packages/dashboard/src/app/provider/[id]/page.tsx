import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer, SectionHeading } from "@/components/ui";
import { RegionBreakdown } from "@/components/provider/region-breakdown";
import { MOCK_METRICS, MOCK_TIME_SERIES } from "@/lib/mock-data";
import type { MetricChartsProps } from "@/components/provider/metric-charts";

// MetricCharts uses recharts which requires browser APIs — load client-side only.
const MetricCharts = dynamic<MetricChartsProps>(
  () =>
    import("@/components/provider/metric-charts").then((m) => ({
      default: m.MetricCharts,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-md border border-border bg-bg-surface"
          />
        ))}
      </div>
    ),
  },
);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProviderPage({ params }: Props) {
  const { id } = await params;

  const rows = MOCK_METRICS.filter((r) => r.provider_id === id);
  if (rows.length === 0) notFound();

  const providerName = rows[0]!.provider_name;

  return (
    <PageContainer>
      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <span aria-hidden="true">←</span>
          Leaderboard
        </Link>
        <SectionHeading as="h1" className="mt-3">
          {providerName}
        </SectionHeading>
        <p className="mt-1.5 text-sm text-text-secondary">
          Provider ID:{" "}
          <code className="font-mono text-text-primary">{id}</code>
          <span className="mx-2 text-border">·</span>
          Data from snapshot — live API wired in M3-05.
        </p>
      </div>

      {/* Current snapshot — per-region stat cards ───────────────────────── */}
      <section className="mb-10">
        <SectionHeading as="h2" className="mb-4">
          Current Snapshot
        </SectionHeading>
        <RegionBreakdown rows={rows} />
      </section>

      {/* Time-series charts ─────────────────────────────────────────────── */}
      <section>
        <SectionHeading as="h2" className="mb-4">
          Time Series
        </SectionHeading>
        <MetricCharts rows={rows} timeSeriesMap={MOCK_TIME_SERIES} />
      </section>
    </PageContainer>
  );
}
