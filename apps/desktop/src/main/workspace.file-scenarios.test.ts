import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHeader,
  deleteHeader,
  scanWorkspace,
  updateHeaderContent
} from "./workspace";

describe("workspace local file scenarios", () => {
  it("rejects single-file opens while preserving empty folders in an empty workspace", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-local-empty-"));
    try {
      await mkdir(resolve(root, "empty", "nested"), { recursive: true });
      await writeFile(resolve(root, "README.md"), "# not a header\n", "utf8");

      await expect(scanWorkspace(resolve(root, "README.md"))).rejects.toThrow("请选择工作区文件夹");

      const workspace = await scanWorkspace(root);
      expect(workspace.files).toEqual([]);
      expect(workspace.types).toEqual([]);
      expect(workspace.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: "warning", message: expect.stringContaining("未在该工作区中发现") })
      ]));
      expect(workspace.directories.map((directory) => directory.relativePath)).toEqual(expect.arrayContaining([
        "empty",
        "empty/nested"
      ]));

      const record = JSON.parse(await readFile(resolve(root, ".protocol", "workspace.json"), "utf8")) as {
        counts: { directories: number; headers: number; types: number; diagnostics: number };
        directories: Array<{ path: string }>;
      };
      expect(record.counts.headers).toBe(0);
      expect(record.counts.types).toBe(0);
      expect(record.counts.diagnostics).toBeGreaterThanOrEqual(1);
      expect(record.directories.map((directory) => directory.path)).toEqual(expect.arrayContaining(["empty", "empty/nested"]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("scans many local headers and filters generated, vendor, build, and metadata folders", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-local-many-"));
    try {
      await mkdir(resolve(root, "headers", "module-a"), { recursive: true });
      await mkdir(resolve(root, "headers", "module-b", "empty"), { recursive: true });
      await mkdir(resolve(root, ".protocol", "generated"), { recursive: true });
      await mkdir(resolve(root, "node_modules", "noise"), { recursive: true });
      await mkdir(resolve(root, "vendor", "sdk"), { recursive: true });
      await mkdir(resolve(root, "build-debug", "generated"), { recursive: true });
      await mkdir(resolve(root, "cmake-build-release", "generated"), { recursive: true });

      for (let index = 0; index < 10; index += 1) {
        const module = index % 2 === 0 ? "module-a" : "module-b";
        await writeFile(resolve(root, "headers", module, `packet_${index}.hpp`), `#pragma once
#include <cstdint>
namespace demo::${module.replace("-", "_")} {
struct Packet${index} {
  std::uint32_t id;
  std::uint16_t sequence;
};
}
`, "utf8");
      }
      await writeFile(resolve(root, ".protocol", "generated", "ignored.hpp"), "struct ProtocolGeneratedNoise { int value; };\n", "utf8");
      await writeFile(resolve(root, "node_modules", "noise", "ignored.hpp"), "struct NodeModuleNoise { int value; };\n", "utf8");
      await writeFile(resolve(root, "vendor", "sdk", "ignored.hpp"), "struct VendorNoise { int value; };\n", "utf8");
      await writeFile(resolve(root, "build-debug", "generated", "ignored.hpp"), "struct BuildNoise { int value; };\n", "utf8");
      await writeFile(resolve(root, "cmake-build-release", "generated", "ignored.hpp"), "struct CMakeNoise { int value; };\n", "utf8");

      const progress: string[] = [];
      const workspace = await scanWorkspace(root, {
        onProgress: (event) => progress.push(`${event.phase}:${event.current}/${event.total}`)
      });

      expect(workspace.files).toHaveLength(10);
      expect(workspace.types).toHaveLength(10);
      expect(workspace.files.every((file) => file.relativePath.startsWith("headers/"))).toBe(true);
      expect(workspace.types.map((type) => type.qualifiedName)).toEqual(expect.arrayContaining([
        "demo::module_a::Packet0",
        "demo::module_b::Packet1",
        "demo::module_a::Packet8",
        "demo::module_b::Packet9"
      ]));
      expect(workspace.types.map((type) => type.qualifiedName).join("\n")).not.toContain("Noise");
      expect(workspace.directories.map((directory) => directory.relativePath)).toContain("headers/module-b/empty");
      expect(workspace.directories.map((directory) => directory.relativePath).some((path) => path.startsWith(".protocol"))).toBe(false);
      expect(progress.some((event) => event.startsWith("discover:"))).toBe(true);
      expect(progress.some((event) => event.startsWith("read:10/10"))).toBe(true);
      expect(progress.some((event) => event.startsWith("parse:10/10"))).toBe(true);
      expect(progress.at(-1)).toBe("done:1/1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);

  it("reports broken headers without losing valid local protocol files", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-local-broken-"));
    try {
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "good.hpp"), `#pragma once
#include <cstdint>
namespace demo {
struct GoodPacket {
  std::uint32_t id;
};
}
`, "utf8");
      await writeFile(resolve(root, "headers", "missing_include.hpp"), `#pragma once
#include "does_not_exist.hpp"
namespace demo {
struct MissingIncludePacket {
  std::uint32_t id;
};
}
`, "utf8");
      await writeFile(resolve(root, "headers", "syntax_error.hpp"), `#pragma once
namespace demo {
enum class Broken {
  One = 1
  Two,
};
}
`, "utf8");

      const workspace = await scanWorkspace(root);
      expect(workspace.files.map((file) => file.relativePath).sort()).toEqual([
        "headers/good.hpp",
        "headers/missing_include.hpp",
        "headers/syntax_error.hpp"
      ]);
      expect(workspace.types.map((type) => type.qualifiedName)).toContain("demo::GoodPacket");
      expect(workspace.diagnostics.length).toBeGreaterThanOrEqual(2);
      expect(workspace.diagnostics.map((diagnostic) => diagnostic.file?.replaceAll("\\", "/")).join("\n")).toContain("headers/");
      expect(workspace.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toMatch(/file not found|missing|expected|error/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("guards local write operations against path escape and non-header targets", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-local-guards-"));
    try {
      await expect(createHeader({ workspaceRoot: root, relativePath: "../escape.hpp" })).rejects.toThrow("上级目录");
      await expect(createHeader({ workspaceRoot: root, relativePath: "headers/not-header.txt" })).rejects.toThrow("Header 文件必须使用");

      await createHeader({ workspaceRoot: root, relativePath: "headers/safe.hpp" });
      await mkdir(resolve(root, "docs"), { recursive: true });
      await writeFile(resolve(root, "docs", "notes.txt"), "not a header\n", "utf8");
      await writeFile(resolve(root, "..", "outside-protovault-test.hpp"), "#pragma once\n", "utf8").catch(() => undefined);

      await expect(updateHeaderContent({
        workspaceRoot: root,
        headerPath: resolve(root, "..", "outside-protovault-test.hpp"),
        content: "#pragma once\n"
      })).rejects.toThrow("目标路径必须位于当前工作区内");
      await expect(updateHeaderContent({
        workspaceRoot: root,
        headerPath: resolve(root, "docs", "notes.txt"),
        content: "changed\n"
      })).rejects.toThrow("只能编辑 Header 文件内容");
      await expect(deleteHeader({
        workspaceRoot: root,
        headerPath: resolve(root, "..", "outside-protovault-test.hpp")
      })).rejects.toThrow("目标路径必须位于当前工作区内");

      const safeHeader = await readFile(resolve(root, "headers", "safe.hpp"), "utf8");
      expect(safeHeader).toContain("namespace protovault");
    } finally {
      await rm(resolve(root, "..", "outside-protovault-test.hpp"), { force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("handles unicode and spaced header paths as first-class local workspace files", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-local-unicode-"));
    try {
      await mkdir(resolve(root, "headers", "带 空格"), { recursive: true });
      const headerPath = resolve(root, "headers", "带 空格", "协议.hpp");
      await writeFile(headerPath, `#pragma once
namespace demo::unicode_path {
struct Packet {
  bool ok;
  char code;
};
}
`, "utf8");

      const workspace = await scanWorkspace(root);
      expect(workspace.files.map((file) => file.relativePath)).toEqual(["headers/带 空格/协议.hpp"]);
      const packet = workspace.types.find((type) => type.qualifiedName === "demo::unicode_path::Packet");
      expect(packet?.file).toBe(headerPath);
      expect(packet?.fields.map((field) => [field.name, field.type])).toEqual([["ok", "bool"], ["code", "char"]]);

      const record = JSON.parse(await readFile(resolve(root, ".protocol", "workspace.json"), "utf8")) as {
        headers: Array<{ path: string }>;
      };
      expect(record.headers.map((header) => header.path)).toEqual(["headers/带 空格/协议.hpp"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
