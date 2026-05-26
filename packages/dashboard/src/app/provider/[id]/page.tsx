import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer, SectionHeading } from "@/components/ui";
import { RegionBreakdown } from "@/components/provider/region-breakdown";
import { MetricCharts } from "@/components/provider/metric-charts-loader";
import {
  fetchMetrics,
  fetchProviderTimeSeries,
  mergeTimeSeriesMaps,
} from "@/lib/api-client";
import type { ProviderMetrics, TimeSeriesMap } from "@/lib/mock-data";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProviderPage({ params }: Props) {
  const { id } = await params;

  // Fetch all metrics and filter to this provider.
  // Fetch time-series for both 24h and 7d windows in parallel.
  let rows: ProviderMetrics[];
  let timeSeriesMap: TimeSeriesMap;

  try {
    const [allMetrics, ts24h, ts7d] = await Promise.all([
      fetchMetrics(),
      fetchProviderTimeSeries(id, "24h", "h24"),
      fetchProviderTimeSeries(id, "7d", "d7"),
    ]);
    rows = allMetrics.filter((r) => r.provider_id === id);
    timeSeriesMap = mergeTimeSeriesMaps(ts24h, ts7d);
  } catch {
    rows = [];
    timeSeriesMap = {};
  }

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
        <MetricCharts rows={rows} timeSeriesMap={timeSeriesMap} />
      </section>
    </PageContainer>
  );
}

