import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, serviceRequestSchema, workspaceSchema } from "./index.js";

describe("workspace contract", () => {
  it("round-trips a minimal workspace", () => {
    const input = {
      contractVersion: CONTRACT_VERSION,
      id: "workspace:demo",
      name: "Demo",
      rootPath: "C:/demo",
      revision: 0,
      files: [], namespaces: [], structs: [], enums: [], diagnostics: []
    };
    expect(workspaceSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it("rejects an unknown API method", () => {
    expect(serviceRequestSchema.safeParse({ id: "1", method: "workspace/delete", payload: {} }).success).toBe(false);
  });
});

