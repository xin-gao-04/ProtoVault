import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearWorkspaceRuntimeCaches,
  generateProtocolDocument,
  lintWorkspace,
  scanWorkspace,
  updateHeaderContent
} from "./workspace";

const roots: string[] = [];

async function workspaceRoot(label: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), `protovault-parser-${label}-`));
  roots.push(root);
  return root;
}

async function header(root: string, relativePath: string, content: string): Promise<string> {
  const target = resolve(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}

afterEach(async () => {
  clearWorkspaceRuntimeCaches();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("complex Header parser release matrix", () => {
  it("parses namespaces, aliases, arrays, enum expressions, initializers, nested references, and pack layout", async () => {
    const root = await workspaceRoot("supported");
    await header(root, "headers/core/types.hpp", `#pragma once
#include <cstdint>
namespace protocol::core {
using PacketId = std::uint32_t;
typedef std::uint16_t ChannelId;

enum class Mode : std::uint8_t {
  Idle = 0,
  Running = 4,
  Next,
};

#pragma pack(push, 1)
struct Header {
  PacketId id = 42; // packet identity
  ChannelId channel;
  std::uint8_t flags[3];
  Mode mode = Mode::Idle;
};
#pragma pack(pop)

struct Envelope {
  struct Metadata {
    std::uint16_t source;
  };
  Metadata metadata;
};

typedef struct {
  std::uint16_t legacyCode;
} LegacyHeader;

struct MatrixPacket {
  std::uint16_t cells[2][3];
};
}
`);
    await header(root, "headers/model/geometry.hpp", `#pragma once
namespace protocol::model {
struct Vec3 {
  float x;
  float y;
  float z;
};
}
`);
    await header(root, "headers/message/packet.hpp", `#pragma once
#include "../core/types.hpp"
#include "../model/geometry.hpp"
namespace protocol::message {
struct Packet {
  protocol::core::Header header;
  protocol::model::Vec3 samples[2];
};
}
`);

    const workspace = await scanWorkspace(root);
    expect(workspace.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(workspace.types.map((type) => type.qualifiedName)).toEqual(expect.arrayContaining([
      "protocol::core::Mode",
      "protocol::core::Header",
      "protocol::core::Envelope",
      "protocol::core::Envelope::Metadata",
      "protocol::core::LegacyHeader",
      "protocol::core::MatrixPacket",
      "protocol::model::Vec3",
      "protocol::message::Packet"
    ]));

    const mode = workspace.types.find((type) => type.qualifiedName === "protocol::core::Mode");
    expect(mode?.values.map((value) => [value.name, value.value])).toEqual([
      ["Idle", 0],
      ["Running", 4],
      ["Next", 5]
    ]);
    expect(mode?.layout).toMatchObject({ size: 1, alignment: 1, partial: false });

    const protocolHeader = workspace.types.find((type) => type.qualifiedName === "protocol::core::Header");
    expect(protocolHeader?.pack).toBe(1);
    expect(protocolHeader?.fields.map((field) => field.name)).toEqual(["id", "channel", "flags", "mode"]);
    expect(protocolHeader?.fields[0]).toMatchObject({ initializer: "42", note: "packet identity" });
    expect(protocolHeader?.fields[0].canonicalType).toBeTruthy();
    expect(protocolHeader?.layout).toMatchObject({ size: 10, alignment: 1, dataSize: 10, paddingBytes: 0, partial: false });

    const packet = workspace.types.find((type) => type.qualifiedName === "protocol::message::Packet");
    expect(packet?.layout).toMatchObject({ size: 36, alignment: 4, partial: false });
    expect(workspace.types.find((type) => type.qualifiedName === "protocol::core::Envelope")?.layout).toMatchObject({
      size: 2,
      partial: false
    });
    expect(workspace.types.find((type) => type.qualifiedName === "protocol::core::LegacyHeader")?.fields.map((field) => field.name)).toEqual([
      "legacyCode"
    ]);
    expect(workspace.types.find((type) => type.qualifiedName === "protocol::core::MatrixPacket")?.layout).toMatchObject({
      size: 12,
      dataSize: 12,
      partial: false
    });
  }, 45_000);

  it("diagnoses and excludes unsupported declarations without hiding supported neighbors", async () => {
    const root = await workspaceRoot("unsupported");
    await header(root, "headers/mixed.hpp", `#pragma once
template <typename T>
struct GenericPacket { T value; };

struct PlainPacket { int value; };
struct DerivedPacket : PlainPacket { int extra; };
union VariantPacket { int integer; float decimal; };

struct RuntimePacket {
  PlainPacket* pointer;
  void reset();
};

class StatefulPacket { int hidden; };
struct BitPacket { unsigned int ready : 1; };

#define DECLARE_PACKET(name) struct name { int generated; }
#if defined(PROTOVAULT_OPTIONAL_PACKET)
struct ConditionalPacket { int value; };
#endif
`);

    const workspace = await scanWorkspace(root);
    const names = workspace.types.map((type) => type.name);
    expect(names).toContain("PlainPacket");
    expect(names).toContain("RuntimePacket");
    expect(names).not.toContain("GenericPacket");
    expect(names).not.toContain("DerivedPacket");
    const messages = workspace.diagnostics.map((item) => item.message).join("\n");
    expect(messages).toContain("模板类型 GenericPacket");
    expect(messages).toContain("继承结构 DerivedPacket");
    expect(messages).toContain("union VariantPacket");
    expect(messages).toContain("class StatefulPacket");
    expect(messages).toContain("位域字段");
    expect(messages).toContain("成员函数 reset");
    expect(messages).toContain("宏生成的类型声明");
    expect(messages).toContain("条件编译表达式");

    const lint = await lintWorkspace(root);
    expect(lint.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "type.unsupported-runtime", targetId: expect.stringContaining("field:") })
    ]));
  }, 45_000);

  it("updates healthy declarations and preserves the last valid broken declaration in one damaged Header", async () => {
    const root = await workspaceRoot("partial");
    const target = await header(root, "headers/combined.hpp", `#pragma once
struct HealthyPacket { int id; };
enum class RecoverableMode : int { Idle = 0, Active = 1 };
`);
    const baseline = await scanWorkspace(root);
    expect(baseline.types).toHaveLength(2);

    await writeFile(target, `#pragma once
struct HealthyPacket { int id; int sequence; };
enum class RecoverableMode : int {
  Idle = 0
  Active = 1,
};
`, "utf8");
    const damaged = await scanWorkspace(root);
    expect(damaged.types.find((type) => type.name === "HealthyPacket")?.fields.map((field) => field.name)).toEqual(["id", "sequence"]);
    expect(damaged.types.find((type) => type.name === "RecoverableMode")?.values.map((value) => value.name)).toEqual(["Idle", "Active"]);
    expect(damaged.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", file: target, line: 4 }),
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("健康声明") })
    ]));

    const repaired = await updateHeaderContent({
      workspaceRoot: root,
      headerPath: target,
      content: `#pragma once
struct HealthyPacket { int id; int sequence; };
enum class RecoverableMode : int {
  Idle = 0,
  Active = 1,
  Finished = 2,
};
`
    });
    expect(repaired.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(repaired.types.find((type) => type.name === "RecoverableMode")?.values.map((value) => value.name)).toEqual([
      "Idle",
      "Active",
      "Finished"
    ]);
  }, 45_000);

  it("keeps scan, lint, documentation, source repair, and rescan usable with broken sibling files", async () => {
    const root = await workspaceRoot("degraded-operations");
    await header(root, "headers/good.hpp", `#pragma once
#include <cstdint>
struct GoodPacket { std::uint32_t id; };
`);
    const brokenPath = await header(root, "headers/broken.hpp", `#pragma once
#include "missing_dependency.hpp"
struct BrokenPacket { int value; };
`);

    const workspace = await scanWorkspace(root);
    expect(workspace.files).toHaveLength(2);
    expect(workspace.types.map((type) => type.name)).toContain("GoodPacket");
    expect(workspace.diagnostics.some((item) => item.severity === "error" && item.file === brokenPath)).toBe(true);

    const lint = await lintWorkspace(root);
    expect(lint.issues.some((item) => item.ruleId === "scan.diagnostic" && item.severity === "error")).toBe(true);
    const document = await generateProtocolDocument({ workspaceRoot: root });
    expect(document.content).toContain("GoodPacket");
    expect(await readFile(document.path, "utf8")).toContain("Lint 问题");

    const repaired = await updateHeaderContent({
      workspaceRoot: root,
      headerPath: brokenPath,
      content: "#pragma once\nstruct BrokenPacket { int value; };\n"
    });
    expect(repaired.types.map((type) => type.name)).toEqual(expect.arrayContaining(["GoodPacket", "BrokenPacket"]));
    expect(repaired.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  }, 60_000);

  it("does not guess ambiguous dependencies and survives valid cyclic include graphs", async () => {
    const root = await workspaceRoot("dependencies");
    await header(root, "headers/a/token.hpp", "#pragma once\nnamespace a { struct Token { int value; }; }\n");
    await header(root, "headers/b/token.hpp", "#pragma once\nnamespace b { struct Token { int value; }; }\n");
    await header(root, "headers/ambiguous.hpp", "#pragma once\nstruct AmbiguousConsumer { Token value; };\n");
    await header(root, "headers/cycle/a.hpp", `#pragma once
struct CycleB;
#include "b.hpp"
struct CycleA { CycleB* peer; };
`);
    await header(root, "headers/cycle/b.hpp", `#pragma once
struct CycleA;
#include "a.hpp"
struct CycleB { CycleA* peer; };
`);

    const workspace = await scanWorkspace(root);
    expect(workspace.types.map((type) => type.qualifiedName)).toEqual(expect.arrayContaining([
      "a::Token",
      "b::Token",
      "CycleA",
      "CycleB"
    ]));
    expect(workspace.types.map((type) => type.name)).not.toContain("AmbiguousConsumer");
    expect(workspace.diagnostics.some((item) => item.file?.endsWith("ambiguous.hpp") && item.message.includes("unknown type name"))).toBe(true);
    expect(workspace.diagnostics.some((item) => item.file?.endsWith("ambiguous.hpp") && item.message.includes("依赖恢复"))).toBe(false);
  }, 60_000);

  it("keeps BOM, CRLF, unicode, block comments, and inline field notes parseable", async () => {
    const root = await workspaceRoot("encoding-comments");
    await header(root, "headers/中文 协议/telemetry.hpp", `\uFEFF#pragma once\r
#include <cstdint>\r
namespace encoding {\r
/**\r
 * @brief 遥测数据包\r
 * second line\r
 */\r
struct Telemetry {\r
  std::uint32_t id; // 唯一编号\r
  /* 信号质量 */\r
  float quality;\r
};\r
}\r
`);

    const workspace = await scanWorkspace(root);
    const telemetry = workspace.types.find((type) => type.qualifiedName === "encoding::Telemetry");
    expect(telemetry?.note).toBe("遥测数据包\nsecond line");
    expect(telemetry?.fields.map((field) => [field.name, field.note])).toEqual([
      ["id", "唯一编号"],
      ["quality", "信号质量"]
    ]);
    expect(telemetry?.layout).toMatchObject({ size: 8, partial: false });
    expect(workspace.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  }, 45_000);

  it("reports monotonic progress and preserves healthy results in a larger mixed workspace", async () => {
    const root = await workspaceRoot("scale");
    const headerCount = 24;
    for (let index = 0; index < headerCount; index += 1) {
      await header(root, `headers/module_${index % 4}/packet_${index}.hpp`, `#pragma once
#include <cstdint>
namespace scale::module_${index % 4} {
enum class State${index} : std::uint8_t { Idle = 0, Active = 1 };
struct Packet${index} {
  std::uint32_t id = ${index};
  std::uint16_t samples[4];
  State${index} state = State${index}::Idle;
};
}
`);
    }
    await header(root, "headers/broken/local_error.hpp", "#pragma once\nstruct LocalError { int first int second; };\n");

    const parseProgress: number[] = [];
    const workspace = await scanWorkspace(root, {
      onProgress: (event) => {
        if (event.phase === "parse") parseProgress.push(event.current);
      }
    });
    expect(workspace.files).toHaveLength(headerCount + 1);
    expect(workspace.types.filter((type) => type.kind === "struct")).toHaveLength(headerCount);
    expect(workspace.types.filter((type) => type.kind === "enum")).toHaveLength(headerCount);
    expect(workspace.diagnostics.some((item) => item.severity === "error" && item.file?.endsWith("local_error.hpp"))).toBe(true);
    expect(parseProgress.at(0)).toBe(0);
    expect(parseProgress.at(-1)).toBe(headerCount + 1);
    expect(parseProgress.every((value, index) => index === 0 || value >= parseProgress[index - 1])).toBe(true);
  }, 120_000);
});
