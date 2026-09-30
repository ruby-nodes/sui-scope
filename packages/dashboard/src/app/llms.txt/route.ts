const CONTENT = `# SuiScope

SuiScope is an independent, open-source benchmarking platform for public Sui blockchain infrastructure endpoints.

SuiScope measures cold-connection latency, checkpoint freshness, uptime, error rate, and archival availability from multiple geographic regions.

## Documentation

- Leaderboard: https://scope.rubynodes.io/
- Methodology: https://scope.rubynodes.io/methodology
- API reference: https://scope.rubynodes.io/api
- OpenAPI specification: https://scope.rubynodes.io/openapi.yaml
- Source code: https://github.com/ruby-nodes/sui-scope

## Important facts

- Measurements cover Sui mainnet infrastructure.
- Probe results are collected independently by SuiScope.
- Lower latency, freshness, and error-rate values are better.
- SuiScope is built and operated by Ruby Nodes.
- SuiScope is not affiliated with Mysten Labs.
`;

export function GET(): Response {
  return new Response(CONTENT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
