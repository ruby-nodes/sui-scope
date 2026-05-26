import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("dashboard", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@sui-scope/dashboard");
  });
});
