import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, serviceRequestSchema, workspaceSchema, workspaceViewSchema } from "./index.js";

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

  it("validates the desktop workspace view contract", () => {
    const input = {
      name: "fixtures",
      rootPath: "D:/code/ProtoVault/fixtures",
      directories: [{ path: "D:/code/ProtoVault/fixtures/radar-workspace", relativePath: "radar-workspace" }],
      files: [{
        path: "D:/code/ProtoVault/fixtures/radar-workspace/headers/common/geometry.hpp",
        relativePath: "radar-workspace/headers/common/geometry.hpp",
        includes: ["cstdint"],
        content: "#pragma once\n",
        contentHash: "sha256"
      }],
      types: [{
        id: "type:vec3",
        kind: "struct",
        name: "Vec3",
        qualifiedName: "demo::common::Vec3",
        file: "D:/code/ProtoVault/fixtures/radar-workspace/headers/common/geometry.hpp",
        layout: {
          dataSize: 24,
          paddingBytes: 0,
          partial: false,
          source: "estimated",
          fields: []
        },
        fields: [],
        values: []
      }],
      diagnostics: [],
      scanner: "Clang AST"
    };

    expect(workspaceViewSchema.parse(input)).toEqual(input);
  });
});
