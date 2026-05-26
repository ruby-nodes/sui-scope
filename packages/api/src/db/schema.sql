-- SuiScope ClickHouse schema
-- Run once against the target ClickHouse instance before starting the API server.
-- Safe to re-run: all statements use IF NOT EXISTS.

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
TTL timestamp + INTERVAL 90 DAY;

-- ─── Per-minute pre-aggregation table (AggregatingMergeTree) ─────────────────
-- Populated by measurements_mv below.
-- Final rollups (p50/p90/p99, error_rate, uptime) are computed at read time
-- using quantileTDigestMerge() and countMerge() over arbitrary rolling windows.

CREATE TABLE IF NOT EXISTS measurements_1m
(
    provider_id   String,
    region        LowCardinality(String),
    endpoint_type LowCardinality(String),
    metric        LowCardinality(String),
    minute        DateTime,
    total_count   AggregateFunction(count),
    success_count AggregateFunction(countIf, UInt8),
    p50           AggregateFunction(quantileTDigest(0.5),  Float64),
    p90           AggregateFunction(quantileTDigest(0.9),  Float64),
    p99           AggregateFunction(quantileTDigest(0.99), Float64),
    value_sum     AggregateFunction(sum, Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (provider_id, region, endpoint_type, metric, minute);

-- ─── Materialized view: measurements → measurements_1m ───────────────────────
-- Fires on every INSERT into measurements and incrementally updates measurements_1m.

CREATE MATERIALIZED VIEW IF NOT EXISTS measurements_mv
TO measurements_1m
AS SELECT
    provider_id,
    region,
    endpoint_type,
    metric,
    toStartOfMinute(timestamp)           AS minute,
    countState()                         AS total_count,
    countIfState(toUInt8(success))       AS success_count,
    quantileTDigestState(0.5)(value)     AS p50,
    quantileTDigestState(0.9)(value)     AS p90,
    quantileTDigestState(0.99)(value)    AS p99,
    sumState(value)                      AS value_sum
FROM measurements
GROUP BY provider_id, region, endpoint_type, metric, minute;
