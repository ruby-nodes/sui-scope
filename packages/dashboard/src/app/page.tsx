import { Suspense } from "react";

import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { PageContainer, SectionHeading } from "@/components/ui";
import { KNOWN_REGIONS, MOCK_METRICS } from "@/lib/mock-data";

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-12 animate-pulse rounded-md bg-bg-surface" />
      <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-border-subtle last:border-0 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <PageContainer>
      <div className="mb-6">
        <SectionHeading as="h1">Provider Leaderboard</SectionHeading>
        <p className="mt-2 text-text-secondary">
          Cold-connection latency, freshness, uptime, and error rate across Sui
          infrastructure providers. Sort by any column; filter by region or
          endpoint type.
        </p>
      </div>
      <Suspense fallback={<LeaderboardSkeleton />}>
        <LeaderboardClient rows={MOCK_METRICS} regions={KNOWN_REGIONS} />
      </Suspense>
    </PageContainer>
  );
}
