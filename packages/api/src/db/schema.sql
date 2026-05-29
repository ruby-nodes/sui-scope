-- SuiScope ClickHouse schema
-- Run once against the target ClickHouse instance before starting the API server.
-- Safe to re-run: all statements use IF NOT EXISTS.

CREATE DATABASE IF NOT EXISTS suiscope;

-- ─── Raw events table ─────────────────────────────────────────────────────────
-- Append-only. One row per probe observation.
-- timestamp is stored as DateTime64(3) — unix milliseconds.

CREATE TABLE IF NOT EXISTS measurements
(
    provider_id   String,
    region        LowCardinality(String),
    endpoint_type LowCardinality(String),  -- 'grpc' | 'graphql' | 'archival'
    metric        LowCardinality(String),  -- 'latency_ms' | 'freshness_checkpoints' | 'stream_checkpoint_gap'
    value         Float64,
    success       Bool,
    error_type    Nullable(String),
    probe_version LowCardinality(String),
    timestamp     DateTime64(3)            -- unix milliseconds
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (provider_id, region, endpoint_type, metric, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;


