import { resolve } from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { addField, createHeader, createStruct, scanWorkspace } from "./workspace";

const examplesWorkspace = resolve(import.meta.dirname, "../../../../examples");

describe("scanWorkspace", () => {
  it("loads headers when opening the examples parent folder", async () => {
    const workspace = await scanWorkspace(examplesWorkspace);

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
      "radar-workspace/headers/radar/detection.hpp",
      "radar-workspace/headers/radar/track.hpp"
    ]);
    expect(workspace.files.find((file) => file.relativePath.endsWith("track.hpp"))?.content).toContain("struct RadarTrack");
    expect(workspace.types.map((type) => type.qualifiedName)).toEqual(expect.arrayContaining([
      "demo::common::CoordinateFrame",
      "demo::common::Pose3D",
      "demo::common::QualityLevel",
      "demo::common::Timestamp",
      "demo::common::Vec3",
      "demo::radar::DetectionFrame",
      "demo::radar::RadarDetection",
      "demo::radar::RadarTrack"
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

    expect(coordinateFrame?.values).toEqual([
      { name: "Unknown", value: 0 },
      { name: "ENU", value: 1 },
      { name: "ECEF", value: 2 },
      { name: "SensorBody", value: 3 }
    ]);
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

  it("creates headers, structs, fields, and refreshes the workspace record", async () => {
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
        fieldName: "flags"
      });
      const updatedPacket = afterField.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(updatedPacket?.fields.map((field) => [field.type, field.name])).toEqual([
        ["std::uint32_t", "id"],
        ["std::uint16_t", "flags"]
      ]);

      const content = await readFile(resolve(root, "headers", "generated.hpp"), "utf8");
      expect(content).toContain("std::uint16_t flags;");

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
});
