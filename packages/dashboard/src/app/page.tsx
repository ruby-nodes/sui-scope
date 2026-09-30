import type { Metadata } from "next";
import { Suspense } from "react";

import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { PageContainer, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LeaderboardPage() {
  return (
    <PageContainer>
      <div className="mb-6">
        <SectionHeading as="h1">Provider Leaderboard</SectionHeading>
        <p className="mt-2 text-text-secondary">
          This is public and common-good board to measure cold-connection
          latency, freshness, uptime, and error rate across Sui infrastructure
          providers. Sort by any column; filter by region or endpoint type.
        </p>
      </div>
      <Suspense>
        <LeaderboardClient />
      </Suspense>
      <section
        className="mt-12 max-w-3xl border-t border-border pt-8"
        aria-labelledby="about-data"
      >
        <SectionHeading as="h2" id="about-data">
          About SuiScope data
        </SectionHeading>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-secondary">
          <p>
            SuiScope independently benchmarks public Sui mainnet infrastructure
            from multiple geographic regions. Probes run every 60 seconds using
            fresh connections and measure latency, checkpoint freshness, uptime,
            and error rate. Results represent observed endpoint performance and
            do not measure a provider&apos;s total capacity under load.
          </p>
          <p>
            SuiScope is an open-source project operated by Ruby Nodes and is not
            affiliated with Mysten Labs. See the{" "}
            <a href="/methodology" className="text-accent hover:underline">
              methodology
            </a>{" "}
            for complete definitions and limitations.
          </p>
        </div>
      </section>
    </PageContainer>
  );
}
