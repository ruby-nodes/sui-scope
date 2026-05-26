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
      { id: "foo", endpoint: "foo.example.com:443" },
    ]);
    expect(result.graphql).toEqual([
      { id: "foo", endpoint: "https://foo.example.com/graphql" },
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

describe("loadEnv", () => {
  it("parses REGION with PROBE_INTERVAL_MS default", () => {
    const result = loadEnv({ REGION: "us-east-1" });

    expect(result.REGION).toBe("us-east-1");
    expect(result.PROBE_INTERVAL_MS).toBe(60_000);
  });

  it("parses explicit PROBE_INTERVAL_MS", () => {
    const result = loadEnv({ REGION: "eu-west-1", PROBE_INTERVAL_MS: "30000" });

    expect(result.PROBE_INTERVAL_MS).toBe(30_000);
  });

  it("throws when REGION is missing", () => {
    expect(() => loadEnv({})).toThrow();
  });

  it("throws when REGION is empty string", () => {
    expect(() => loadEnv({ REGION: "" })).toThrow();
  });

  it("throws when PROBE_INTERVAL_MS is not a positive integer", () => {
    expect(() => loadEnv({ REGION: "us-east-1", PROBE_INTERVAL_MS: "0" })).toThrow();
    expect(() => loadEnv({ REGION: "us-east-1", PROBE_INTERVAL_MS: "-5" })).toThrow();
    expect(() => loadEnv({ REGION: "us-east-1", PROBE_INTERVAL_MS: "abc" })).toThrow();
  });

  it("passes through optional PROVIDERS_YAML_PATH", () => {
    const result = loadEnv({
      REGION: "ap-southeast-1",
      PROVIDERS_YAML_PATH: "/custom/path.yaml",
    });

    expect(result.PROVIDERS_YAML_PATH).toBe("/custom/path.yaml");
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
