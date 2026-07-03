import { describe, expect, it } from "vitest";
import {
  renderEnumDeclaration,
  renderEnumValueDeclaration,
  renderFieldDeclaration,
  renderNewHeader,
  renderStructDeclaration
} from "./header-generator";

describe("header generator", () => {
  it("renders deterministic controlled header fragments", () => {
    expect(renderNewHeader("headers/demo.hpp")).toBe(renderNewHeader("headers/demo.hpp"));
    expect(renderStructDeclaration("Packet", [
      { type: "std::uint32_t", name: "id" },
      { type: "std::uint8_t[8]", name: "payload" }
    ])).toBe([
      "struct Packet {",
      "  std::uint32_t id;",
      "  std::uint8_t payload[8];",
      "};"
    ].join("\n"));
    expect(renderEnumDeclaration("Kind")).toBe([
      "enum class Kind : std::uint8_t {",
      "  Unknown = 0,",
      "};"
    ].join("\n"));
    expect(renderFieldDeclaration("demo::Vec3", "position")).toBe("demo::Vec3 position;");
    expect(renderEnumValueDeclaration("Ready", 2)).toBe("Ready = 2,");
  });
});
