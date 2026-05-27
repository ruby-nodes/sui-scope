import type { Metadata } from "next";

import { PageContainer, SectionHeading } from "@/components/ui";
import { CompareView } from "@/components/compare/compare-view";
import {
  fetchMetrics,
  fetchProviders,
  fetchProviderTimeSeries,
  mergeTimeSeriesMaps,
} from "@/lib/api-client";
import type { ApiProvider } from "@/lib/api-client";
import type { ProviderMetrics, TimeSeriesMap } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Compare Providers",
};

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.p;
  // Cap at 4 providers; validate each entry is a non-empty string.
  const selectedIds = (
    Array.isArray(raw) ? raw : raw !== undefined ? [raw] : []
  )
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, 4);

  let allProviders: ApiProvider[];
  let rows: ProviderMetrics[];
  let timeSeriesMap: TimeSeriesMap;

  try {
    const [providers, allMetrics, tsMaps] = await Promise.all([
      fetchProviders(),
      fetchMetrics(),
      Promise.all(
        selectedIds.map((id) =>
          Promise.all([
            fetchProviderTimeSeries(id, "24h", "h24"),
            fetchProviderTimeSeries(id, "7d", "d7"),
          ]).then(([h24, d7]) => mergeTimeSeriesMaps(h24, d7)),
        ),
      ),
    ]);
    allProviders = providers;
    rows = allMetrics.filter((r) => selectedIds.includes(r.provider_id));
    timeSeriesMap = tsMaps.reduce<TimeSeriesMap>(
      (acc, m) => ({ ...acc, ...m }),
      {},
    );
  } catch {
    allProviders = [];
    rows = [];
    timeSeriesMap = {};
  }

  return (
    <PageContainer>
      <div className="mb-8">
        <SectionHeading as="h1">Compare Providers</SectionHeading>
        <p className="mt-2 text-text-secondary">
          Side-by-side metric charts for 2–4 providers. Select providers from
          the{" "}
          <a href="/" className="text-accent hover:underline">
            leaderboard
          </a>{" "}
          or add them below.
        </p>
      </div>

      <CompareView
        allProviders={allProviders}
        selectedIds={selectedIds}
        rows={rows}
        timeSeriesMap={timeSeriesMap}
      />
    </PageContainer>
  );
}
