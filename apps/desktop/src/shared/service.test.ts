import { describe, expect, it } from "vitest";
import { createServiceHealth } from "./service";

describe("desktop service bridge", () => {
  it("reports the shared contract version", () => {
    expect(createServiceHealth()).toEqual({ status: "ready", contractVersion: "1.0.0" });
  });
});

