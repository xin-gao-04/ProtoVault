import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { WorkspaceTypeView } from "../shared/workspace";
import {
  addEnumValue,
  addField,
  createNetworkLink,
  createNetworkFlowView,
  createNetworkNode,
  checkoutGitBranch,
  commitGitWorkspace,
  createProtocolBaselineTag,
  createProtocolBinding,
  createGitBranch,
  createEnum,
  createHeader,
  createStruct,
  deleteEnum,
  deleteEnumValue,
  deleteField,
  deleteHeader,
  deleteNetworkLink,
  deleteNetworkFlowView,
  deleteNetworkNode,
  deleteProtocolBinding,
  deleteStruct,
  diffProtocolBaseline,
  generateNetworkReport,
  generateProtocolDocument,
  getGitFileDiff,
  getGitStatus,
  listGitCommitGraph,
  listGitTags,
  lintWorkspace,
  renameEnum,
  renameHeader,
  renameStruct,
  updateNetworkLink,
  updateNetworkFlowView,
  updateNetworkNode,
  updateProtocolBinding,
  scanWorkspace,
  stageGitPath,
  stageGitWorkspace,
  unstageGitPath,
  unstageGitWorkspace,
  updateDataFlow,
  updateEnumValue,
  updateField,
  updateHeaderContent,
  updateHeaderIncludes,
  updateNote
} from "./workspace";

const execFileAsync = promisify(execFile);
const fixtureWorkspace = resolve(import.meta.dirname, "../../../../fixtures");

type ProbeMetrics = Record<string, number>;

async function findTestClang(): Promise<string> {
  const candidates = [
    process.env.PROTOVAULT_CLANGXX,
    "clang++",
    "C:/Program Files/LLVM/bin/clang++.exe"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { windowsHide: true });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("未找到 clang++，无法执行布局交叉验证测试。");
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
}

