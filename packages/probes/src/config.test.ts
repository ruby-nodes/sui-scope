import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadEnv,
  loadProviders,
  readProbeVersion,
  resolveDefaultProvidersPath,
} from "./config.js";

// ─── loadProviders ────────────────────────────────────────────────────────────

describe("loadProviders", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sui-scope-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeYaml(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  it("parses a valid providers file with grpc + graphql", () => {
    const filePath = writeYaml(
      "providers.yaml",
      `
providers:
  - id: foo
    name: "Foo Provider"
    grpc: "foo.example.com:443"
    graphql: "https://foo.example.com/graphql"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc).toEqual([
      { id: "foo", endpoint: "foo.example.com:443", isPublic: true },
    ]);
    expect(result.graphql).toEqual([
      { id: "foo", endpoint: "https://foo.example.com/graphql", isPublic: true },
    ]);
  });

  it("parses a provider with grpc only", () => {
    const filePath = writeYaml(
      "grpc-only.yaml",
      `
providers:
  - id: bar
    name: "Bar"
    grpc: "bar.example.com:443"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc).toHaveLength(1);
    expect(result.graphql).toHaveLength(0);
  });

  it("parses a provider with graphql only", () => {
    const filePath = writeYaml(
      "gql-only.yaml",
      `
providers:
  - id: baz
    name: "Baz"
    graphql: "https://baz.example.com/graphql"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc).toHaveLength(0);
    expect(result.graphql).toHaveLength(1);
  });

  it("splits multiple providers correctly", () => {
    const filePath = writeYaml(
      "multi.yaml",
      `
providers:
  - id: p1
    name: "P1"
    grpc: "p1.example.com:443"
  - id: p2
    name: "P2"
    graphql: "https://p2.example.com/graphql"
  - id: p3
    name: "P3"
    grpc: "p3.example.com:443"
    graphql: "https://p3.example.com/graphql"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(result.graphql.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("throws on a provider with neither grpc nor graphql", () => {
    const filePath = writeYaml(
      "invalid.yaml",
      `
providers:
  - id: bad
    name: "Bad"
`,
    );

    expect(() => loadProviders(filePath)).toThrow();
  });

  it("resolves grpc_env to the endpoint from env", () => {
    const filePath = writeYaml(
      "grpc-env.yaml",
      `
providers:
  - id: private-grpc
    name: "Private gRPC"
    grpc_env: MY_GRPC_ENDPOINT
    public: false
`,
    );

    const result = loadProviders(filePath, { MY_GRPC_ENDPOINT: "private.example.com:443" });

    expect(result.grpc).toEqual([
      { id: "private-grpc", endpoint: "private.example.com:443", isPublic: false },
    ]);
    expect(result.graphql).toHaveLength(0);
  });

  it("resolves graphql_env to the endpoint from env", () => {
    const filePath = writeYaml(
      "gql-env.yaml",
      `
providers:
  - id: private-gql
    name: "Private GraphQL"
    graphql_env: MY_GQL_URL
    public: false
`,
    );

    const result = loadProviders(filePath, { MY_GQL_URL: "https://private.example.com/graphql" });

    expect(result.graphql).toEqual([
      { id: "private-gql", endpoint: "https://private.example.com/graphql", isPublic: false },
    ]);
    expect(result.grpc).toHaveLength(0);
  });

  it("throws when a grpc_env variable is not set", () => {
    const filePath = writeYaml(
      "missing-env.yaml",
      `
providers:
  - id: private
    name: "Private"
    grpc_env: MISSING_VAR
    public: false
`,
    );

    expect(() => loadProviders(filePath, {})).toThrow(/MISSING_VAR/);
  });

  it("throws when a graphql_env variable is not set", () => {
    const filePath = writeYaml(
      "missing-gql-env.yaml",
      `
providers:
  - id: private
    name: "Private"
    graphql_env: MISSING_GQL_VAR
    public: false
`,
    );

    expect(() => loadProviders(filePath, {})).toThrow(/MISSING_GQL_VAR/);
  });

  it("allows mixing public literal field with private env field on the same provider", () => {
    const filePath = writeYaml(
      "mixed.yaml",
      `
providers:
  - id: mixed
    name: "Mixed"
    grpc: "public.example.com:443"
    graphql_env: PRIVATE_GQL_URL
    public: false
`,
    );

    const result = loadProviders(filePath, { PRIVATE_GQL_URL: "https://private.example.com/graphql" });

    expect(result.grpc).toEqual([
      { id: "mixed", endpoint: "public.example.com:443", isPublic: false },
    ]);
    expect(result.graphql).toEqual([
      { id: "mixed", endpoint: "https://private.example.com/graphql", isPublic: false },
    ]);
  });

  it("defaults isPublic to true for providers without the public field", () => {
    const filePath = writeYaml(
      "default-public.yaml",
      `
providers:
  - id: pub
    name: "Public Provider"
    grpc: "pub.example.com:443"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc[0]?.isPublic).toBe(true);
  });

  it("resolves grpc token from env and attaches it to the config", () => {
    const filePath = writeYaml(
      "grpc-token.yaml",
      `
providers:
  - id: tokened-grpc
    name: "Tokened gRPC"
    grpc: "grpc.example.com:443"
    grpc_token_header: "x-token"
    grpc_token_env: MY_GRPC_TOKEN
    public: false
`,
    );

    const result = loadProviders(filePath, { MY_GRPC_TOKEN: "secret-grpc-value" });

    expect(result.grpc[0]?.token).toEqual({ header: "x-token", value: "secret-grpc-value" });
  });

  it("resolves graphql token from env and attaches it to the config", () => {
    const filePath = writeYaml(
      "gql-token.yaml",
      `
providers:
  - id: tokened-gql
    name: "Tokened GraphQL"
    graphql: "https://gql.example.com/graphql"
    graphql_token_header: "Authorization"
    graphql_token_env: MY_GQL_TOKEN
    public: false
`,
    );

    const result = loadProviders(filePath, { MY_GQL_TOKEN: "Bearer xyz" });

    expect(result.graphql[0]?.token).toEqual({ header: "Authorization", value: "Bearer xyz" });
  });

  it("throws when grpc_token_env is set but the env var is missing", () => {
    const filePath = writeYaml(
      "missing-grpc-token.yaml",
      `
providers:
  - id: tok
    name: "Tok"
    grpc: "grpc.example.com:443"
    grpc_token_header: "x-token"
    grpc_token_env: MISSING_GRPC_TOKEN
    public: false
`,
    );

    expect(() => loadProviders(filePath, {})).toThrow(/MISSING_GRPC_TOKEN/);
  });

  it("throws when graphql_token_env is set but the env var is missing", () => {
    const filePath = writeYaml(
      "missing-gql-token.yaml",
      `
providers:
  - id: tok
    name: "Tok"
    graphql: "https://gql.example.com/graphql"
    graphql_token_header: "Authorization"
    graphql_token_env: MISSING_GQL_TOKEN
    public: false
`,
    );

    expect(() => loadProviders(filePath, {})).toThrow(/MISSING_GQL_TOKEN/);
  });

  it("throws when grpc_token_header is set without grpc_token_env", () => {
    const filePath = writeYaml(
      "half-grpc-token.yaml",
      `
providers:
  - id: bad
    name: "Bad"
    grpc: "grpc.example.com:443"
    grpc_token_header: "x-token"
`,
    );

    expect(() => loadProviders(filePath, {})).toThrow();
  });

  it("leaves token undefined for providers with no token fields", () => {
    const filePath = writeYaml(
      "no-token.yaml",
      `
providers:
  - id: plain
    name: "Plain"
    grpc: "plain.example.com:443"
`,
    );

    const result = loadProviders(filePath);

    expect(result.grpc[0]?.token).toBeUndefined();
  });

  it("throws when providers list is empty", () => {
    const filePath = writeYaml(
      "empty.yaml",
      `
providers: []
`,
    );

    expect(() => loadProviders(filePath)).toThrow();
  });

  it("throws on malformed YAML", () => {
    const filePath = writeYaml("broken.yaml", ": bad: yaml: [");

    expect(() => loadProviders(filePath)).toThrow();
  });
});

// ─── loadEnv ─────────────────────────────────────────────────────────────────

// Minimal valid env for reuse across loadEnv tests.
const VALID_ENV = {
  REGION: "us-east-1",
  INGEST_URL: "http://suiscope-api.internal:3000/ingest",
  INGEST_SECRET: "test-secret",
} as const;

describe("loadEnv", () => {
  it("parses REGION with PROBE_INTERVAL_MS default", () => {
    const result = loadEnv({ ...VALID_ENV });

    expect(result.REGION).toBe("us-east-1");
    expect(result.PROBE_INTERVAL_MS).toBe(60_000);
  });

  it("parses explicit PROBE_INTERVAL_MS", () => {
    const result = loadEnv({ ...VALID_ENV, REGION: "eu-west-1", PROBE_INTERVAL_MS: "30000" });

    expect(result.PROBE_INTERVAL_MS).toBe(30_000);
  });

  it("throws when REGION is missing", () => {
    expect(() => loadEnv({ INGEST_URL: VALID_ENV.INGEST_URL, INGEST_SECRET: VALID_ENV.INGEST_SECRET })).toThrow();
  });

  it("throws when REGION is empty string", () => {
    expect(() => loadEnv({ ...VALID_ENV, REGION: "" })).toThrow();
  });

  it("throws when PROBE_INTERVAL_MS is not a positive integer", () => {
    expect(() => loadEnv({ ...VALID_ENV, PROBE_INTERVAL_MS: "0" })).toThrow();
    expect(() => loadEnv({ ...VALID_ENV, PROBE_INTERVAL_MS: "-5" })).toThrow();
    expect(() => loadEnv({ ...VALID_ENV, PROBE_INTERVAL_MS: "abc" })).toThrow();
  });

  it("passes through optional PROVIDERS_YAML_PATH", () => {
    const result = loadEnv({
      ...VALID_ENV,
      REGION: "ap-southeast-1",
      PROVIDERS_YAML_PATH: "/custom/path.yaml",
    });

    expect(result.PROVIDERS_YAML_PATH).toBe("/custom/path.yaml");
  });

  it("uses FLY_REGION as fallback when REGION is not set", () => {
    const result = loadEnv({
      FLY_REGION: "fra",
      INGEST_URL: VALID_ENV.INGEST_URL,
      INGEST_SECRET: VALID_ENV.INGEST_SECRET,
    });

    expect(result.REGION).toBe("fra");
  });

  it("explicit REGION takes precedence over FLY_REGION", () => {
    const result = loadEnv({ ...VALID_ENV, REGION: "iad", FLY_REGION: "fra" });

    expect(result.REGION).toBe("iad");
  });

  it("parses INGEST_URL and INGEST_SECRET", () => {
    const result = loadEnv({ ...VALID_ENV });

    expect(result.INGEST_URL).toBe("http://suiscope-api.internal:3000/ingest");
    expect(result.INGEST_SECRET).toBe("test-secret");
  });

  it("throws when INGEST_URL is not a valid URL", () => {
    expect(() => loadEnv({ ...VALID_ENV, INGEST_URL: "not-a-url" })).toThrow();
  });

  it("throws when INGEST_SECRET is missing", () => {
    expect(() => loadEnv({ ...VALID_ENV, INGEST_SECRET: undefined })).toThrow();
  });

  it("throws when INGEST_SECRET is empty string", () => {
    expect(() => loadEnv({ ...VALID_ENV, INGEST_SECRET: "" })).toThrow();
  });
});

// ─── resolveDefaultProvidersPath ─────────────────────────────────────────────

describe("resolveDefaultProvidersPath", () => {
  it("returns a path ending with config/providers.yaml", () => {
    const resolved = resolveDefaultProvidersPath();

    expect(resolved.endsWith("config/providers.yaml")).toBe(true);
  });

  it("points to the actual file in this monorepo", () => {
    const resolved = resolveDefaultProvidersPath();

    expect(fs.existsSync(resolved)).toBe(true);
  });
});

// ─── readProbeVersion ─────────────────────────────────────────────────────────

describe("readProbeVersion", () => {
  it("returns a non-empty version string", () => {
    const version = readProbeVersion();

    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });

  it("returns semver-like string from package.json (major.minor.patch)", () => {
    const version = readProbeVersion();

    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
