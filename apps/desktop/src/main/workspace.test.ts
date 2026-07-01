import { resolve } from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  addEnumValue,
  addField,
  createEnum,
  createHeader,
  createStruct,
  deleteEnum,
  deleteEnumValue,
  deleteField,
  deleteHeader,
  deleteStruct,
  renameEnum,
  renameHeader,
  renameStruct,
  scanWorkspace,
  updateEnumValue,
  updateField,
  updateNote
} from "./workspace";

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

    expect(coordinateFrame?.values.map((value) => ({ name: value.name, value: value.value }))).toEqual([
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
        fieldName: "flags"
      });
      const updatedPacket = afterField.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(updatedPacket?.fields.map((field) => [field.type, field.name])).toEqual([
        ["std::uint32_t", "id"],
        ["std::uint16_t", "flags"]
      ]);

      const afterUpdate = await updateField({
        workspaceRoot: root,
        typeId: updatedPacket!.id,
        fieldId: updatedPacket!.fields.find((field) => field.name === "flags")!.id,
        fieldType: "std::uint8_t",
        fieldName: "status"
      });
      const packetAfterUpdate = afterUpdate.types.find((type) => type.qualifiedName === "protovault::PacketHeader");
      expect(packetAfterUpdate?.fields.map((field) => [field.type, field.name])).toEqual([
        ["std::uint32_t", "id"],
        ["std::uint8_t", "status"]
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
