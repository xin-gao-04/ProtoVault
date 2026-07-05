import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, semanticDiffReportSchema, serviceRequestSchema, workspaceSchema, workspaceViewSchema } from "./index.js";

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

  it("validates a git baseline semantic diff report", () => {
    const baseline = {
      id: "protovault-baseline-test",
      tagName: "protovault/baseline/test",
      branch: "main",
      commit: "0123456789abcdef",
      shortCommit: "0123456",
      createdAt: "2026-07-05T00:00:00.000Z",
      path: "D:/demo/.protocol/baselines/protovault-baseline-test.json",
      relativePath: ".protocol/baselines/protovault-baseline-test.json",
      typeCount: 1,
      fileCount: 1,
      networkNodeCount: 2,
      networkLinkCount: 1,
      protocolBindingCount: 1
    };
    const report = {
      generatedAt: "2026-07-05T00:01:00.000Z",
      baseBaseline: baseline,
      currentBaseline: { ...baseline, tagName: "working-tree" },
      baseRef: "protovault/baseline/test",
      targetRef: "working-tree",
      changeCount: 1,
      breakingCount: 0,
      compatibleCount: 0,
      reviewCount: 1,
      changes: [{
        id: "change:binding-bandwidth",
        kind: "protocol-binding-bandwidth-changed",
        severity: "review",
        message: "Packet@20Hz bandwidth changed.",
        before: 80,
        after: 160
      }]
    };

    expect(semanticDiffReportSchema.parse(report)).toEqual(report);
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
      network: {
        schemaVersion: 1,
        nodes: [],
        links: [],
        bindings: [],
        views: []
      },
      diagnostics: [],
      scanner: "Clang AST"
    };

    expect(workspaceViewSchema.parse(input)).toEqual(input);
  });
});
