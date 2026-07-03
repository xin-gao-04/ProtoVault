import type { WorkspaceTypeView } from "../shared/workspace";

export function deterministicHeaderGuard(relativePath: string): string {
  return `PROTOVAULT_${relativePath.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export function renderNewHeader(relativePath: string): string {
  const guard = deterministicHeaderGuard(relativePath);
  return [
    `#ifndef ${guard}`,
    `#define ${guard}`,
    "",
    "#include <cstdint>",
    "",
    "namespace protovault {",
    "",
    "// 在这里添加协议结构体。",
    "",
    "} // namespace protovault",
    "",
    `#endif // ${guard}`,
    ""
  ].join("\n");
}

export function renderStructDeclaration(structName: string, fields: Array<{ type: string; name: string; initializer?: string }> = [{ type: "std::uint32_t", name: "id" }]): string {
  return [
    `struct ${structName} {`,
    ...fields.map((field) => `  ${renderFieldDeclaration(field.type, field.name, field.initializer)}`),
    "};"
  ].join("\n");
}

export function renderEnumDeclaration(enumName: string, values: Array<{ name: string; value?: number }> = [{ name: "Unknown", value: 0 }]): string {
  return [
    `enum class ${enumName} : std::uint8_t {`,
    ...values.map((value) => `  ${renderEnumValueDeclaration(value.name, value.value)}`),
    "};"
  ].join("\n");
}

export function renderFieldDeclaration(fieldType: string, fieldName: string, initializer?: string): string {
  const init = initializer?.trim() ? ` = ${initializer.trim()}` : "";
  const arrayMatch = fieldType.match(/^(.*?)(\[[0-9]+\])$/);
  if (arrayMatch) return `${arrayMatch[1].trim()} ${fieldName}${arrayMatch[2]}${init};`;
  return `${fieldType} ${fieldName}${init};`;
}

export function renderEnumValueDeclaration(valueName: string, value?: number): string {
  return `${valueName}${value === undefined ? "" : ` = ${value}`},`;
}

export function nextEnumValue(type: WorkspaceTypeView): number {
  const numericValues = type.values
    .map((value) => value.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return Math.max(...numericValues) + 1;
}
