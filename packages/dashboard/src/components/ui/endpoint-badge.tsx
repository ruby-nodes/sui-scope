import type { EndpointType } from "@/lib/mock-data";

const BADGE_CLASSES: Record<EndpointType, string> = {
  grpc: "bg-grpc-bg text-grpc border-grpc/30",
  graphql: "bg-graphql-bg text-graphql border-graphql/30",
  archival: "bg-archival-bg text-archival border-archival/30",
};

const BADGE_LABELS: Record<EndpointType, string> = {
  grpc: "gRPC",
  graphql: "GraphQL",
  archival: "Archival",
};

export interface EndpointBadgeProps {
  type: EndpointType;
  className?: string;
}

export function EndpointBadge({ type, className = "" }: EndpointBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider ${BADGE_CLASSES[type]} ${className}`}
    >
      {BADGE_LABELS[type]}
    </span>
  );
}
