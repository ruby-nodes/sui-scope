"use client";

import dynamic from "next/dynamic";

import type { MetricChartsProps } from "./metric-charts";

// dynamic with ssr: false must live inside a client component.
// This wrapper lets the server page import MetricCharts without hitting the
// "ssr: false is not allowed in Server Components" Turbopack restriction.
const MetricCharts = dynamic<MetricChartsProps>(
  () =>
    import("./metric-charts").then((m) => ({
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

export { MetricCharts };
