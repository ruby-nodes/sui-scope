import { Suspense } from "react";

import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { PageContainer, SectionHeading } from "@/components/ui";

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
      <Suspense>
        <LeaderboardClient />
      </Suspense>
    </PageContainer>
  );
}
