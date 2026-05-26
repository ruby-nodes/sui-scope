"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EndpointType, ProviderMetrics, TimeSeriesMap } from "@/lib/mock-data";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Colors for up to 4 regions — all readable on the dark background. */
const REGION_PALETTE = ["#4da2ff", "#a78bfa", "#22d3ee", "#fb923c"] as const;

type Window = "h24" | "d7";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function regionColor(region: string, allRegions: readonly string[]): string {
  const idx = allRegions.indexOf(region);
  return REGION_PALETTE[idx % REGION_PALETTE.length] ?? "#4da2ff";
}

function formatTimestamp(ts: number, win: Window): string {
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

// ─── Shared chart props ───────────────────────────────────────────────────────

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#131720",
  border: "1px solid #252d3d",
  borderRadius: "6px",
  fontSize: "12px",
  padding: "8px 12px",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "#8b95a8", marginBottom: "4px" } as const;
const TOOLTIP_ITEM_STYLE = { padding: "1px 0" } as const;

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

// ─── Data row type ────────────────────────────────────────────────────────────

interface ChartRow {
  timestamp: number;
  [key: string]: number | null;
}

// ─── MetricCharts ─────────────────────────────────────────────────────────────

export interface MetricChartsProps {
  rows: ProviderMetrics[];
  timeSeriesMap: TimeSeriesMap;
}

export function MetricCharts({ rows, timeSeriesMap }: MetricChartsProps) {
  const endpointTypes = useMemo(
    () => [...new Set(rows.map((r) => r.endpoint_type))].sort(),
    [rows],
  );

  const [selectedType, setSelectedType] = useState<EndpointType>(
    endpointTypes[0] ?? "grpc",
  );
  const [win, setWin] = useState<Window>("h24");

  const regions = useMemo(
    () =>
      [...new Set(rows.filter((r) => r.endpoint_type === selectedType).map((r) => r.region))].sort(),
    [rows, selectedType],
  );

  const providerId = rows[0]?.provider_id ?? "";

  // Build a single unified array where each row has per-region metric keys.
  const chartData = useMemo<ChartRow[]>(() => {
    const seriesByRegion = regions.map((region) => ({
      region,
      points: timeSeriesMap[`${providerId}:${selectedType}:${region}`]?.[win] ?? [],
    }));

    const baseline = seriesByRegion[0]?.points ?? [];
    return baseline.map((pt, i) => {
      const row: ChartRow = { timestamp: pt.timestamp };
      for (const { region, points } of seriesByRegion) {
        const p = points[i];
        if (p !== undefined) {
          row[`${region}_p50`] = p.latency_p50;
          row[`${region}_p99`] = p.latency_p99;
          row[`${region}_freshness`] = p.freshness_avg;
          row[`${region}_uptime`] =
            p.uptime !== null ? +(p.uptime * 100).toFixed(3) : null;
          row[`${region}_error_rate`] =
            p.error_rate !== null ? +(p.error_rate * 100).toFixed(4) : null;
        }
      }
      return row;
    });
  }, [regions, providerId, selectedType, win, timeSeriesMap]);

  const tickCount = win === "h24" ? 6 : 7;
  /** For XAxis tickFormatter — receives a number. */
  const xTickFmt = (value: number) => formatTimestamp(value, win);
  /** For Tooltip labelFormatter — receives ReactNode; guard before formatting. */
  const xLabelFmt = (label: React.ReactNode): React.ReactNode =>
    typeof label === "number"
      ? formatTimestamp(label, win)
      : typeof label === "string"
        ? label
        : "";

  return (
    <div className="space-y-4">
      {/* Controls ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Endpoint type tabs */}
        <div className="flex gap-1 rounded-md border border-border bg-bg-surface p-1">
          {endpointTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setSelectedType(type); }}
              className={
                type === selectedType
                  ? "rounded px-3 py-1 text-xs font-medium bg-accent-dim text-accent"
                  : "rounded px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              }
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
        {/* Window toggle */}
        <div className="flex gap-1 rounded-md border border-border bg-bg-surface p-1">
          {(["h24", "d7"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => { setWin(w); }}
              className={
                w === win
                  ? "rounded px-3 py-1 text-xs font-medium bg-accent-dim text-accent"
                  : "rounded px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              }
            >
              {w === "h24" ? "24h" : "7d"}
            </button>
          ))}
        </div>
      </div>

      {/* Region legend ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {regions.map((region) => (
          <span key={region} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              className="inline-block h-2 w-5 rounded-sm"
              style={{ background: regionColor(region, regions) }}
            />
            {region.toUpperCase()}
          </span>
        ))}
      </div>

      {/* 2 × 2 chart grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Latency p50 ──────────────────────────────────────────────────── */}
        <ChartCard title="Latency p50 (ms)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickCount={tickCount}
                tickFormatter={xTickFmt}
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={38}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelFormatter={xLabelFmt}
                formatter={(value) => [
                  typeof value === "number" ? `${Math.round(value)} ms` : String(value),
                  "",
                ]}
              />
              {regions.map((region) => (
                <Line
                  key={region}
                  type="monotone"
                  dataKey={`${region}_p50`}
                  name={region.toUpperCase()}
                  stroke={regionColor(region, regions)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Freshness ────────────────────────────────────────────────────── */}
        <ChartCard title="Freshness (checkpoints behind)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickCount={tickCount}
                tickFormatter={xTickFmt}
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelFormatter={xLabelFmt}
                formatter={(value) => [
                  typeof value === "number" ? `${Math.round(value)} ckpts` : String(value),
                  "",
                ]}
              />
              {regions.map((region) => (
                <Line
                  key={region}
                  type="monotone"
                  dataKey={`${region}_freshness`}
                  name={region.toUpperCase()}
                  stroke={regionColor(region, regions)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Uptime ───────────────────────────────────────────────────────── */}
        <ChartCard title="Uptime (%)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickCount={tickCount}
                tickFormatter={xTickFmt}
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={["auto", 100]}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelFormatter={xLabelFmt}
                formatter={(value) => [
                  typeof value === "number" ? `${value.toFixed(3)}%` : String(value),
                  "",
                ]}
              />
              {regions.map((region) => (
                <Line
                  key={region}
                  type="monotone"
                  dataKey={`${region}_uptime`}
                  name={region.toUpperCase()}
                  stroke={regionColor(region, regions)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Error Rate ───────────────────────────────────────────────────── */}
        <ChartCard title="Error Rate (%)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickCount={tickCount}
                tickFormatter={xTickFmt}
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#5a6478", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelFormatter={xLabelFmt}
                formatter={(value) => [
                  typeof value === "number" ? `${value.toFixed(3)}%` : String(value),
                  "",
                ]}
              />
              {regions.map((region) => (
                <Line
                  key={region}
                  type="monotone"
                  dataKey={`${region}_error_rate`}
                  name={region.toUpperCase()}
                  stroke={regionColor(region, regions)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