async function runLayoutProbe(): Promise<ProbeMetrics> {
  const clang = await findTestClang();
  const root = await mkdtemp(resolve(tmpdir(), "protovault-layout-"));
  try {
    const sourcePath = resolve(root, "layout_probe.cpp");
    const outputPath = resolve(root, process.platform === "win32" ? "layout_probe.exe" : "layout_probe");
    await writeFile(sourcePath, `
#include <cstddef>
#include <cstdint>
#include <iostream>
#include "radar-workspace/headers/common/geometry.hpp"
#include "radar-workspace/headers/common/time.hpp"
#include "radar-workspace/headers/radar/track.hpp"

#define TYPE_METRIC(ALIAS, TYPE) \\
  std::cout << ALIAS ".size=" << sizeof(TYPE) << "\\n"; \\
  std::cout << ALIAS ".align=" << alignof(TYPE) << "\\n";

#define FIELD_METRIC(ALIAS, TYPE, FIELD) \\
  std::cout << ALIAS "." #FIELD ".offset=" << offsetof(TYPE, FIELD) << "\\n"; \\
  std::cout << ALIAS "." #FIELD ".size=" << sizeof(((TYPE*)0)->FIELD) << "\\n";

int main() {
  using demo::common::CoordinateFrame;
  using demo::common::Pose3D;
  using demo::common::QualityLevel;
  using demo::common::Quaternion;
  using demo::common::SequenceId;
  using demo::common::Timestamp;
  using demo::common::Vec3;
  using demo::radar::RadarTrack;
  using demo::radar::TrackCluster;
  using demo::radar::TrackState;

  TYPE_METRIC("Vec3", Vec3)
  FIELD_METRIC("Vec3", Vec3, x)
  FIELD_METRIC("Vec3", Vec3, y)
  FIELD_METRIC("Vec3", Vec3, z)

  TYPE_METRIC("Quaternion", Quaternion)
  FIELD_METRIC("Quaternion", Quaternion, w)
  FIELD_METRIC("Quaternion", Quaternion, x)
  FIELD_METRIC("Quaternion", Quaternion, y)
  FIELD_METRIC("Quaternion", Quaternion, z)

  TYPE_METRIC("Pose3D", Pose3D)
  FIELD_METRIC("Pose3D", Pose3D, position)
  FIELD_METRIC("Pose3D", Pose3D, orientation)

  TYPE_METRIC("Timestamp", Timestamp)
  FIELD_METRIC("Timestamp", Timestamp, seconds)
  FIELD_METRIC("Timestamp", Timestamp, nanoseconds)

  TYPE_METRIC("SequenceId", SequenceId)
  FIELD_METRIC("SequenceId", SequenceId, source)
  FIELD_METRIC("SequenceId", SequenceId, counter)

  TYPE_METRIC("RadarTrack", RadarTrack)
  FIELD_METRIC("RadarTrack", RadarTrack, trackId)
  FIELD_METRIC("RadarTrack", RadarTrack, timestamp)
  FIELD_METRIC("RadarTrack", RadarTrack, position)
  FIELD_METRIC("RadarTrack", RadarTrack, velocity)
  FIELD_METRIC("RadarTrack", RadarTrack, frame)
  FIELD_METRIC("RadarTrack", RadarTrack, state)
  FIELD_METRIC("RadarTrack", RadarTrack, confidence)
  FIELD_METRIC("RadarTrack", RadarTrack, history)

  TYPE_METRIC("TrackCluster", TrackCluster)
  FIELD_METRIC("TrackCluster", TrackCluster, clusterId)
  FIELD_METRIC("TrackCluster", TrackCluster, trackCount)
  FIELD_METRIC("TrackCluster", TrackCluster, trackIds)
  FIELD_METRIC("TrackCluster", TrackCluster, quality)

  TYPE_METRIC("CoordinateFrame", CoordinateFrame)
  TYPE_METRIC("QualityLevel", QualityLevel)
  TYPE_METRIC("TrackState", TrackState)
}
`, "utf8");
    await execFileAsync(clang, ["-std=c++20", sourcePath, "-I", fixtureWorkspace, "-o", outputPath], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });
    const { stdout } = await execFileAsync(outputPath, [], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return Object.fromEntries(stdout.trim().split(/\r?\n/).map((line) => {
      const [key, value] = line.split("=");
      return [key, Number(value)];
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function expectLayoutMatchesCompiler(type: WorkspaceTypeView, alias: string, probe: ProbeMetrics): void {
  expect(type.layout?.partial).toBe(false);
  expect(type.layout?.size).toBe(probe[`${alias}.size`]);
  expect(type.layout?.alignment).toBe(probe[`${alias}.align`]);
  for (const field of type.fields) {
    const layout = type.layout?.fields.find((item) => item.fieldId === field.id);
    expect(layout?.supported).toBe(true);
    expect(layout?.offset).toBe(probe[`${alias}.${field.name}.offset`]);
    expect(layout?.size).toBe(probe[`${alias}.${field.name}.size`]);
  }
}

describe("scanWorkspace", () => {
  it("loads headers when opening the fixture parent folder", async () => {
    const workspace = await scanWorkspace(fixtureWorkspace);

    expect(workspace.diagnostics).toEqual([]);
    expect(workspace.directories.map((directory) => directory.relativePath)).toEqual(expect.arrayContaining([
      "radar-workspace",
      "radar-workspace/headers",
      "radar-workspace/headers/common",
      "radar-workspace/headers/radar"
    ]));
    expect(workspace.files.map((file) => file.relativePath)).toEqual([
      "radar-workspace/headers/common/geometry.hpp",
      "radar-workspace/headers/common/time.hpp",
      "radar-workspace/headers/control/commands.hpp",
      "radar-workspace/headers/diagnostics/faults.hpp",
      "radar-workspace/headers/radar/detection.hpp",
      "radar-workspace/headers/radar/track.hpp",
      "radar-workspace/headers/telemetry/status.hpp"
    ]);
    expect(workspace.files.find((file) => file.relativePath.endsWith("track.hpp"))?.content).toContain("struct RadarTrack");
    expect(workspace.types.map((type) => type.qualifiedName)).toEqual(expect.arrayContaining([
      "demo::common::CoordinateFrame",
      "demo::common::Pose3D",
      "demo::common::QualityLevel",
      "demo::common::Timestamp",
      "demo::common::Vec3",
      "demo::control::TrackRegionCommand",
      "demo::diagnostics::FaultEvent",
      "demo::radar::DetectionFrame",
      "demo::radar::RadarDetection",
      "demo::radar::RadarTrack",
      "demo::telemetry::NodeStatus"
    ]));
    expect(workspace.types.map((type) => type.qualifiedName)).not.toContain("__vcrt_va_list_is_reference");

    const radarTrack = workspace.types.find((type) => type.qualifiedName === "demo::radar::RadarTrack");
    const vec3 = workspace.types.find((type) => type.qualifiedName === "demo::common::Vec3");
    const coordinateFrame = workspace.types.find((type) => type.qualifiedName === "demo::common::CoordinateFrame");

    expect(vec3?.file.replace(workspace.rootPath, "").replace(/^[/\\]/, "").replaceAll("\\", "/")).toBe("radar-workspace/headers/common/geometry.hpp");
    expect(coordinateFrame?.file.replace(workspace.rootPath, "").replace(/^[/\\]/, "").replaceAll("\\", "/")).toBe("radar-workspace/headers/common/geometry.hpp");
    expect(radarTrack?.file.replace(workspace.rootPath, "").replace(/^[/\\]/, "").replaceAll("\\", "/")).toBe("radar-workspace/headers/radar/track.hpp");

    expect(radarTrack?.fields.map((field) => [field.name, field.type])).toEqual([
      ["trackId", "std::uint32_t"],
      ["timestamp", "demo::common::Timestamp"],
      ["position", "demo::common::Vec3"],
      ["velocity", "demo::common::Vec3"],
      ["frame", "demo::common::CoordinateFrame"],
      ["state", "TrackState"],
      ["confidence", "float"],
      ["history", "std::uint16_t[8]"]
    ]);

    expect(coordinateFrame?.values.map((value) => ({ name: value.name, value: value.value }))).toEqual([
      { name: "Unknown", value: 0 },
      { name: "ENU", value: 1 },
      { name: "ECEF", value: 2 },
      { name: "SensorBody", value: 3 }
    ]);
  }, 30_000);

  it("emits scan progress for large workspace feedback", async () => {
    const events: string[] = [];
    const workspace = await scanWorkspace(fixtureWorkspace, {
      onProgress: (progress) => events.push(`${progress.phase}:${progress.current}/${progress.total}`)
    });

    expect(workspace.files.length).toBeGreaterThanOrEqual(7);
    expect(events.some((event) => event.startsWith("discover:"))).toBe(true);
    expect(events.some((event) => event.startsWith("read:"))).toBe(true);
    expect(events.some((event) => event.startsWith("parse:"))).toBe(true);
    expect(events.some((event) => event.startsWith("metadata:"))).toBe(true);
    expect(events.at(-1)).toBe("done:1/1");
  }, 30_000);

  it("recognizes common C++ header variants and skips generated dependency folders", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-header-variants-"));
    try {
      await mkdir(resolve(root, "headers", "core"), { recursive: true });
      await mkdir(resolve(root, "headers", "common"), { recursive: true });
      await mkdir(resolve(root, "headers", "messages"), { recursive: true });
      await mkdir(resolve(root, "node_modules", "noise"), { recursive: true });
      await writeFile(resolve(root, "node_modules", "noise", "ignored.hpp"), "struct ShouldNotAppear { int bad; };\n", "utf8");
      await writeFile(resolve(root, "headers", "core", "types.h"), `#pragma once
#include <cstdint>
namespace proto {
enum class Mode : std::uint8_t { Off = 0, On = 1 };
struct Vec2 { float x; float y; };
typedef std::uint16_t LegacyCount;
using Count = std::uint32_t;
}
`, "utf8");
      await writeFile(resolve(root, "headers", "common", "packet.hh"), `#pragma once
#include "core/types.h"
namespace proto::common {
#pragma pack(push, 1)
struct PackedPacket {
  std::uint8_t tag;
  std::uint32_t value;
};
#pragma pack(pop)
}
`, "utf8");
      await writeFile(resolve(root, "headers", "messages", "frame.hpp"), `#pragma once
#include "common/packet.hh"
namespace proto::messages {
struct Frame {
  proto::Mode mode;
  proto::common::PackedPacket packet;
  proto::Vec2 points[2];
  proto::Count count;
};
}
`, "utf8");
      await writeFile(resolve(root, "headers", "status.hxx"), `#pragma once
namespace proto {
struct Status {
  bool ok;
  char code;
};
}
`, "utf8");

      const progressFiles: string[] = [];
      const workspace = await scanWorkspace(root, {
        onProgress: (progress) => {
          if (progress.phase === "parse" && progress.file) progressFiles.push(progress.file);
        }
      });
      const byName = new Map(workspace.types.map((type) => [type.qualifiedName, type]));

      expect(workspace.files.map((file) => file.relativePath).sort()).toEqual([
        "headers/common/packet.hh",
        "headers/core/types.h",
        "headers/messages/frame.hpp",
        "headers/status.hxx"
      ]);
      expect(byName.has("ShouldNotAppear")).toBe(false);
      expect(byName.get("proto::Mode")?.underlyingType).toContain("uint8_t");
      expect(byName.get("proto::common::PackedPacket")?.pack).toBe(1);
      expect(byName.get("proto::messages::Frame")?.fields.map((field) => [field.name, field.type])).toEqual([
        ["mode", "proto::Mode"],
        ["packet", "proto::common::PackedPacket"],
        ["points", "proto::Vec2[2]"],
        ["count", "proto::Count"]
      ]);
      expect(byName.get("proto::Status")?.fields.map((field) => [field.name, field.type])).toEqual([["ok", "bool"], ["code", "char"]]);
      expect(progressFiles.length).toBe(4);
      expect(workspace.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).not.toContain("ignored.hpp");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches compiler sizeof/offsetof for supported layout fixtures", async () => {
    const workspace = await scanWorkspace(fixtureWorkspace);
    const probe = await runLayoutProbe();
    const byName = new Map(workspace.types.map((type) => [type.qualifiedName, type]));

    const vec3 = byName.get("demo::common::Vec3")!;
    const quaternion = byName.get("demo::common::Quaternion")!;
    const pose = byName.get("demo::common::Pose3D")!;
    const timestamp = byName.get("demo::common::Timestamp")!;
    const sequence = byName.get("demo::common::SequenceId")!;
    const radarTrack = byName.get("demo::radar::RadarTrack")!;
    const trackCluster = byName.get("demo::radar::TrackCluster")!;

    expectLayoutMatchesCompiler(vec3, "Vec3", probe);
    expectLayoutMatchesCompiler(quaternion, "Quaternion", probe);
    expectLayoutMatchesCompiler(pose, "Pose3D", probe);
    expectLayoutMatchesCompiler(timestamp, "Timestamp", probe);
    expectLayoutMatchesCompiler(sequence, "SequenceId", probe);
    expectLayoutMatchesCompiler(radarTrack, "RadarTrack", probe);
    expectLayoutMatchesCompiler(trackCluster, "TrackCluster", probe);

    expect(radarTrack.pack).toBe(4);
    expect(trackCluster.pack).toBe(4);
    expect(byName.get("demo::common::CoordinateFrame")?.layout?.size).toBe(probe["CoordinateFrame.size"]);
    expect(byName.get("demo::common::QualityLevel")?.layout?.size).toBe(probe["QualityLevel.size"]);
    expect(byName.get("demo::radar::TrackState")?.layout?.size).toBe(probe["TrackState.size"]);
  }, 30_000);

  it("keeps empty folders in the workspace tree", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-workspace-"));
    try {
      await mkdir(resolve(root, "empty-folder", "nested"), { recursive: true });
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "packet.hpp"), "namespace demo { struct Packet { int id; }; }\n", "utf8");

      const workspace = await scanWorkspace(root);
      expect(workspace.metadataPath).toBe(resolve(root, ".protocol", "workspace.json"));
      expect(workspace.directories.map((directory) => directory.relativePath)).toEqual(expect.arrayContaining([
        "empty-folder",
        "empty-folder/nested",
        "headers"
      ]));
      expect(workspace.files.map((file) => file.relativePath)).toEqual(["headers/packet.hpp"]);

      const record = JSON.parse(await readFile(resolve(root, ".protocol", "workspace.json"), "utf8")) as {
        directories: Array<{ path: string }>;
        headers: Array<{ path: string }>;
      };
      expect(record.directories.map((directory) => directory.path)).toEqual(expect.arrayContaining([
        "empty-folder",
        "empty-folder/nested",
        "headers"
      ]));
      expect(record.headers.map((header) => header.path)).toEqual(["headers/packet.hpp"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates, updates, deletes fields, and refreshes the workspace record", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-edit-"));
    try {
      const afterHeader = await createHeader({ workspaceRoot: root, relativePath: "headers/generated.hpp" });
      const header = afterHeader.files.find((file) => file.relativePath === "headers/generated.hpp");
      expect(header?.content).toContain("namespace protovault");
      expect(afterHeader.directories.map((directory) => directory.relativePath)).toContain("headers");

      const afterStruct = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "generated.hpp"),
        structName: "PacketHeader"
      });
      const packet = afterStruct.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(packet?.fields.map((field) => [field.type, field.name])).toEqual([["std::uint32_t", "id"]]);

      const afterField = await addField({
        workspaceRoot: root,
        typeId: packet!.id,
        fieldType: "std::uint16_t",
        fieldName: "flags",
        initializer: "0"
      });
      const updatedPacket = afterField.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(updatedPacket?.fields.map((field) => [field.type, field.name, field.initializer ?? ""])).toEqual([
        ["std::uint32_t", "id", ""],
        ["std::uint16_t", "flags", "0"]
      ]);

      const afterUpdate = await updateField({
        workspaceRoot: root,
        typeId: updatedPacket!.id,
        fieldId: updatedPacket!.fields.find((field) => field.name === "flags")!.id,
        fieldType: "std::uint8_t",
        fieldName: "status",
        initializer: "1"
      });
      const packetAfterUpdate = afterUpdate.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(packetAfterUpdate?.fields.map((field) => [field.type, field.name, field.initializer ?? ""])).toEqual([
        ["std::uint32_t", "id", ""],
        ["std::uint8_t", "status", "1"]
      ]);

      const afterDelete = await deleteField({
        workspaceRoot: root,
        typeId: packetAfterUpdate!.id,
        fieldId: packetAfterUpdate!.fields.find((field) => field.name === "status")!.id
      });
      const packetAfterDelete = afterDelete.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(packetAfterDelete?.fields.map((field) => [field.type, field.name])).toEqual([["std::uint32_t", "id"]]);

      const content = await readFile(resolve(root, "headers", "generated.hpp"), "utf8");
      expect(content).toContain("std::uint32_t id;");
      expect(content).not.toContain("flags;");
      expect(content).not.toContain("status;");

      const record = JSON.parse(await readFile(resolve(root, ".protocol", "workspace.json"), "utf8")) as {
        counts: { headers: number; types: number };
        types: Array<{ qualifiedName: string }>;
      };
      expect(record.counts.headers).toBe(1);
      expect(record.types.map((type) => type.qualifiedName)).toContain("protovault::PacketHeader");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("renames and deletes headers and structs", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-crud-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/source.hpp" });
      let workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "source.hpp"),
        structName: "SourcePacket"
      });
      let packet = workspace.types.find((type) => type.qualifiedName === "protovault::SourcePacket");
      expect(packet).toBeTruthy();

      workspace = await renameStruct({
        workspaceRoot: root,
        typeId: packet!.id,
        structName: "RenamedPacket"
      });
      packet = workspace.types.find((type) => type.qualifiedName === "protovault::RenamedPacket");
      expect(packet).toBeTruthy();
      expect(await readFile(resolve(root, "headers", "source.hpp"), "utf8")).toContain("struct RenamedPacket");

      workspace = await deleteStruct({ workspaceRoot: root, typeId: packet!.id });
      expect(workspace.types.map((type) => type.qualifiedName)).not.toContain("protovault::RenamedPacket");
      expect(await readFile(resolve(root, "headers", "source.hpp"), "utf8")).not.toContain("struct RenamedPacket");

      workspace = await renameHeader({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "source.hpp"),
        newRelativePath: "headers/renamed.hpp"
      });
      expect(workspace.files.map((file) => file.relativePath)).toEqual(["headers/renamed.hpp"]);

      workspace = await deleteHeader({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "renamed.hpp")
      });
      expect(workspace.files).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates, updates, deletes enums and enum values", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-enum-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/enums.hpp" });
      let workspace = await createEnum({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "enums.hpp"),
        enumName: "PacketKind"
      });
      let packetKind = workspace.types.find((type) => type.qualifiedName === "protovault::PacketKind");
      expect(packetKind?.kind).toBe("enum");
      expect(packetKind?.values.map((value) => [value.name, value.value])).toEqual([["Unknown", 0]]);

      workspace = await addEnumValue({
        workspaceRoot: root,
        typeId: packetKind!.id,
        valueName: "Telemetry",
        value: 7
      });
      packetKind = workspace.types.find((type) => type.qualifiedName === "protovault::PacketKind");
      expect(packetKind?.values.map((value) => [value.name, value.value])).toEqual([["Unknown", 0], ["Telemetry", 7]]);

      workspace = await updateEnumValue({
        workspaceRoot: root,
        typeId: packetKind!.id,
        valueId: packetKind!.values.find((value) => value.name === "Telemetry")!.id,
        valueName: "Track",
        value: 8
      });
      packetKind = workspace.types.find((type) => type.qualifiedName === "protovault::PacketKind");
      expect(packetKind?.values.map((value) => [value.name, value.value])).toEqual([["Unknown", 0], ["Track", 8]]);

      workspace = await deleteEnumValue({
        workspaceRoot: root,
        typeId: packetKind!.id,
        valueId: packetKind!.values.find((value) => value.name === "Track")!.id
      });
      packetKind = workspace.types.find((type) => type.qualifiedName === "protovault::PacketKind");
      expect(packetKind?.values.map((value) => value.name)).toEqual(["Unknown"]);

      workspace = await renameEnum({ workspaceRoot: root, typeId: packetKind!.id, enumName: "MessageKind" });
      packetKind = workspace.types.find((type) => type.qualifiedName === "protovault::MessageKind");
      expect(packetKind).toBeTruthy();
      expect(await readFile(resolve(root, "headers", "enums.hpp"), "utf8")).toContain("enum class MessageKind");

      workspace = await deleteEnum({ workspaceRoot: root, typeId: packetKind!.id });
      expect(workspace.types.map((type) => type.qualifiedName)).not.toContain("protovault::MessageKind");
      expect(await readFile(resolve(root, "headers", "enums.hpp"), "utf8")).not.toContain("enum class MessageKind");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("adds enum values without corrupting enums that omit the trailing comma", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-enum-comma-"));
    try {
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "quality.hpp"), `#pragma once
#include <cstdint>
namespace demo {
enum class QualityLevel : std::uint8_t {
  Low = 1,
  Medium = 2,
  High = 3
};
}
`, "utf8");

      let workspace = await scanWorkspace(root);
      const quality = workspace.types.find((type) => type.qualifiedName === "demo::QualityLevel")!;
      workspace = await addEnumValue({ workspaceRoot: root, typeId: quality.id, valueName: "VeryHigh" });

      const updated = await readFile(resolve(root, "headers", "quality.hpp"), "utf8");
      expect(updated).toContain("High = 3,");
      expect(updated).toContain("VeryHigh = 4,");
      expect(workspace.diagnostics).toEqual([]);
      expect(workspace.types.find((type) => type.qualifiedName === "demo::QualityLevel")?.values.map((value) => [value.name, value.value])).toEqual([
        ["Low", 1],
        ["Medium", 2],
        ["High", 3],
        ["VeryHigh", 4]
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps bad headers editable and can recover after source save", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-bad-header-"));
    try {
      await mkdir(resolve(root, "headers"), { recursive: true });
      const headerPath = resolve(root, "headers", "broken.hpp");
      await writeFile(headerPath, `#pragma once
#include <cstdint>
namespace demo {
enum class Broken : std::uint8_t {
  Good = 1
  Better,
};
}
`, "utf8");

      const broken = await scanWorkspace(root);
      expect(broken.files.map((file) => file.relativePath)).toEqual(["headers/broken.hpp"]);
      expect(broken.types).toEqual([]);
      expect(broken.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);

      const repaired = await updateHeaderContent({
        workspaceRoot: root,
        headerPath,
        content: `#pragma once
#include <cstdint>
namespace demo {
enum class Broken : std::uint8_t {
  Good = 1,
  Better,
};
}
`
      });
      expect(repaired.diagnostics).toEqual([]);
      expect(repaired.types.find((type) => type.qualifiedName === "demo::Broken")?.values.map((value) => value.name)).toEqual(["Good", "Better"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("persists semantic notes for structs, fields, enums, and enum values across rescans", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-meta-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/meta.hpp" });
      let workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "meta.hpp"),
        structName: "AnnotatedPacket"
      });
      workspace = await createEnum({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "meta.hpp"),
        enumName: "AnnotatedKind"
      });
      const packet = workspace.types.find((type) => type.qualifiedName === "protovault::AnnotatedPacket")!;
      const field = packet.fields.find((item) => item.name === "id")!;
      const kind = workspace.types.find((type) => type.qualifiedName === "protovault::AnnotatedKind")!;
      const unknown = kind.values.find((item) => item.name === "Unknown")!;

      await updateNote({ workspaceRoot: root, targetId: packet.id, note: "协议包头结构" });
      await updateNote({ workspaceRoot: root, targetId: field.id, note: "业务侧稳定 ID" });
      await updateNote({ workspaceRoot: root, targetId: kind.id, note: "消息类型枚举" });
      workspace = await updateNote({ workspaceRoot: root, targetId: unknown.id, note: "缺省值" });

      const rescanned = await scanWorkspace(root);
      const rescannedPacket = rescanned.types.find((type) => type.qualifiedName === "protovault::AnnotatedPacket")!;
      const rescannedKind = rescanned.types.find((type) => type.qualifiedName === "protovault::AnnotatedKind")!;
      expect(rescannedPacket.note).toBe("协议包头结构");
      expect(rescannedPacket.fields.find((item) => item.name === "id")?.note).toBe("业务侧稳定 ID");
      expect(rescannedKind.note).toBe("消息类型枚举");
      expect(rescannedKind.values.find((item) => item.name === "Unknown")?.note).toBe("缺省值");

      const metadata = JSON.parse(await readFile(resolve(root, ".protocol", "meta", "metadata.json"), "utf8")) as { notes: Record<string, string> };
      expect(Object.values(metadata.notes)).toEqual(expect.arrayContaining(["协议包头结构", "业务侧稳定 ID", "消息类型枚举", "缺省值"]));

      const headerContent = await readFile(resolve(root, "headers", "meta.hpp"), "utf8");
      expect(headerContent).toContain("/// @brief 协议包头结构");
      expect(headerContent).toContain("std::uint32_t id; // 业务侧稳定 ID");
      expect(headerContent).toContain("/// @brief 消息类型枚举");
      expect(headerContent).toContain("/// @brief 缺省值");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("persists producer and consumer tags for protocol types", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-data-flow-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/flow.hpp" });
      let workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "flow.hpp"),
        structName: "RadarFrame"
      });
      const frame = workspace.types.find((type) => type.qualifiedName === "protovault::RadarFrame")!;
      workspace = await updateDataFlow({
        workspaceRoot: root,
        typeId: frame.id,
        producers: ["RadarDriver", "  RadarDriver  ", "ReplayTool"],
        consumers: ["Tracker", "Telemetry"]
      });
      const updated = workspace.types.find((type) => type.id === frame.id)!;
      expect(updated.dataFlow).toEqual({
        producers: ["RadarDriver", "ReplayTool"],
        consumers: ["Telemetry", "Tracker"]
      });

      const rescanned = await scanWorkspace(root);
      expect(rescanned.types.find((type) => type.id === frame.id)?.dataFlow).toEqual(updated.dataFlow);
      const metadata = JSON.parse(await readFile(resolve(root, ".protocol", "meta", "metadata.json"), "utf8")) as {
        dataFlows: Record<string, { producers: string[]; consumers: string[] }>;
      };
      expect(metadata.dataFlows[frame.id]).toEqual(updated.dataFlow);

      workspace = await updateDataFlow({ workspaceRoot: root, typeId: frame.id, producers: [], consumers: [] });
      expect(workspace.types.find((type) => type.id === frame.id)?.dataFlow).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates, updates, links, and deletes protocol network facts", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-network-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/network.hpp" });
      let workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "network.hpp"),
        structName: "RadarFrame"
      });
      const frame = workspace.types.find((type) => type.qualifiedName === "protovault::RadarFrame")!;

      workspace = await createNetworkNode({
        workspaceRoot: root,
        name: "RadarModel",
        kind: "model",
        subsystem: "Radar",
        host: "sim-host",
        process: "radar_model.exe"
      });
      workspace = await createNetworkNode({
        workspaceRoot: root,
        name: "Tracker",
        kind: "service",
        subsystem: "Tracking",
        host: "track-host"
      });
      expect(workspace.network.nodes.map((node) => node.name)).toEqual(["RadarModel", "Tracker"]);

      const radarModel = workspace.network.nodes.find((node) => node.name === "RadarModel")!;
      const tracker = workspace.network.nodes.find((node) => node.name === "Tracker")!;
      workspace = await updateNetworkNode({
        workspaceRoot: root,
        nodeId: tracker.id,
        name: "TrackService",
        kind: "service",
        role: "目标融合",
        subsystem: "Tracking",
        host: "track-host"
      });
      const trackService = workspace.network.nodes.find((node) => node.name === "TrackService")!;
      expect(trackService.role).toBe("目标融合");

      workspace = await createNetworkLink({
        workspaceRoot: root,
        name: "Radar UDP Stream",
        fromNodeId: radarModel.id,
        toNodeId: trackService.id,
        transport: "udp",
        endpoint: "239.10.0.1:5000",
        latencyBudgetMs: 20,
        bandwidthLimitMbps: 100,
        critical: true
      });
      const link = workspace.network.links.find((item) => item.name === "Radar UDP Stream")!;
      expect(link.fromNodeName).toBe("RadarModel");
      expect(link.toNodeName).toBe("TrackService");

      workspace = await updateNetworkLink({
        workspaceRoot: root,
        linkId: link.id,
        name: "Radar DDS Stream",
        fromNodeId: radarModel.id,
        toNodeId: trackService.id,
        transport: "dds",
        endpoint: "RadarFrameTopic",
        latencyBudgetMs: 15,
        bandwidthLimitMbps: 80,
        critical: true
      });
      const ddsLink = workspace.network.links.find((item) => item.name === "Radar DDS Stream")!;
      expect(ddsLink.transport).toBe("dds");

      workspace = await createProtocolBinding({
        workspaceRoot: root,
        name: "RadarFrame@50Hz",
        linkId: ddsLink.id,
        typeId: frame.id,
        dataName: "detections",
        frequencyHz: 50,
        batchSize: 2,
        peakMultiplier: 1.5,
        criticality: "high"
      });
      const binding = workspace.network.bindings.find((item) => item.name === "RadarFrame@50Hz")!;
      expect(binding.protocolName).toBe("protovault::RadarFrame");
      expect(binding.payloadSize).toBe(frame.layout?.size);
      expect(binding.estimatedBandwidthBps).toBe((frame.layout?.size ?? 0) * 50 * 2 * 1.5);
      expect(workspace.network.links.find((item) => item.id === ddsLink.id)?.bindingCount).toBe(1);
      expect(workspace.network.nodes.find((node) => node.id === radarModel.id)?.outgoingBandwidthBps).toBe(binding.estimatedBandwidthBps);
      expect(workspace.network.nodes.find((node) => node.id === trackService.id)?.incomingBandwidthBps).toBe(binding.estimatedBandwidthBps);

      workspace = await updateProtocolBinding({
        workspaceRoot: root,
        bindingId: binding.id,
        name: "RadarFrame@25Hz",
        linkId: ddsLink.id,
        typeId: frame.id,
        frequencyHz: 25,
        batchSize: 1,
        peakMultiplier: 1,
        criticality: "normal",
        notes: "降频测试"
      });
      const reduced = workspace.network.bindings.find((item) => item.name === "RadarFrame@25Hz")!;
      expect(reduced.estimatedBandwidthBps).toBe((frame.layout?.size ?? 0) * 25);
      expect(reduced.notes).toBe("降频测试");

      const stored = JSON.parse(await readFile(resolve(root, ".protocol", "network", "network.json"), "utf8")) as {
        nodes: unknown[];
        links: unknown[];
        bindings: Array<{ protocolName?: string; payloadSize?: number; estimatedBandwidthBps?: number }>;
      };
      expect(stored.nodes).toHaveLength(2);
      expect(stored.links).toHaveLength(1);
      expect(stored.bindings).toHaveLength(1);
      expect(stored.bindings[0].protocolName).toBeUndefined();
      expect(stored.bindings[0].payloadSize).toBeUndefined();

      workspace = await createNetworkFlowView({
        workspaceRoot: root,
        name: "Tracking Critical Path",
        description: "关注 Tracking 子系统和关键链路。",
        filter: "Tracking critical"
      });
      const flowView = workspace.network.views.find((view) => view.name === "Tracking Critical Path")!;
      expect(flowView.filter).toBe("Tracking critical");

      workspace = await updateNetworkFlowView({
        workspaceRoot: root,
        viewId: flowView.id,
        name: "Tracking High Rate",
        description: "关注高频跟踪数据。",
        filter: "RadarFrame high",
        source: "manual"
      });
      const updatedFlowView = workspace.network.views.find((view) => view.id === flowView.id)!;
      expect(updatedFlowView.name).toBe("Tracking High Rate");
      expect(updatedFlowView.source).toBe("manual");

      const storedWithView = JSON.parse(await readFile(resolve(root, ".protocol", "network", "network.json"), "utf8")) as {
        views: Array<{ name: string; filter?: string; estimatedBandwidthBps?: number }>;
      };
      expect(storedWithView.views).toEqual([expect.objectContaining({ name: "Tracking High Rate", filter: "RadarFrame high" })]);
      expect(storedWithView.views[0].estimatedBandwidthBps).toBeUndefined();

      const networkReport = await generateNetworkReport({ workspaceRoot: root, flowViewId: updatedFlowView.id });
      expect(networkReport.relativePath).toMatch(/^\.protocol\/reports\/network-flow-/);
      expect(networkReport.content).toContain("Tracking High Rate");
      expect(networkReport.content).toContain("RadarFrame@25Hz");
      expect(networkReport.content).toContain("Radar DDS Stream");
      expect(await readFile(networkReport.path, "utf8")).toBe(networkReport.content);

      workspace = await deleteNetworkFlowView({ workspaceRoot: root, viewId: flowView.id });
      expect(workspace.network.views).toHaveLength(0);

      workspace = await deleteProtocolBinding({ workspaceRoot: root, bindingId: reduced.id });
      expect(workspace.network.bindings).toHaveLength(0);
      workspace = await createProtocolBinding({
        workspaceRoot: root,
        name: "RadarFrame@10Hz",
        linkId: ddsLink.id,
        typeId: frame.id,
        frequencyHz: 10
      });
      expect(workspace.network.bindings).toHaveLength(1);
      workspace = await deleteNetworkLink({ workspaceRoot: root, linkId: ddsLink.id });
      expect(workspace.network.links).toHaveLength(0);
      expect(workspace.network.bindings).toHaveLength(0);

      workspace = await createNetworkLink({
        workspaceRoot: root,
        name: "Temp Link",
        fromNodeId: radarModel.id,
        toNodeId: trackService.id,
        transport: "tcp"
      });
      const tempLink = workspace.network.links.find((item) => item.name === "Temp Link")!;
      workspace = await createProtocolBinding({ workspaceRoot: root, name: "Temp Binding", linkId: tempLink.id, typeId: frame.id });
      expect(workspace.network.bindings).toHaveLength(1);
      workspace = await deleteNetworkNode({ workspaceRoot: root, nodeId: radarModel.id });
      expect(workspace.network.nodes.map((node) => node.name)).toEqual(["TrackService"]);
      expect(workspace.network.links).toHaveLength(0);
      expect(workspace.network.bindings).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects invalid generated fields before writing the header", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-add-field-guard-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/guard.hpp" });
      const workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "guard.hpp"),
        structName: "GuardedPacket"
      });
      const type = workspace.types.find((item) => item.qualifiedName === "protovault::GuardedPacket")!;
      const headerPath = resolve(root, "headers", "guard.hpp");
      const before = await readFile(headerPath, "utf8");
      await expect(addField({
        workspaceRoot: root,
        typeId: type.id,
        fieldType: "MissingType",
        fieldName: "broken"
      })).rejects.toThrow("已取消写入");
      await expect(readFile(headerPath, "utf8")).resolves.toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("imports controlled notes from header comments during scan", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-source-notes-"));
    try {
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "annotated.hpp"), `#pragma once
#include <cstdint>

namespace demo {

/** @brief 源码结构注释 */
struct Packet {
  std::uint32_t id = 7; // 源码字段注释
};

/*!
 * @brief 源码枚举注释
 */
enum class PacketState : std::uint8_t {
  /// @protovault-note: 源码枚举项注释
  Ready = 1,
};

}  // namespace demo
`, "utf8");

      const workspace = await scanWorkspace(root);
      const packet = workspace.types.find((type) => type.qualifiedName === "demo::Packet")!;
      const state = workspace.types.find((type) => type.qualifiedName === "demo::PacketState")!;

      expect(packet.note).toBe("源码结构注释");
      expect(packet.fields.find((field) => field.name === "id")?.note).toBe("源码字段注释");
      expect(packet.fields.find((field) => field.name === "id")?.initializer).toBe("7");
      expect(state.note).toBe("源码枚举注释");
      expect(state.values.find((value) => value.name === "Ready")?.note).toBe("源码枚举项注释");

      const metadata = JSON.parse(await readFile(resolve(root, ".protocol", "meta", "metadata.json"), "utf8")) as { notes: Record<string, string> };
      expect(Object.values(metadata.notes)).toEqual(expect.arrayContaining([
        "源码结构注释",
        "源码字段注释",
        "源码枚举注释",
        "源码枚举项注释"
      ]));

      const updated = await updateNote({ workspaceRoot: root, targetId: packet.id, note: "更新后的结构说明" });
      const updatedPacket = updated.types.find((type) => type.qualifiedName === "demo::Packet")!;
      expect(updatedPacket.note).toBe("更新后的结构说明");
      const headerContent = await readFile(resolve(root, "headers", "annotated.hpp"), "utf8");
      expect(headerContent).toContain("/// @brief 更新后的结构说明");
      expect(headerContent).not.toContain("/** @brief 源码结构注释 */");

      await writeFile(resolve(root, "headers", "annotated.hpp"), headerContent.replace("/// @brief 更新后的结构说明\n", ""), "utf8");
      const rescannedAfterDelete = await scanWorkspace(root);
      const packetAfterDelete = rescannedAfterDelete.types.find((type) => type.qualifiedName === "demo::Packet")!;
      expect(packetAfterDelete.note).toBeUndefined();
      const metadataAfterDelete = JSON.parse(await readFile(resolve(root, ".protocol", "meta", "metadata.json"), "utf8")) as { notes: Record<string, string> };
      expect(metadataAfterDelete.notes[packet.id]).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("protects source saves with content hash baselines", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-hash-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/hash.hpp" });
      const workspace = await scanWorkspace(root);
      const header = workspace.files.find((file) => file.relativePath === "headers/hash.hpp")!;
      await writeFile(header.path, `${header.content}\n// external edit\n`, "utf8");

      await expect(updateHeaderContent({
        workspaceRoot: root,
        headerPath: header.path,
        content: `${header.content}\n// app edit\n`,
        expectedHash: header.contentHash
      })).rejects.toThrow("外部修改");
      expect(await readFile(header.path, "utf8")).toContain("// external edit");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("updates internal header includes and rejects include cycles", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-includes-"));
    try {
      await createHeader({ workspaceRoot: root, relativePath: "headers/a.hpp" });
      await createHeader({ workspaceRoot: root, relativePath: "headers/b.hpp" });
      await createHeader({ workspaceRoot: root, relativePath: "headers/c.hpp" });

      let workspace = await updateHeaderIncludes({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "a.hpp"),
        includeRelativePaths: ["headers/b.hpp", "headers/c.hpp"]
      });
      const headerA = await readFile(resolve(root, "headers", "a.hpp"), "utf8");
      expect(headerA).toContain('#include "headers/b.hpp"');
      expect(headerA).toContain('#include "headers/c.hpp"');
      expect(workspace.files.find((file) => file.relativePath === "headers/a.hpp")?.includes).toEqual(expect.arrayContaining([
        "cstdint",
        "headers/b.hpp",
        "headers/c.hpp"
      ]));

      workspace = await updateHeaderIncludes({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "a.hpp"),
        includeRelativePaths: ["headers/b.hpp"]
      });
      expect(workspace.files.find((file) => file.relativePath === "headers/a.hpp")?.includes).toEqual(expect.arrayContaining(["headers/b.hpp"]));
      expect(workspace.files.find((file) => file.relativePath === "headers/a.hpp")?.includes).not.toContain("headers/c.hpp");

      await updateHeaderIncludes({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "a.hpp"),
        includeRelativePaths: []
      });
      await updateHeaderIncludes({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "b.hpp"),
        includeRelativePaths: ["headers/a.hpp"]
      });
      await expect(updateHeaderIncludes({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "a.hpp"),
        includeRelativePaths: ["headers/b.hpp"]
      })).rejects.toThrow("循环引用");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("generates lint issues and markdown protocol documentation", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-report-"));
    try {
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "bad.hpp"), `#pragma once
#include <cstdint>
namespace demo {
struct Packet {
  int legacyId;
  std::uint32_t* pointerField;
};
enum class PacketKind {
  Unknown = 0,
};
}
`, "utf8");

      const lint = await lintWorkspace(root);
      expect(lint.issueCount).toBeGreaterThan(0);
      expect(lint.issues.map((item) => item.ruleId)).toEqual(expect.arrayContaining([
        "type.unsupported-runtime",
        "metadata.field-note-missing"
      ]));

      const document = await generateProtocolDocument({ workspaceRoot: root });
      expect(document.relativePath).toBe(".protocol/reports/protocol-documentation.md");
      expect(document.content).toContain("# ");
      expect(document.content).toContain("demo::Packet");
      expect(await readFile(document.path, "utf8")).toBe(document.content);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates git baseline tags and reports semantic diffs", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-diff-"));
    try {
      await runGit(root, ["init"]);
      await runGit(root, ["config", "user.email", "protovault@example.test"]);
      await runGit(root, ["config", "user.name", "ProtoVault Test"]);
      await writeFile(resolve(root, ".gitignore"), ".protocol/\n", "utf8");
      await createHeader({ workspaceRoot: root, relativePath: "headers/protocol.hpp" });
      let workspace = await createStruct({
        workspaceRoot: root,
        headerPath: resolve(root, "headers", "protocol.hpp"),
        structName: "Packet"
      });
      workspace = await createNetworkNode({ workspaceRoot: root, name: "Producer", kind: "model" });
      workspace = await createNetworkNode({ workspaceRoot: root, name: "Consumer", kind: "service" });
      const producer = workspace.network.nodes.find((node) => node.name === "Producer")!;
      const consumer = workspace.network.nodes.find((node) => node.name === "Consumer")!;
      workspace = await createNetworkLink({
        workspaceRoot: root,
        name: "Packet Link",
        fromNodeId: producer.id,
        toNodeId: consumer.id,
        transport: "dds"
      });
      const link = workspace.network.links.find((item) => item.name === "Packet Link")!;
      const initialPacket = workspace.types.find((type) => type.qualifiedName === "protovault::Packet")!;
      await createProtocolBinding({
        workspaceRoot: root,
        name: "Packet@10Hz",
        linkId: link.id,
        typeId: initialPacket.id,
        frequencyHz: 10
      });
      await runGit(root, ["add", "."]);
      await runGit(root, ["commit", "-m", "baseline protocol"]);

      const cleanStatus = await getGitStatus(root);
      expect(cleanStatus.isRepository).toBe(true);
      expect(cleanStatus.isDirty).toBe(false);
      const baseline = await createProtocolBaselineTag({
        workspaceRoot: root,
        tagName: "protovault/baseline/test",
        message: "test baseline"
      });
      expect(baseline.tagName).toBe("protovault/baseline/test");
      expect(baseline.relativePath).toBe(".protocol/baselines/protovault-baseline-test.json");
      expect(baseline.protocolBindingCount).toBe(1);
      expect((await listGitTags(root)).map((tag) => tag.name)).toContain("protovault/baseline/test");

      let packet = workspace.types.find((type) => type.qualifiedName === "protovault::Packet")!;
      workspace = await addField({
        workspaceRoot: root,
        typeId: packet.id,
        fieldType: "std::uint16_t",
        fieldName: "flags"
      });
      packet = workspace.types.find((type) => type.qualifiedName === "protovault::Packet")!;
      await updateField({
        workspaceRoot: root,
        typeId: packet.id,
        fieldId: packet.fields.find((field) => field.name === "id")!.id,
        fieldType: "std::uint64_t",
        fieldName: "id"
      });
      const updatedBinding = (await scanWorkspace(root)).network.bindings.find((binding) => binding.name === "Packet@10Hz")!;
      await updateProtocolBinding({
        workspaceRoot: root,
        bindingId: updatedBinding.id,
        name: "Packet@20Hz",
        linkId: updatedBinding.linkId,
        typeId: updatedBinding.typeId,
        frequencyHz: 20
      });

      const diff = await diffProtocolBaseline({ workspaceRoot: root, baseRef: "protovault/baseline/test" });
      expect(diff.baseBaseline?.tagName).toBe("protovault/baseline/test");
      expect(diff.currentBaseline.tagName).toBe("working-tree");
      expect(diff.changeCount).toBeGreaterThan(0);
      expect(diff.breakingCount).toBeGreaterThan(0);
      expect(diff.changes.map((change) => change.kind)).toEqual(expect.arrayContaining([
        "field-added",
        "field-type-changed",
        "protocol-binding-bandwidth-changed"
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("supports source-control style git stage, unstage, commit, and branch operations", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-git-ui-"));
    try {
      await runGit(root, ["init"]);
      await runGit(root, ["config", "user.email", "protovault@example.test"]);
      await runGit(root, ["config", "user.name", "ProtoVault Test"]);
      await mkdir(resolve(root, "headers"), { recursive: true });
      await writeFile(resolve(root, "headers", "protocol.hpp"), "#pragma once\nstruct Packet { int value; };\n", "utf8");

      let status = await getGitStatus(root);
      expect(status.entries.map((entry) => entry.path)).toContain("headers/protocol.hpp");
      expect(status.entries[0]?.indexStatus).toBe("?");

      let result = await stageGitPath({ workspaceRoot: root, path: "headers/protocol.hpp" });
      status = result.status;
      expect(status.entries.find((entry) => entry.path === "headers/protocol.hpp")?.indexStatus).toBe("A");
      let fileDiff = await getGitFileDiff({ workspaceRoot: root, path: "headers/protocol.hpp", side: "index" });
      expect(fileDiff.oldContent).toBe("");
      expect(fileDiff.newContent).toContain("struct Packet");

      result = await unstageGitPath({ workspaceRoot: root, path: "headers/protocol.hpp" });
      status = result.status;
      expect(status.entries.find((entry) => entry.path === "headers/protocol.hpp")?.indexStatus).toBe("?");
      fileDiff = await getGitFileDiff({ workspaceRoot: root, path: "headers/protocol.hpp", side: "working-tree" });
      expect(fileDiff.oldContent).toBe("");
      expect(fileDiff.newContent).toContain("struct Packet");

      result = await stageGitWorkspace({ workspaceRoot: root });
      expect(result.status.entries.find((entry) => entry.path === "headers/protocol.hpp")?.indexStatus).toBe("A");

      result = await unstageGitWorkspace({ workspaceRoot: root });
      expect(result.status.entries.find((entry) => entry.path === "headers/protocol.hpp")?.indexStatus).toBe("?");

      result = await stageGitWorkspace({ workspaceRoot: root });
      await expect(commitGitWorkspace({ workspaceRoot: root, message: "" })).rejects.toThrow("提交信息不能为空");
      result = await commitGitWorkspace({ workspaceRoot: root, message: "add protocol header" });
      expect(result.status.isDirty).toBe(false);
      const graph = await listGitCommitGraph(root);
      expect(graph[0]?.subject).toBe("add protocol header");
      expect(graph[0]?.current).toBe(true);
      expect(graph[0]?.changeCount).toBeGreaterThan(0);
      expect(graph[0]?.changes[0]).toMatchObject({ path: "headers/protocol.hpp", status: "A" });
      fileDiff = await getGitFileDiff({ workspaceRoot: root, path: "headers/protocol.hpp", side: "commit", commit: graph[0]!.hash });
      expect(fileDiff.oldContent).toBe("");
      expect(fileDiff.newContent).toContain("struct Packet");
      expect(fileDiff.newLabel).toContain(graph[0]!.shortHash);
      const baseBranch = result.status.currentBranch ?? "master";

      await writeFile(resolve(root, "headers", "protocol.hpp"), "#pragma once\nstruct Packet { int changed; };\n", "utf8");
      status = await getGitStatus(root);
      const modifiedEntry = status.entries.find((entry) => entry.path === "headers/protocol.hpp");
      expect(`${modifiedEntry?.indexStatus ?? ""}${modifiedEntry?.workingTreeStatus ?? ""}`).toContain("M");
      fileDiff = await getGitFileDiff({ workspaceRoot: root, path: "headers/protocol.hpp", side: "working-tree" });
      expect(fileDiff.oldContent).toContain("int value");
      expect(fileDiff.newContent).toContain("int changed");
      await writeFile(resolve(root, "headers", "protocol.hpp"), "#pragma once\nstruct Packet { int value; };\n", "utf8");

      result = await createGitBranch({ workspaceRoot: root, branchName: "feature/git-panel", checkout: true });
      expect(result.status.currentBranch).toBe("feature/git-panel");
      result = await checkoutGitBranch({ workspaceRoot: root, branchName: baseBranch });
      expect(result.status.currentBranch).toBe(baseBranch);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("blocks source-control commits when staged files exist outside the workspace scope", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "protovault-git-scope-"));
    const workspaceRoot = resolve(root, "protocols");
    try {
      await runGit(root, ["init"]);
      await runGit(root, ["config", "user.email", "protovault@example.test"]);
      await runGit(root, ["config", "user.name", "ProtoVault Test"]);
      await mkdir(resolve(workspaceRoot, "headers"), { recursive: true });
      await writeFile(resolve(workspaceRoot, "headers", "protocol.hpp"), "#pragma once\nstruct ScopedPacket { int value; };\n", "utf8");
      await writeFile(resolve(root, "outside.txt"), "outside workspace\n", "utf8");

      await runGit(root, ["add", "--", "outside.txt"]);
      await stageGitWorkspace({ workspaceRoot });

      await expect(commitGitWorkspace({ workspaceRoot, message: "scoped commit" })).rejects.toThrow("当前工作区之外的暂存改动");

      await runGit(root, ["reset", "--", "outside.txt"]);
      const result = await commitGitWorkspace({ workspaceRoot, message: "scoped commit" });
      expect(result.status.isDirty).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
