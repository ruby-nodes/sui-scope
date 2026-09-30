import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer, SectionHeading } from "@/components/ui";
import { RegionBreakdown } from "@/components/provider/region-breakdown";
import { MetricCharts } from "@/components/provider/metric-charts-loader";
import {
  fetchMetrics,
  fetchProviders,
  fetchProviderTimeSeries,
  mergeTimeSeriesMaps,
} from "@/lib/api-client";
import type { ProviderMetrics, TimeSeriesMap } from "@/lib/mock-data";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const canonical = "/provider/" + encodeURIComponent(id);

  try {
    const provider = (await fetchProviders()).find((item) => item.id === id);
    if (!provider) {
      return {
        title: "Provider not found",
        alternates: { canonical },
        robots: { index: false, follow: false },
      };
    }
    return {
      title: provider.name + " Sui RPC Performance",
      description:
        "Latency, uptime, freshness, error rate, and regional Sui infrastructure performance for " +
        provider.name +
        ".",
      alternates: { canonical },
      openGraph: {
        title: provider.name + " Sui RPC Performance · SuiScope",
        description:
          "Independent Sui endpoint performance measurements for " +
          provider.name +
          ".",
        url: canonical,
      },
    };
  } catch {
    return {
      title: id + " Provider Performance",
      alternates: { canonical },
    };
  }
}

export default async function ProviderPage({ params }: Props) {
  const { id } = await params;
  const [providersResult, metricsResult, ts24h, ts7d] = await Promise.all([
    fetchProviders()
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const })),
    fetchMetrics()
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const })),
    fetchProviderTimeSeries(id, "24h", "h24"),
    fetchProviderTimeSeries(id, "7d", "d7"),
  ]);

  const provider = providersResult.ok
    ? providersResult.value.find((item) => item.id === id)
    : undefined;
  const rows: ProviderMetrics[] = metricsResult.ok
    ? metricsResult.value.filter((row) => row.provider_id === id)
    : [];

  if (providersResult.ok && !provider) notFound();
  if (!providersResult.ok && metricsResult.ok && rows.length === 0) notFound();

  const providerName = provider?.name ?? rows[0]?.provider_name ?? id;
  const timeSeriesMap: TimeSeriesMap = mergeTimeSeriesMaps(ts24h, ts7d);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: providerName + " Sui infrastructure endpoint",
    url: "https://scope.rubynodes.io/provider/" + encodeURIComponent(id),
    provider: { "@type": "Organization", name: providerName },
    areaServed: "Sui mainnet",
    description:
      "Independent endpoint performance measurements collected by SuiScope.",
  };

  return (
    <PageContainer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <span aria-hidden="true">←</span> Leaderboard
        </Link>
        <SectionHeading as="h1" className="mt-3">
          {providerName}
        </SectionHeading>
        <p className="mt-1.5 text-sm text-text-secondary">
          Provider ID: <code className="font-mono text-text-primary">{id}</code>
        </p>
      </div>

      {rows.length > 0 ? (
        <>
          <section className="mb-10">
            <SectionHeading as="h2" className="mb-4">
              Current Snapshot
            </SectionHeading>
            <RegionBreakdown rows={rows} />
          </section>
          <section>
            <SectionHeading as="h2" className="mb-4">
              Time Series
            </SectionHeading>
            <MetricCharts rows={rows} timeSeriesMap={timeSeriesMap} />
          </section>
        </>
      ) : (
        <section className="rounded-md border border-border bg-bg-surface p-6">
          <SectionHeading as="h2">
            Metrics temporarily unavailable
          </SectionHeading>
          <p className="mt-2 text-sm text-text-secondary">
            SuiScope could not load the latest measurements for this registered
            provider. Please try again shortly.
          </p>
        </section>
      )}

      <section
        className="mt-10 border-t border-border pt-6"
        aria-labelledby="data-context"
      >
        <SectionHeading as="h2" id="data-context">
          About these measurements
        </SectionHeading>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
          Measurements are independently collected by SuiScope from multiple
          regions. They represent observed public-endpoint performance, not the
          provider&apos;s total infrastructure capacity. See the{" "}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology
          </Link>{" "}
          for definitions and limitations.
        </p>
      </section>
    </PageContainer>
  );
}
