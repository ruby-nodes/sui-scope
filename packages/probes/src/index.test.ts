import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("probes", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@sui-scope/probes");
  });
});
