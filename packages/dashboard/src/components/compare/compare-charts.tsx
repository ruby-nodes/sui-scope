"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimeSeriesMap, TimeSeriesPoint } from "@/lib/mock-data";

// ─── Palette ──────────────────────────────────────────────────────────────────

/** One color per provider — consistent with provider pills and stat cards. */
export const PROVIDER_PALETTE = [
  "#4da2ff",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompareWindow = "h24" | "d7";

export interface CompareProviderInfo {
  id: string;
  name: string;
}

export interface CompareChartsProps {
  providers: CompareProviderInfo[];
  timeSeriesMap: TimeSeriesMap;
  endpointType: string;
  region: string;
  win: CompareWindow;
}

interface ChartRow {
  timestamp: number;
  [key: string]: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number, win: CompareWindow): string {
  const d = new Date(ts);
  if (win === "h24") {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─── Style constants ──────────────────────────────────────────────────────────

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#131720",
  border: "1px solid #252d3d",
  borderRadius: "6px",
  fontSize: "12px",
  padding: "8px 12px",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "#8b95a8", marginBottom: "4px" } as const;
const TOOLTIP_ITEM_STYLE = { padding: "1px 0" } as const;
const AXIS_TICK = { fill: "#8b95a8", fontSize: 11 };
const GRID_STROKE = "#252d3d";
const DOT_PROPS = { r: 0 };
const ACTIVE_DOT_PROPS = { r: 3 };

// ─── ChartCard ────────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="rounded-md border border-border bg-bg-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
        {title}
      </p>
      <div className="h-48">{children}</div>
    </div>
  );
}

// ─── CompareCharts ────────────────────────────────────────────────────────────

export function CompareCharts({
  providers,
  timeSeriesMap,
  endpointType,
  region,
  win,
}: CompareChartsProps) {
  const chartData = useMemo<ChartRow[]>(() => {
    const seriesList = providers.map((p) => ({
      id: p.id,
      points:
        timeSeriesMap[`${p.id}:${endpointType}:${region}`]?.[win] ??
        ([] as TimeSeriesPoint[]),
    }));

    // Use the series with the most data points as the timestamp baseline.
    const baseline = seriesList.reduce(
      (longest, s) =>
        s.points.length > longest.points.length ? s : longest,
      { id: "", points: [] as TimeSeriesPoint[] },
    );

    if (baseline.points.length === 0) return [];

    return baseline.points.map((pt, i) => {
      const row: ChartRow = { timestamp: pt.timestamp };
      for (const s of seriesList) {
        const p = s.points[i];
        if (p !== undefined) {
          row[`${s.id}_p50`] = p.latency_p50;
          row[`${s.id}_freshness`] = p.freshness_avg;
          row[`${s.id}_uptime`] =
            p.uptime !== null ? +(p.uptime * 100).toFixed(3) : null;
          row[`${s.id}_error_rate`] =
            p.error_rate !== null ? +(p.error_rate * 100).toFixed(4) : null;
        }
      }
      return row;
    });
  }, [providers, timeSeriesMap, endpointType, region, win]);

  const tickCount = win === "h24" ? 6 : 7;
  const xTickFmt = (value: number) => formatTimestamp(value, win);
  const xLabelFmt = (label: React.ReactNode): React.ReactNode =>
    typeof label === "number"
      ? formatTimestamp(label, win)
      : typeof label === "string"
        ? label
        : "";

  function renderLines(metricKey: (id: string) => string) {
    return providers.map((p, i) => (
      <Line
        key={p.id}
        type="monotone"
        dataKey={metricKey(p.id)}
        name={p.name}
        stroke={PROVIDER_PALETTE[i % PROVIDER_PALETTE.length] ?? "#4da2ff"}
        strokeWidth={1.5}
        dot={DOT_PROPS}
        activeDot={ACTIVE_DOT_PROPS}
        connectNulls
      />
    ));
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-border bg-bg-surface text-sm text-text-muted">
        No time-series data for {endpointType.toUpperCase()} ·{" "}
        {region.toUpperCase()}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Latency p50 */}
      <ChartCard title="Latency p50 (ms)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_STROKE}
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={xTickFmt}
              tick={AXIS_TICK}
              tickCount={tickCount}
            />
            <YAxis tick={AXIS_TICK} width={45} unit="ms" />
            <Tooltip
              labelFormatter={xLabelFmt}
              formatter={(v) =>
                typeof v === "number" ? [`${Math.round(v)} ms`] : ["—"]
              }
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            {renderLines((id) => `${id}_p50`)}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Freshness */}
      <ChartCard title="Freshness (checkpoints behind)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_STROKE}
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={xTickFmt}
              tick={AXIS_TICK}
              tickCount={tickCount}
            />
            <YAxis tick={AXIS_TICK} width={40} />
            <Tooltip
              labelFormatter={xLabelFmt}
              formatter={(v) =>
                typeof v === "number" ? [`${Math.round(v)} ckpts`] : ["—"]
              }
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            {renderLines((id) => `${id}_freshness`)}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Uptime */}
      <ChartCard title="Uptime (%)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_STROKE}
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={xTickFmt}
              tick={AXIS_TICK}
              tickCount={tickCount}
            />
            <YAxis tick={AXIS_TICK} width={45} unit="%" domain={[90, 100]} />
            <Tooltip
              labelFormatter={xLabelFmt}
              formatter={(v) =>
                typeof v === "number" ? [`${v.toFixed(2)}%`] : ["—"]
              }
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            {renderLines((id) => `${id}_uptime`)}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Error rate */}
      <ChartCard title="Error Rate (%)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_STROKE}
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={xTickFmt}
              tick={AXIS_TICK}
              tickCount={tickCount}
            />
            <YAxis tick={AXIS_TICK} width={45} unit="%" />
            <Tooltip
              labelFormatter={xLabelFmt}
              formatter={(v) =>
                typeof v === "number" ? [`${v.toFixed(3)}%`] : ["—"]
              }
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            {renderLines((id) => `${id}_error_rate`)}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
