import { createClient } from "@clickhouse/client";

import type { ApiEnv } from "../env.js";

/**
 * Create a ClickHouse client bound to the configured database.
 * The caller is responsible for calling `.close()` on shutdown.
 */
export function createClickHouseClient(
  env: Pick<
    ApiEnv,
    | "CLICKHOUSE_URL"
    | "CLICKHOUSE_DATABASE"
    | "CLICKHOUSE_USERNAME"
    | "CLICKHOUSE_PASSWORD"
  >,
) {
  return createClient({
    url: env.CLICKHOUSE_URL,
    database: env.CLICKHOUSE_DATABASE,
    username: env.CLICKHOUSE_USERNAME,
    password: env.CLICKHOUSE_PASSWORD,
  });
}

export type ClickHouseClient = ReturnType<typeof createClickHouseClient>;
