import { PageContainer, SectionHeading } from "@/components/ui";

export default function LeaderboardPage() {
  return (
    <PageContainer>
      <SectionHeading as="h1">Provider Leaderboard</SectionHeading>
      <p className="mt-2 text-text-secondary">
        Real-time performance metrics across Sui infrastructure providers.
      </p>
    </PageContainer>
  );
}
