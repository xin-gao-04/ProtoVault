import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateSnapshotInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteHeaderInput,
  DeleteFieldInput,
  DeleteStructInput,
  DiffProtocolInput,
  GenerateDocumentInput,
  GeneratedDocumentReport,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  SemanticChange,
  SemanticDiffReport,
  ProtocolSnapshotSummary,
  UpdateDataFlowInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateNoteInput,
  WorkspaceDirectoryView,
  WorkspaceDiagnostic,
  WorkspaceEnumValueView,
  WorkspaceFieldLayoutView,
  WorkspaceFileView,
  WorkspaceLintIssue,
  WorkspaceLintReport,
  WorkspaceMemoryLayoutView,
  WorkspaceScanProgress,
  WorkspaceTypeView,
  WorkspaceView
} from "../shared/workspace";

const execFileAsync = promisify(execFile);
const HEADER_EXTENSIONS = new Set([".h", ".hh", ".hpp", ".hxx"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".protocol",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results"
]);

const BASE_TYPE_SIZE: Record<string, { size: number; alignment: number }> = {
  "std::int8_t": { size: 1, alignment: 1 },
  "std::uint8_t": { size: 1, alignment: 1 },
  "std::int16_t": { size: 2, alignment: 2 },
  "std::uint16_t": { size: 2, alignment: 2 },
  "std::int32_t": { size: 4, alignment: 4 },
  "std::uint32_t": { size: 4, alignment: 4 },
  "std::int64_t": { size: 8, alignment: 8 },
  "std::uint64_t": { size: 8, alignment: 8 },
  int8_t: { size: 1, alignment: 1 },
  uint8_t: { size: 1, alignment: 1 },
  int16_t: { size: 2, alignment: 2 },
  uint16_t: { size: 2, alignment: 2 },
  int32_t: { size: 4, alignment: 4 },
  uint32_t: { size: 4, alignment: 4 },
  int64_t: { size: 8, alignment: 8 },
  uint64_t: { size: 8, alignment: 8 },
  float: { size: 4, alignment: 4 },
  double: { size: 8, alignment: 8 },
  bool: { size: 1, alignment: 1 },
  char: { size: 1, alignment: 1 },
  "std::byte": { size: 1, alignment: 1 }
};

type SizeInfo = { size: number; alignment: number; supported: true } | { supported: false; reason: string };

interface ScanWorkspaceOptions {
  onProgress?: (progress: WorkspaceScanProgress) => void;
}

interface AstNode {
  id?: string;
  kind?: string;
  name?: string;
  completeDefinition?: boolean;
  scopedEnumTag?: string;
  type?: { qualType?: string };
  value?: string | boolean;
  loc?: AstLocation;
  range?: { begin?: AstLocation };
  inner?: AstNode[];
}

interface AstLocation {
  file?: string;
  line?: number;
  col?: number;
  includedFrom?: { file?: string };
  spellingLoc?: AstLocation;
  expansionLoc?: AstLocation;
}

function pathFromLocation(location?: AstLocation): string | undefined {
  return location?.file
    ?? location?.spellingLoc?.file
    ?? location?.expansionLoc?.file;
}

function hasIncludedFrom(location?: AstLocation): boolean {
  return Boolean(location?.includedFrom ?? location?.spellingLoc?.includedFrom ?? location?.expansionLoc?.includedFrom);
}

interface WorkspaceDiscovery {
  directories: string[];
  headers: string[];
}

function shouldSkipDirectory(name: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(name) || name.startsWith("build");
}

async function discoverWorkspace(root: string): Promise<WorkspaceDiscovery> {
  const directories: string[] = [];
  const headers: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue;
        directories.push(fullPath);
        await walk(fullPath);
      } else if (HEADER_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        headers.push(fullPath);
      }
    }
  }
  await walk(root);
  return {
    directories: directories.sort((a, b) => a.localeCompare(b)),
    headers: headers.sort((a, b) => a.localeCompare(b))
  };
}

async function findClang(): Promise<string> {
  const configured = process.env.PROTOVAULT_CLANG_PATH;
  const candidates = [configured, "C:\\Program Files\\LLVM\\bin\\clang++.exe", "clang++.exe"].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { windowsHide: true });
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error("未找到 Clang。请安装 LLVM，或设置 PROTOVAULT_CLANG_PATH。 ");
}

function stableId(kind: string, qualifiedName: string): string {
  return `${kind}:${createHash("sha1").update(qualifiedName).digest("hex").slice(0, 16)}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function resolveSourcePath(file: string | undefined, workspaceRoot: string, fallback: string): string {
  if (!file) return fallback;
  return resolve(isAbsolute(file) ? file : join(workspaceRoot, file));
}

function isInsideWorkspace(file: string, workspaceRoot: string): boolean {
  const relativePath = relative(workspaceRoot, file);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function assertWorkspaceFile(workspaceRoot: string, filePath: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(filePath);
  if (!isInsideWorkspace(target, root)) throw new Error("目标路径必须位于当前工作区内。");
  return target;
}

function sanitizeHeaderRelativePath(relativePath: string): string {
  const normalized = relativePath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized) throw new Error("Header 相对路径不能为空。");
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error("Header 相对路径不能包含空目录或上级目录。");
  }
  const extension = extname(normalized).toLowerCase();
  if (!HEADER_EXTENSIONS.has(extension)) throw new Error("Header 文件必须使用 .h、.hh、.hpp 或 .hxx 后缀。");
  return normalized;
}

function sanitizeCppIdentifier(name: string, label: string): string {
  const trimmed = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) throw new Error(`${label} 必须是合法 C++ 标识符。`);
  return trimmed;
}

function sanitizeCppType(type: string): string {
  const trimmed = type.trim();
  if (!trimmed || /[;{}]/.test(trimmed)) throw new Error("字段类型不能为空，且不能包含 ;、{ 或 }。");
  return trimmed;
}

function fieldDeclaration(fieldType: string, fieldName: string): string {
  const arrayMatch = fieldType.match(/^(.*?)(\[[0-9]+\])$/);
  if (arrayMatch) return `${arrayMatch[1].trim()} ${fieldName}${arrayMatch[2]};`;
  return `${fieldType} ${fieldName};`;
}

function structPattern(structName: string): RegExp {
  return new RegExp(`(struct\\s+)${structName}(\\s*\\{[\\s\\S]*?\\n\\s*\\};)`);
}

function enumPattern(enumName: string): RegExp {
  return new RegExp(`(enum\\s+(?:class\\s+)?)${enumName}([^\\{]*\\{[\\s\\S]*?\\n\\s*\\};)`);
}

function enumBlockPattern(enumName: string): RegExp {
  return new RegExp(`(enum\\s+(?:class\\s+)?${enumName}[^\\{]*\\{)([\\s\\S]*?)(\\n\\s*\\};)`);
}

function enumValueDeclaration(valueName: string, value?: number): string {
  return `${valueName}${value === undefined ? "" : ` = ${value}`},`;
}

function nextEnumValue(type: WorkspaceTypeView): number {
  const numericValues = type.values
    .map((value) => value.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return Math.max(...numericValues) + 1;
}

function ensureEnumBodyTrailingComma(body: string): string {
  const lines = body.trimEnd().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";
    if (!line.trim() || isCommentOnlyLine(line)) continue;
    if (!line.trimEnd().endsWith(",")) {
      lines[index] = `${line.trimEnd()},`;
    }
    break;
  }
  return lines.join("\n");
}

const BRIEF_COMMENT_TAG = "@brief";
const LEGACY_NOTE_COMMENT_TAG = "@protovault-note:";
const CONTROLLED_LINE_COMMENT_PATTERN = new RegExp(`^\\s*///\\s*(?:${escapeRegExp(BRIEF_COMMENT_TAG)}\\b|${escapeRegExp(LEGACY_NOTE_COMMENT_TAG)})(?:\\s?(.*))?$`);

interface SourceCommentBlock {
  start: number;
  end: number;
  note: string;
}

function isCommentOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.endsWith("*/");
}

function stripCommentTag(text: string): string {
  return text
    .replace(new RegExp(`^\\s*${escapeRegExp(LEGACY_NOTE_COMMENT_TAG)}\\s*`), "")
    .replace(new RegExp(`^\\s*${escapeRegExp(BRIEF_COMMENT_TAG)}\\b\\s*`), "")
    .trimEnd();
}

function lineCommentText(line: string): string | undefined {
  const match = line.match(/^\s*\/\/\/?!?\s?(.*)$/);
  return match ? stripCommentTag(match[1] ?? "") : undefined;
}

function blockCommentText(lines: string[]): string {
  const raw = lines.join("\n")
    .replace(/^\s*\/\*!?\*?/, "")
    .replace(/\*\/\s*$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd());
  return stripCommentTag(raw.join("\n").trim());
}

function commentBlockBefore(lines: string[], lineIndex: number): SourceCommentBlock | undefined {
  if (lineIndex <= 0 || lineIndex > lines.length) return undefined;
  const previous = lines[lineIndex - 1] ?? "";
  const lineText = lineCommentText(previous);
  if (lineText !== undefined) {
    const collected: string[] = [];
    let start = lineIndex - 1;
    for (let index = lineIndex - 1; index >= 0; index -= 1) {
      const text = lineCommentText(lines[index] ?? "");
      if (text === undefined) break;
      collected.unshift(text);
      start = index;
    }
    return { start, end: lineIndex, note: collected.join("\n").trim() };
  }

  if (previous.trimEnd().endsWith("*/")) {
    let start = lineIndex - 1;
    for (let index = lineIndex - 1; index >= 0; index -= 1) {
      start = index;
      if ((lines[index] ?? "").includes("/*")) break;
    }
    if ((lines[start] ?? "").includes("/*")) {
      return { start, end: lineIndex, note: blockCommentText(lines.slice(start, lineIndex)) };
    }
  }
  return undefined;
}

async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, targetPath);
}

interface WorkspaceMetadata {
  schemaVersion: 1;
  notes: Record<string, string>;
  dataFlows: Record<string, { producers: string[]; consumers: string[] }>;
}

interface SourceNoteScan {
  notes: Record<string, string>;
  targetIds: Set<string>;
}

function metadataPath(root: string): string {
  return join(root, ".protocol", "meta", "metadata.json");
}

async function readMetadata(root: string): Promise<WorkspaceMetadata> {
  try {
    const parsed = JSON.parse(await fs.readFile(metadataPath(root), "utf8")) as Partial<WorkspaceMetadata>;
    return { schemaVersion: 1, notes: parsed.notes ?? {}, dataFlows: normalizeMetadataDataFlows(parsed.dataFlows) };
  } catch {
    return { schemaVersion: 1, notes: {}, dataFlows: {} };
  }
}

async function writeMetadata(root: string, metadata: WorkspaceMetadata): Promise<void> {
  await atomicWriteFile(metadataPath(root), `${JSON.stringify(metadata, null, 2)}\n`);
}

function mergeMetadataWithSourceNotes(metadata: WorkspaceMetadata, sourceScan: SourceNoteScan): WorkspaceMetadata {
  const notes = { ...metadata.notes };
  for (const targetId of sourceScan.targetIds) {
    if (sourceScan.notes[targetId]) notes[targetId] = sourceScan.notes[targetId];
    else delete notes[targetId];
  }
  return { schemaVersion: 1, notes, dataFlows: metadata.dataFlows };
}

function metadataEquals(left: WorkspaceMetadata, right: WorkspaceMetadata): boolean {
  return JSON.stringify(left.notes) === JSON.stringify(right.notes)
    && JSON.stringify(left.dataFlows) === JSON.stringify(right.dataFlows);
}

function applyMetadata(workspace: WorkspaceView, metadata: WorkspaceMetadata): WorkspaceView {
  return {
    ...workspace,
    types: workspace.types.map((type) => ({
      ...type,
      note: metadata.notes[type.id],
      dataFlow: metadata.dataFlows[type.id],
      fields: type.fields.map((field) => ({ ...field, note: metadata.notes[field.id] })),
      values: type.values.map((value) => ({ ...value, note: metadata.notes[value.id] }))
    }))
  };
}

function normalizeMetadataDataFlows(value: unknown): Record<string, { producers: string[]; consumers: string[] }> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, { producers: string[]; consumers: string[] }> = {};
  for (const [id, flow] of Object.entries(value as Record<string, unknown>)) {
    if (!flow || typeof flow !== "object") continue;
    const candidate = flow as { producers?: unknown; consumers?: unknown };
    const producers = normalizeFlowTags(candidate.producers);
    const consumers = normalizeFlowTags(candidate.consumers);
    if (producers.length > 0 || consumers.length > 0) result[id] = { producers, consumers };
  }
  return result;
}

function normalizeFlowTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function collectSourceNotes(types: WorkspaceTypeView[]): Promise<SourceNoteScan> {
  const notes: Record<string, string> = {};
  const targetIds = new Set<string>();
  const contentByFile = new Map<string, string[]>();

  async function linesFor(file: string): Promise<string[]> {
    const cached = contentByFile.get(file);
    if (cached) return cached;
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
    contentByFile.set(file, lines);
    return lines;
  }

  async function noteBefore(file: string, line?: number): Promise<string | undefined> {
    if (!line) return undefined;
    const lines = await linesFor(file);
    const lineIndex = line - 1;
    if (lineIndex <= 0 || lineIndex > lines.length) return undefined;
    const note = commentBlockBefore(lines, lineIndex)?.note.trim();
    return note || undefined;
  }

  for (const type of types) {
    targetIds.add(type.id);
    const typeNote = await noteBefore(type.file, type.location?.line);
    if (typeNote) notes[type.id] = typeNote;
    for (const field of type.fields) {
      targetIds.add(field.id);
      const fieldNote = await noteBefore(type.file, field.location?.line);
      if (fieldNote) notes[field.id] = fieldNote;
    }
    for (const value of type.values) {
      targetIds.add(value.id);
      const valueNote = await noteBefore(type.file, value.location?.line);
      if (valueNote) notes[value.id] = valueNote;
    }
  }

  return { notes, targetIds };
}

function emitProgress(options: ScanWorkspaceOptions | undefined, progress: WorkspaceScanProgress): void {
  options?.onProgress?.(progress);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

function clangParseConcurrency(): number {
  const configured = Number(process.env.PROTOVAULT_SCAN_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return Math.min(configured, 8);
  return Math.max(1, Math.min(4, cpus().length));
}

function applyMemoryLayouts(types: WorkspaceTypeView[]): WorkspaceTypeView[] {
  return types.map((type) => ({
    ...type,
    layout: estimateTypeLayout(types, type)
  }));
}

function estimateTypeLayout(types: WorkspaceTypeView[], type: WorkspaceTypeView): WorkspaceMemoryLayoutView {
  if (type.kind === "enum") {
    const enumSize = estimateEnumSize(type);
    if (!enumSize.supported) {
      return {
        dataSize: 0,
        paddingBytes: 0,
        partial: true,
        source: "estimated",
        fields: []
      };
    }
    return {
      size: enumSize.size,
      alignment: enumSize.alignment,
      dataSize: enumSize.size,
      paddingBytes: 0,
      partial: !enumSize.supported,
      source: "estimated",
      fields: []
    };
  }
  return estimateStructLayout(types, type, new Set([type.id]));
}

function estimateStructLayout(types: WorkspaceTypeView[], type: WorkspaceTypeView, visited: Set<string>): WorkspaceMemoryLayoutView {
  let offset = 0;
  let maxAlignment = 1;
  let dataSize = 0;
  let paddingBytes = 0;
  let partial = false;
  const fields: WorkspaceFieldLayoutView[] = [];

  for (const field of type.fields) {
    const info = estimateFieldTypeSize(types, field.type, visited);
    if (!info.supported) {
      partial = true;
      fields.push({
        fieldId: field.id,
        name: field.name,
        type: field.type,
        paddingBefore: 0,
        paddingAfter: 0,
        supported: false,
        reason: info.reason
      });
      continue;
    }

    const effectiveAlignment = applyPackAlignment(info.alignment, type.pack);
    const paddingBefore = alignUp(offset, effectiveAlignment) - offset;
    paddingBytes += paddingBefore;
    offset += paddingBefore;
    fields.push({
      fieldId: field.id,
      name: field.name,
      type: field.type,
      offset,
      size: info.size,
      alignment: effectiveAlignment,
      paddingBefore,
      paddingAfter: 0,
      supported: true
    });
    offset += info.size;
    dataSize += info.size;
    maxAlignment = Math.max(maxAlignment, effectiveAlignment);
  }

  const size = partial ? undefined : alignUp(offset, maxAlignment);
  if (!partial && size !== undefined) paddingBytes += size - offset;
  for (let index = 0; index < fields.length; index += 1) {
    const current = fields[index];
    if (!current.supported || current.offset === undefined || current.size === undefined) continue;
    const next = fields.slice(index + 1).find((field) => field.supported && field.offset !== undefined);
    const end = current.offset + current.size;
    current.paddingAfter = next?.offset === undefined ? (size ?? end) - end : next.offset - end;
  }

  return {
    size,
    alignment: partial ? undefined : maxAlignment,
    dataSize,
    paddingBytes,
    partial,
    pack: type.pack,
    source: "estimated",
    fields
  };
}

function estimateFieldTypeSize(types: WorkspaceTypeView[], rawType: string, visited: Set<string>): SizeInfo {
  const normalized = normalizeFieldTypeValue(rawType);
  if (!normalized) return { supported: false, reason: "字段类型格式暂不支持。" };
  const scalar = estimateScalarTypeSize(types, normalized.coreType, visited);
  if (!scalar.supported) return scalar;
  return { supported: true, size: scalar.size * normalized.arrayLength, alignment: scalar.alignment };
}

function estimateScalarTypeSize(types: WorkspaceTypeView[], typeName: string, visited: Set<string>): SizeInfo {
  const base = BASE_TYPE_SIZE[typeName];
  if (base) return { supported: true, ...base };

  const referencedType = resolveReferencedType(types, typeName);
  if (!referencedType) return { supported: false, reason: `未在当前工作区类型索引中找到 ${typeName}。` };
  if (referencedType.kind === "enum") return estimateEnumSize(referencedType);
  if (visited.has(referencedType.id)) return { supported: false, reason: "递归结构体引用暂不参与布局估算。" };

  const nested = estimateStructLayout(types, referencedType, new Set(visited).add(referencedType.id));
  if (nested.size === undefined || nested.alignment === undefined || nested.partial) {
    return { supported: false, reason: `${referencedType.name} 的布局未完全解析。` };
  }
  return { supported: true, size: nested.size, alignment: nested.alignment };
}

function estimateEnumSize(type: WorkspaceTypeView): SizeInfo {
  const underlying = type.underlyingType ?? "int32_t";
  const base = BASE_TYPE_SIZE[underlying];
  if (!base) return { supported: false, reason: `${type.name} 的枚举底层类型 ${underlying} 暂不支持。` };
  return { supported: true, ...base };
}

function resolveReferencedType(types: WorkspaceTypeView[], typeName: string): WorkspaceTypeView | undefined {
  return types.find((type) => type.qualifiedName === typeName)
    ?? types.find((type) => type.name === typeName);
}

function normalizeFieldTypeValue(value: string): { coreType: string; arrayLength: number } | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(?:\s*\[\s*([1-9][0-9]*)\s*\])?$/);
  if (!match) return null;
  const coreType = match[1].trim();
  if (!coreType) return null;
  return { coreType, arrayLength: match[2] ? Number(match[2]) : 1 };
}

function applyPackAlignment(alignment: number, pack: number | undefined): number {
  return pack ? Math.min(alignment, pack) : alignment;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function enumValue(node: AstNode): number | undefined {
  const raw = node.value ?? node.inner?.find((child) => child.value !== undefined)?.value;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw !== "string") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function collectTypes(root: AstNode, workspaceRoot: string, defaultFile: string): WorkspaceTypeView[] {
  const types: WorkspaceTypeView[] = [];
  const seen = new Set<string>();

  function visit(node: AstNode, namespaces: string[], inheritedFile?: string): void {
    const ownLocatedFile = pathFromLocation(node.loc) ?? pathFromLocation(node.range?.begin);
    const isIncludedDeclaration = !ownLocatedFile && (hasIncludedFrom(node.loc) || hasIncludedFrom(node.range?.begin));
    const inferredFile = ownLocatedFile ?? (isIncludedDeclaration ? undefined : defaultFile);
    const traversalFile = inferredFile ?? inheritedFile;
    const nodeFile = traversalFile ? resolveSourcePath(traversalFile, workspaceRoot, defaultFile) : undefined;
    const nextNamespaces = node.kind === "NamespaceDecl" && node.name ? [...namespaces, node.name] : namespaces;
    const isWorkspaceNode = nodeFile ? isInsideWorkspace(nodeFile, workspaceRoot) : false;

    if (isWorkspaceNode && node.name && ((node.kind === "CXXRecordDecl" && node.completeDefinition) || node.kind === "EnumDecl")) {
      if (!inferredFile) {
        for (const child of node.inner ?? []) visit(child, nextNamespaces, traversalFile);
        return;
      }
      const kind = node.kind === "EnumDecl" ? "enum" : "struct";
      const qualifiedName = [...nextNamespaces, node.name].join("::");
      const sourceFile = resolveSourcePath(inferredFile, workspaceRoot, defaultFile);
      const id = stableId(kind, qualifiedName);
      if (!seen.has(id)) {
        seen.add(id);
        types.push({
          id,
          kind,
          name: node.name,
          qualifiedName,
          file: sourceFile,
          location: node.loc?.line ? { file: sourceFile, line: node.loc.line, column: node.loc.col ?? 1 } : undefined,
          fields: (node.inner ?? []).filter((child) => child.kind === "FieldDecl" && child.name).map((child) => ({
            id: stableId("field", `${qualifiedName}::${child.name}`),
            name: child.name!,
            type: child.type?.qualType ?? "<unknown>",
            location: child.loc?.line ? { file: sourceFile, line: child.loc.line, column: child.loc.col ?? 1 } : undefined
          })),
          values: (node.inner ?? []).filter((child) => child.kind === "EnumConstantDecl" && child.name).map((child) => ({
            id: stableId("enum-value", `${qualifiedName}::${child.name}`),
            name: child.name!,
            value: enumValue(child),
            location: child.loc?.line ? { file: sourceFile, line: child.loc.line, column: child.loc.col ?? 1 } : undefined
          }))
        });
      }
    }
    for (const child of node.inner ?? []) visit(child, nextNamespaces, traversalFile);
  }

  visit(root, [], defaultFile);
  return types;
}

function applyHeaderLayoutHints(types: WorkspaceTypeView[], content: string): WorkspaceTypeView[] {
  return types.map((type) => {
    const line = type.location?.line;
    const pack = line ? detectPackAtLine(content, line) : undefined;
    const underlyingType = type.kind === "enum" && line ? detectEnumUnderlyingType(content, line, type.name) : undefined;
    return {
      ...type,
      pack,
      underlyingType: underlyingType ?? type.underlyingType
    };
  });
}

function detectPackAtLine(content: string, lineNumber: number): number | undefined {
  const lines = content.split(/\r?\n/).slice(0, Math.max(0, lineNumber - 1));
  const stack: Array<number | undefined> = [];
  let current: number | undefined;
  for (const line of lines) {
    const push = line.match(/^\s*#\s*pragma\s+pack\s*\(\s*push\s*(?:,\s*([0-9]+))?\s*\)/);
    if (push) {
      stack.push(current);
      if (push[1]) current = Number(push[1]);
      continue;
    }
    const set = line.match(/^\s*#\s*pragma\s+pack\s*\(\s*([0-9]+)\s*\)/);
    if (set) {
      current = Number(set[1]);
      continue;
    }
    if (/^\s*#\s*pragma\s+pack\s*\(\s*pop\s*\)/.test(line)) {
      current = stack.pop();
    }
  }
  return current;
}

function detectEnumUnderlyingType(content: string, lineNumber: number, enumName: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const escapedName = escapeRegExp(enumName);
  const window = lines.slice(Math.max(0, lineNumber - 1), Math.min(lines.length, lineNumber + 4)).join(" ");
  const match = window.match(new RegExp(`\\benum\\s+(?:class\\s+)?${escapedName}\\s*:\\s*([^\\s\\{]+)`));
  return match?.[1]?.trim();
}

async function scanHeader(clang: string, header: string, root: string, includeRoots: string[], content: string): Promise<WorkspaceTypeView[]> {
  const includeArgs = includeRoots.flatMap((includeRoot) => ["-I", includeRoot]);
  const { stdout } = await execFileAsync(clang, [
    "-x", "c++-header", "-std=c++20", ...includeArgs,
    "-Xclang", "-ast-dump=json", "-fsyntax-only", header
  ], { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return applyHeaderLayoutHints(collectTypes(JSON.parse(stdout) as AstNode, root, header), content);
}

async function validateHeaderContent(root: string, header: string, content: string): Promise<void> {
  const clang = await findClang();
  const discovery = await discoverWorkspace(root);
  const includeArgs = [root, ...discovery.directories].flatMap((includeRoot) => ["-I", includeRoot]);
  const tempPath = join(dirname(header), `.${basename(header)}.${process.pid}.${Date.now()}.validate${extname(header) || ".hpp"}`);
  await fs.writeFile(tempPath, content, "utf8");
  try {
    await execFileAsync(clang, [
      "-x", "c++-header", "-std=c++20", ...includeArgs,
      "-fsyntax-only", tempPath
    ], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`生成内容未通过 C++ 语法检查，已取消写入：${message}`);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function diagnosticFromError(file: string | undefined, error: unknown): WorkspaceDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const parsed = parseClangDiagnostic(message, file);
  return {
    severity: parsed?.severity ?? "error",
    file: parsed?.file ?? file,
    line: parsed?.line,
    column: parsed?.column,
    message
  };
}

function parseClangDiagnostic(message: string, fallbackFile?: string): WorkspaceDiagnostic | null {
  const normalizedFallback = fallbackFile?.replaceAll("\\", "/");
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/);
    if (!match) continue;
    const file = match[1].replaceAll("\\", "/");
    return {
      severity: match[4] === "warning" ? "warning" : "error",
      file: normalizedFallback && file.endsWith(basename(normalizedFallback)) ? fallbackFile : match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[5]
    };
  }
  return null;
}

async function readFileView(path: string, root: string): Promise<WorkspaceFileView> {
  const content = await fs.readFile(path, "utf8");
  const includes = [...content.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)].map((match) => match[1]);
  return { path, relativePath: relative(root, path).replaceAll("\\", "/"), includes, content, contentHash: contentHash(content) };
}

function readDirectoryView(path: string, root: string): WorkspaceDirectoryView {
  return { path, relativePath: relative(root, path).replaceAll("\\", "/") };
}

async function writeWorkspaceRecord(workspace: WorkspaceView): Promise<string> {
  const protocolRoot = join(workspace.rootPath, ".protocol");
  const recordPath = join(protocolRoot, "workspace.json");
  const tempPath = join(protocolRoot, `workspace.${process.pid}.${Date.now()}.tmp`);
  const record = {
    schemaVersion: 1,
    workspace: {
      name: workspace.name,
      rootPath: workspace.rootPath
    },
    scannedAt: new Date().toISOString(),
    counts: {
      directories: workspace.directories.length,
      headers: workspace.files.length,
      types: workspace.types.length,
      diagnostics: workspace.diagnostics.length
    },
    directories: workspace.directories.map((directory) => ({
      path: directory.relativePath
    })),
    headers: workspace.files.map((file) => ({
      path: file.relativePath,
      contentHash: file.contentHash,
      includes: file.includes
    })),
    types: workspace.types.map((type) => ({
      id: type.id,
      kind: type.kind,
      qualifiedName: type.qualifiedName,
      file: relative(workspace.rootPath, type.file).replaceAll("\\", "/")
    })),
    diagnostics: workspace.diagnostics
  };

  await fs.mkdir(protocolRoot, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, recordPath);
  return recordPath;
}

export async function scanWorkspace(rootPath: string, options?: ScanWorkspaceOptions): Promise<WorkspaceView> {
  const root = resolve(rootPath);
  emitProgress(options, { phase: "discover", message: "正在检查工作区目录…", current: 0, total: 1 });
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("请选择工作区文件夹，而不是单个文件。");

  const discovery = await discoverWorkspace(root);
  const headers = discovery.headers;
  const directories = discovery.directories.map((directory) => readDirectoryView(directory, root));
  emitProgress(options, { phase: "read", message: `发现 ${headers.length} 个 Header，正在读取文件…`, current: 0, total: Math.max(headers.length, 1) });
  const files: WorkspaceFileView[] = [];
  for (const [index, header] of headers.entries()) {
    files.push(await readFileView(header, root));
    emitProgress(options, {
      phase: "read",
      message: `读取 Header：${relative(root, header).replaceAll("\\", "/")}`,
      current: index + 1,
      total: Math.max(headers.length, 1),
      file: header
    });
  }
  const contentByHeader = new Map(files.map((file) => [file.path, file.content]));
  const diagnostics: WorkspaceView["diagnostics"] = [];
  let scanner = "Clang AST";
  let types: WorkspaceTypeView[] = [];

  if (headers.length === 0) {
    diagnostics.push({ severity: "warning", message: "未在该工作区中发现 C/C++ Header 文件。" });
  } else {
    try {
      const clang = await findClang();
      const includeRoots = [root, ...discovery.directories];
      scanner = `Clang AST · ${clang}`;
      emitProgress(options, { phase: "parse", message: "正在启动 Clang AST 扫描…", current: 0, total: headers.length });
      let parsedHeaders = 0;
      const batches = await mapWithConcurrency(headers, clangParseConcurrency(), async (header) => {
        try {
          return await scanHeader(clang, header, root, includeRoots, contentByHeader.get(header) ?? await fs.readFile(header, "utf8"));
        }
        catch (error) {
          diagnostics.push(diagnosticFromError(header, error));
          return [];
        } finally {
          parsedHeaders += 1;
          emitProgress(options, {
            phase: "parse",
            message: `解析 Header：${relative(root, header).replaceAll("\\", "/")}`,
            current: parsedHeaders,
            total: headers.length,
            file: header
          });
        }
      });
      const deduplicated = new Map(batches.flat().map((type) => [type.id, type]));
      types = applyMemoryLayouts([...deduplicated.values()].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName)));
    } catch (error) {
      diagnostics.push(diagnosticFromError(undefined, error));
    }
  }

  let workspace: WorkspaceView = { name: basename(root), rootPath: root, directories, files, types, diagnostics, scanner };
  emitProgress(options, { phase: "metadata", message: "正在合并 Header 注释与协议元数据…", current: 0, total: 1 });
  const diskMetadata = await readMetadata(root);
  const sourceNotes = await collectSourceNotes(types);
  const metadata = mergeMetadataWithSourceNotes(diskMetadata, sourceNotes);
  if (!metadataEquals(diskMetadata, metadata)) {
    await writeMetadata(root, metadata);
  }
  workspace = applyMetadata(workspace, metadata);
  try {
    workspace.metadataPath = await writeWorkspaceRecord(workspace);
  } catch (error) {
    diagnostics.push({ severity: "warning", message: `目录记录写入失败：${error instanceof Error ? error.message : String(error)}` });
  }

  emitProgress(options, { phase: "done", message: `扫描完成：${files.length} Headers · ${types.length} Types`, current: 1, total: 1 });
  return workspace;
}

export function sampleWorkspacePath(appPath: string): string {
  return resolve(appPath, "..", "..", "examples");
}

function reportRelativePath(root: string, target: string): string {
  return relative(root, target).replaceAll("\\", "/");
}

function issue(
  ruleId: string,
  severity: WorkspaceLintIssue["severity"],
  message: string,
  target?: { id?: string; file?: string; location?: { file: string; line: number; column: number } }
): WorkspaceLintIssue {
  const file = target?.location?.file ?? target?.file;
  return {
    id: stableId("lint", `${ruleId}:${target?.id ?? file ?? message}:${message}`),
    ruleId,
    severity,
    message,
    targetId: target?.id,
    file,
    line: target?.location?.line,
    column: target?.location?.column
  };
}

export async function lintWorkspace(rootPath: string): Promise<WorkspaceLintReport> {
  const workspace = await scanWorkspace(rootPath);
  return lintWorkspaceView(workspace);
}

function lintWorkspaceView(workspace: WorkspaceView): WorkspaceLintReport {
  const issues: WorkspaceLintIssue[] = [];
  const normalizedBaseTypes = new Set(Object.keys(BASE_TYPE_SIZE));

  for (const diagnostic of workspace.diagnostics) {
    issues.push(issue("scan.diagnostic", diagnostic.severity, diagnostic.message, { file: diagnostic.file }));
  }

  for (const type of workspace.types) {
    if (!type.note) {
      issues.push(issue("metadata.type-note-missing", "suggestion", `${type.qualifiedName} 缺少类型语义注释。`, { id: type.id, file: type.file, location: type.location }));
    }
    if (type.kind === "enum") {
      if (type.values.length === 0) {
        issues.push(issue("enum.empty", "warning", `${type.qualifiedName} 没有枚举项。`, { id: type.id, file: type.file, location: type.location }));
      }
      if (!type.underlyingType || !normalizedBaseTypes.has(type.underlyingType)) {
        issues.push(issue("enum.underlying-type", "warning", `${type.qualifiedName} 未声明 MVP 支持的定宽底层类型。`, { id: type.id, file: type.file, location: type.location }));
      }
      const seenValues = new Map<number, WorkspaceEnumValueView>();
      for (const value of type.values) {
        if (!value.note) {
          issues.push(issue("metadata.enum-value-note-missing", "suggestion", `${type.qualifiedName}::${value.name} 缺少枚举项注释。`, { id: value.id, file: type.file, location: value.location }));
        }
        if (value.value !== undefined) {
          const existing = seenValues.get(value.value);
          if (existing) {
            issues.push(issue("enum.duplicate-value", "warning", `${type.qualifiedName} 中 ${existing.name} 与 ${value.name} 使用相同枚举值 ${value.value}。`, { id: value.id, file: type.file, location: value.location }));
          }
          seenValues.set(value.value, value);
        }
      }
      continue;
    }

    const layout = type.layout;
    if (layout?.partial) {
      issues.push(issue("layout.partial", "warning", `${type.qualifiedName} 的内存布局未完全解析。`, { id: type.id, file: type.file, location: type.location }));
    }
    if (layout?.size && layout.paddingBytes > 0 && layout.paddingBytes / layout.size >= 0.2) {
      issues.push(issue("layout.padding-ratio", "suggestion", `${type.qualifiedName} padding 占比 ${Math.round(layout.paddingBytes / layout.size * 100)}%，建议检查字段顺序。`, { id: type.id, file: type.file, location: type.location }));
    }
    for (const field of type.fields) {
      const normalized = normalizeFieldTypeValue(field.type);
      if (!field.note) {
        issues.push(issue("metadata.field-note-missing", "suggestion", `${type.qualifiedName}::${field.name} 缺少字段注释。`, { id: field.id, file: type.file, location: field.location }));
      }
      if (/[*&]/.test(field.type) || /\b(std::vector|std::string|std::map|std::array|QString)\b/.test(field.type)) {
        issues.push(issue("type.unsupported-runtime", "error", `${type.qualifiedName}::${field.name} 使用了 MVP 不支持的运行期/指针/引用类型：${field.type}。`, { id: field.id, file: type.file, location: field.location }));
      } else if (normalized && !BASE_TYPE_SIZE[normalized.coreType] && !resolveReferencedType(workspace.types, normalized.coreType)) {
        issues.push(issue("type.unresolved", "warning", `${type.qualifiedName}::${field.name} 的类型未在工作区索引中解析：${field.type}。`, { id: field.id, file: type.file, location: field.location }));
      }
      const fieldLayout = layout?.fields.find((item) => item.fieldId === field.id);
      if (fieldLayout && !fieldLayout.supported) {
        issues.push(issue("layout.field-unsupported", "warning", `${type.qualifiedName}::${field.name} 无法参与布局分析：${fieldLayout.reason ?? field.type}。`, { id: field.id, file: type.file, location: field.location }));
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    issueCount: issues.length,
    errorCount: issues.filter((item) => item.severity === "error").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    suggestionCount: issues.filter((item) => item.severity === "suggestion").length,
    issues
  };
}

function markdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  return [
    `| ${header.map(escapeMarkdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`)
  ].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

export async function generateProtocolDocument(input: GenerateDocumentInput): Promise<GeneratedDocumentReport> {
  const workspace = await scanWorkspace(input.workspaceRoot);
  const lint = lintWorkspaceView(workspace);
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    `# ${workspace.name} 协议文档`,
    "",
    `生成时间：${generatedAt}`,
    "",
    "## 工作区摘要",
    "",
    markdownTable([
      ["指标", "值"],
      ["工作区", workspace.rootPath],
      ["Header", String(workspace.files.length)],
      ["协议类型", String(workspace.types.length)],
      ["扫描器", workspace.scanner],
      ["Lint 问题", `${lint.issueCount}（错误 ${lint.errorCount} / 警告 ${lint.warningCount} / 建议 ${lint.suggestionCount}）`]
    ]),
    "",
    "## Header 清单",
    "",
    markdownTable([
      ["Header", "Include 数"],
      ...workspace.files.map((file) => [file.relativePath, String(file.includes.length)])
    ]),
    ""
  ];

  for (const type of workspace.types) {
    lines.push(`## ${type.kind === "struct" ? "Struct" : "Enum"} ${type.qualifiedName}`, "");
    lines.push(`文件：\`${reportRelativePath(workspace.rootPath, type.file)}${type.location ? `:${type.location.line}` : ""}\``);
    if (type.note) lines.push("", `说明：${type.note}`);
    if (type.kind === "struct") {
      const layout = type.layout;
      lines.push("", "### 布局", "");
      lines.push(markdownTable([
        ["大小", "对齐", "数据字节", "Padding", "Pack", "状态"],
        [
          layout?.size === undefined ? "未完全解析" : `${layout.size} B`,
          layout?.alignment === undefined ? "—" : `${layout.alignment} B`,
          `${layout?.dataSize ?? 0} B`,
          `${layout?.paddingBytes ?? 0} B`,
          layout?.pack ? String(layout.pack) : "默认 ABI",
          layout?.partial ? "部分支持" : "已完成"
        ]
      ]));
      lines.push("", "### 字段", "");
      lines.push(markdownTable([
        ["字段", "类型", "Offset", "大小", "注释"],
        ...type.fields.map((field) => {
          const fieldLayout = layout?.fields.find((item) => item.fieldId === field.id);
          return [
            field.name,
            `\`${field.type}\``,
            fieldLayout?.offset === undefined ? "—" : `${fieldLayout.offset} B`,
            fieldLayout?.size === undefined ? "—" : `${fieldLayout.size} B`,
            field.note ?? ""
          ];
        })
      ]));
    } else {
      lines.push("", "### 枚举项", "");
      lines.push(markdownTable([
        ["枚举项", "值", "注释"],
        ...type.values.map((value) => [value.name, value.value === undefined ? "自动" : String(value.value), value.note ?? ""])
      ]));
    }
    lines.push("");
  }

  lines.push("## Lint 摘要", "");
  if (lint.issues.length === 0) {
    lines.push("未发现 Lint 问题。", "");
  } else {
    lines.push(markdownTable([
      ["等级", "规则", "位置", "说明"],
      ...lint.issues.map((item) => [
        item.severity,
        item.ruleId,
        item.file ? `${reportRelativePath(workspace.rootPath, item.file)}${item.line ? `:${item.line}` : ""}` : "—",
        item.message
      ])
    ]), "");
  }

  const content = `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  const target = join(workspace.rootPath, ".protocol", "reports", "protocol-documentation.md");
  await atomicWriteFile(target, content);
  return { generatedAt, path: target, relativePath: reportRelativePath(workspace.rootPath, target), content };
}

interface SnapshotFile {
  schemaVersion: 1;
  id: string;
  label?: string;
  createdAt: string;
  workspace: {
    name: string;
    rootPath: string;
    fileCount: number;
    typeCount: number;
  };
  files: Array<{ path: string; contentHash: string }>;
  types: Array<{
    id: string;
    kind: WorkspaceTypeView["kind"];
    name: string;
    qualifiedName: string;
    file: string;
    size?: number;
    fields: Array<{ id: string; name: string; type: string; offset?: number; size?: number }>;
    values: Array<{ id: string; name: string; value?: number }>;
  }>;
}

function snapshotId(label?: string): string {
  const safeLabel = label?.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return safeLabel ? `${stamp}-${safeLabel}` : stamp;
}

function snapshotSummary(root: string, snapshot: SnapshotFile, path: string): ProtocolSnapshotSummary {
  return {
    id: snapshot.id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    path,
    relativePath: reportRelativePath(root, path),
    typeCount: snapshot.workspace.typeCount,
    fileCount: snapshot.workspace.fileCount
  };
}

function snapshotFromWorkspace(workspace: WorkspaceView, id: string, label?: string): SnapshotFile {
  return {
    schemaVersion: 1,
    id,
    label,
    createdAt: new Date().toISOString(),
    workspace: {
      name: workspace.name,
      rootPath: workspace.rootPath,
      fileCount: workspace.files.length,
      typeCount: workspace.types.length
    },
    files: workspace.files.map((file) => ({ path: file.relativePath, contentHash: file.contentHash })),
    types: workspace.types.map((type) => ({
      id: type.id,
      kind: type.kind,
      name: type.name,
      qualifiedName: type.qualifiedName,
      file: reportRelativePath(workspace.rootPath, type.file),
      size: type.layout?.size,
      fields: type.fields.map((field) => {
        const layout = type.layout?.fields.find((item) => item.fieldId === field.id);
        return { id: field.id, name: field.name, type: field.type, offset: layout?.offset, size: layout?.size };
      }),
      values: type.values.map((value) => ({ id: value.id, name: value.name, value: value.value }))
    }))
  };
}

async function writeSnapshot(root: string, snapshot: SnapshotFile): Promise<string> {
  const target = join(root, ".protocol", "snapshots", `${snapshot.id}.json`);
  await atomicWriteFile(target, `${JSON.stringify(snapshot, null, 2)}\n`);
  return target;
}

async function readSnapshot(path: string): Promise<SnapshotFile> {
  return JSON.parse(await fs.readFile(path, "utf8")) as SnapshotFile;
}

async function latestSnapshotPath(root: string): Promise<string | undefined> {
  const directory = join(root, ".protocol", "snapshots");
  try {
    const entries = await fs.readdir(directory);
    const snapshots = entries.filter((entry) => entry.endsWith(".json")).sort();
    const latest = snapshots.at(-1);
    return latest ? join(directory, latest) : undefined;
  } catch {
    return undefined;
  }
}

export async function createProtocolSnapshot(input: CreateSnapshotInput): Promise<ProtocolSnapshotSummary> {
  const workspace = await scanWorkspace(input.workspaceRoot);
  const snapshot = snapshotFromWorkspace(workspace, snapshotId(input.label), input.label?.trim() || undefined);
  const path = await writeSnapshot(workspace.rootPath, snapshot);
  return snapshotSummary(workspace.rootPath, snapshot, path);
}

function semanticChange(kind: SemanticChange["kind"], severity: SemanticChange["severity"], message: string, targetId?: string, before?: string | number, after?: string | number): SemanticChange {
  return { id: stableId("change", `${kind}:${targetId ?? message}:${before ?? ""}:${after ?? ""}`), kind, severity, message, targetId, before, after };
}

function diffSnapshots(base: SnapshotFile, current: SnapshotFile): SemanticChange[] {
  const changes: SemanticChange[] = [];
  const baseTypes = new Map(base.types.map((type) => [type.id, type]));
  const currentTypes = new Map(current.types.map((type) => [type.id, type]));

  for (const [id, currentType] of currentTypes) {
    const baseType = baseTypes.get(id);
    if (!baseType) {
      changes.push(semanticChange("type-added", "compatible", `新增类型 ${currentType.qualifiedName}。`, id));
      continue;
    }
    if (baseType.size !== currentType.size) {
      changes.push(semanticChange("type-size-changed", "review", `${currentType.qualifiedName} 大小从 ${baseType.size ?? "未知"} 变为 ${currentType.size ?? "未知"}。`, id, baseType.size, currentType.size));
    }

    const baseFields = new Map(baseType.fields.map((field) => [field.id, field]));
    const currentFields = new Map(currentType.fields.map((field) => [field.id, field]));
    for (const [fieldId, field] of currentFields) {
      const before = baseFields.get(fieldId);
      if (!before) {
        changes.push(semanticChange("field-added", "compatible", `${currentType.qualifiedName} 新增字段 ${field.name}。`, fieldId));
        continue;
      }
      if (before.type !== field.type) {
        changes.push(semanticChange("field-type-changed", "breaking", `${currentType.qualifiedName}::${field.name} 类型从 ${before.type} 变为 ${field.type}。`, fieldId, before.type, field.type));
      }
      if (before.offset !== field.offset) {
        changes.push(semanticChange("field-offset-changed", "breaking", `${currentType.qualifiedName}::${field.name} offset 从 ${before.offset ?? "未知"} 变为 ${field.offset ?? "未知"}。`, fieldId, before.offset, field.offset));
      }
    }
    for (const [fieldId, field] of baseFields) {
      if (!currentFields.has(fieldId)) {
        changes.push(semanticChange("field-removed", "breaking", `${baseType.qualifiedName} 删除字段 ${field.name}。`, fieldId));
      }
    }

    const baseValues = new Map(baseType.values.map((value) => [value.id, value]));
    const currentValues = new Map(currentType.values.map((value) => [value.id, value]));
    for (const [valueId, value] of currentValues) {
      const before = baseValues.get(valueId);
      if (!before) {
        changes.push(semanticChange("enum-value-added", "compatible", `${currentType.qualifiedName} 新增枚举项 ${value.name}。`, valueId));
        continue;
      }
      if (before.value !== value.value) {
        changes.push(semanticChange("enum-value-number-changed", "breaking", `${currentType.qualifiedName}::${value.name} 值从 ${before.value ?? "自动"} 变为 ${value.value ?? "自动"}。`, valueId, before.value, value.value));
      }
    }
    for (const [valueId, value] of baseValues) {
      if (!currentValues.has(valueId)) {
        changes.push(semanticChange("enum-value-removed", "breaking", `${baseType.qualifiedName} 删除枚举项 ${value.name}。`, valueId));
      }
    }
  }

  for (const [id, baseType] of baseTypes) {
    if (!currentTypes.has(id)) {
      changes.push(semanticChange("type-removed", "breaking", `删除类型 ${baseType.qualifiedName}。`, id));
    }
  }
  return changes;
}

export async function diffProtocolSnapshot(input: DiffProtocolInput): Promise<SemanticDiffReport> {
  const root = resolve(input.workspaceRoot);
  const basePath = input.baseSnapshotPath ? assertWorkspaceFile(root, input.baseSnapshotPath) : await latestSnapshotPath(root);
  const workspace = await scanWorkspace(root);
  const current = snapshotFromWorkspace(workspace, snapshotId("current"), "current");
  const currentPath = await writeSnapshot(root, current);
  const base = basePath ? await readSnapshot(basePath) : undefined;
  const changes = base ? diffSnapshots(base, current) : [];
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    baseSnapshot: base && basePath ? snapshotSummary(root, base, basePath) : undefined,
    currentSnapshot: snapshotSummary(root, current, currentPath),
    changeCount: changes.length,
    breakingCount: changes.filter((item) => item.severity === "breaking").length,
    compatibleCount: changes.filter((item) => item.severity === "compatible").length,
    reviewCount: changes.filter((item) => item.severity === "review").length,
    changes
  };
}

export async function createHeader(input: CreateHeaderInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const relativePath = sanitizeHeaderRelativePath(input.relativePath);
  const target = assertWorkspaceFile(root, join(root, relativePath));
  try {
    await fs.stat(target);
    throw new Error(`Header 已存在：${relativePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const guard = `PROTOVAULT_${relativePath.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  await atomicWriteFile(target, `#ifndef ${guard}\n#define ${guard}\n\n#include <cstdint>\n\nnamespace protovault {\n\n// 在这里添加协议结构体。\n\n} // namespace protovault\n\n#endif // ${guard}\n`);
  return scanWorkspace(root);
}

export async function createStruct(input: CreateStructInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  const structName = sanitizeCppIdentifier(input.structName, "结构体名称");
  const content = await fs.readFile(header, "utf8");
  if (new RegExp(`\\bstruct\\s+${structName}\\b`).test(content)) throw new Error(`结构体已存在：${structName}`);
  const insertion = `\nstruct ${structName} {\n  std::uint32_t id;\n};\n`;
  const namespaceMarker = content.match(/\n}\s*\/\/\s*namespace\s+[A-Za-z0-9_:]+\s*(?=\n|$)/);
  const nextContent = namespaceMarker?.index !== undefined
    ? `${content.slice(0, namespaceMarker.index)}${insertion}${content.slice(namespaceMarker.index)}`
    : `${content.trimEnd()}\n${insertion}\n`;
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function createEnum(input: CreateEnumInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  const enumName = sanitizeCppIdentifier(input.enumName, "枚举名称");
  const content = await fs.readFile(header, "utf8");
  if (new RegExp(`\\benum\\s+(?:class\\s+)?${enumName}\\b`).test(content)) throw new Error(`枚举已存在：${enumName}`);
  const insertion = `\nenum class ${enumName} : std::uint8_t {\n  Unknown = 0,\n};\n`;
  const namespaceMarker = content.match(/\n}\s*\/\/\s*namespace\s+[A-Za-z0-9_:]+\s*(?=\n|$)/);
  const nextContent = namespaceMarker?.index !== undefined
    ? `${content.slice(0, namespaceMarker.index)}${insertion}${content.slice(namespaceMarker.index)}`
    : `${content.trimEnd()}\n${insertion}\n`;
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function renameHeader(input: RenameHeaderInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const current = assertWorkspaceFile(root, input.headerPath);
  const newRelativePath = sanitizeHeaderRelativePath(input.newRelativePath);
  const target = assertWorkspaceFile(root, join(root, newRelativePath));
  if (current === target) return scanWorkspace(root);
  try {
    await fs.stat(target);
    throw new Error(`Header 已存在：${newRelativePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.rename(current, target);
  return scanWorkspace(root);
}

export async function deleteHeader(input: DeleteHeaderInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  await fs.unlink(header);
  return scanWorkspace(root);
}

export async function updateHeaderContent(input: UpdateHeaderContentInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  if (!HEADER_EXTENSIONS.has(extname(header).toLowerCase())) throw new Error("只能编辑 Header 文件内容。");
  if (input.expectedHash) {
    const currentContent = await fs.readFile(header, "utf8");
    const currentHash = contentHash(currentContent);
    if (currentHash !== input.expectedHash) {
      throw new Error("Header 已被外部修改，已取消保存以避免静默覆盖。请重新扫描后合并改动。");
    }
  }
  await atomicWriteFile(header, input.content);
  return scanWorkspace(root);
}

export async function renameStruct(input: RenameStructInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要重命名的数据结构。");
  if (targetType.kind !== "struct") throw new Error("当前仅支持重命名 struct。");
  const structName = sanitizeCppIdentifier(input.structName, "结构体名称");
  if (structName !== targetType.name && workspace.types.some((type) => type.file === targetType.file && type.name === structName)) {
    throw new Error(`结构体已存在：${structName}`);
  }
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const pattern = structPattern(targetType.name);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 struct ${targetType.name} 的受控编辑区域。`);
  const nextContent = `${content.slice(0, match.index)}${match[1]}${structName}${match[2]}${content.slice(match.index + match[0].length)}`;
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function deleteStruct(input: DeleteStructInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要删除的数据结构。");
  if (targetType.kind !== "struct") throw new Error("当前仅支持删除 struct。");
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const pattern = new RegExp(`\\n?struct\\s+${targetType.name}\\s*\\{[\\s\\S]*?\\n\\s*\\};\\n?`);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 struct ${targetType.name} 的受控编辑区域。`);
  const nextContent = `${content.slice(0, match.index)}\n${content.slice(match.index + match[0].length)}`.replace(/\n{3,}/g, "\n\n");
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function renameEnum(input: RenameEnumInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要重命名的枚举。");
  if (targetType.kind !== "enum") throw new Error("当前操作只支持 enum。");
  const enumName = sanitizeCppIdentifier(input.enumName, "枚举名称");
  if (enumName !== targetType.name && workspace.types.some((type) => type.file === targetType.file && type.name === enumName)) {
    throw new Error(`类型已存在：${enumName}`);
  }
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const pattern = enumPattern(targetType.name);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 enum ${targetType.name} 的受控编辑区域。`);
  const nextContent = `${content.slice(0, match.index)}${match[1]}${enumName}${match[2]}${content.slice(match.index + match[0].length)}`;
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function deleteEnum(input: DeleteEnumInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要删除的枚举。");
  if (targetType.kind !== "enum") throw new Error("当前操作只支持 enum。");
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const pattern = new RegExp(`\\n?enum\\s+(?:class\\s+)?${targetType.name}[^\\{]*\\{[\\s\\S]*?\\n\\s*\\};\\n?`);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 enum ${targetType.name} 的受控编辑区域。`);
  const nextContent = `${content.slice(0, match.index)}\n${content.slice(match.index + match[0].length)}`.replace(/\n{3,}/g, "\n\n");
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function addField(input: AddFieldInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要编辑的数据结构。");
  if (targetType.kind !== "struct") throw new Error("只能向 struct 添加字段。");
  const header = assertWorkspaceFile(root, targetType.file);
  const fieldType = sanitizeCppType(input.fieldType);
  const fieldName = sanitizeCppIdentifier(input.fieldName, "字段名称");
  if (targetType.fields.some((field) => field.name === fieldName)) throw new Error(`字段已存在：${fieldName}`);

  const content = await fs.readFile(header, "utf8");
  const pattern = new RegExp(`(struct\\s+${targetType.name}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\};)`);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 struct ${targetType.name} 的受控编辑区域。`);
  const body = match[2].trimEnd();
  const nextBody = `${body}\n  ${fieldDeclaration(fieldType, fieldName)}`;
  const nextContent = `${content.slice(0, match.index)}${match[1]}${nextBody}${match[3]}${content.slice(match.index + match[0].length)}`;
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

async function findEditableField(root: string, typeId: string, fieldId: string): Promise<{
  workspace: WorkspaceView;
  targetType: WorkspaceTypeView;
  targetField: WorkspaceTypeView["fields"][number];
  header: string;
  lines: string[];
  lineIndex: number;
}> {
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === typeId);
  if (!targetType) throw new Error("未找到要编辑的数据结构。");
  if (targetType.kind !== "struct") throw new Error("只能编辑 struct 字段。");
  const targetField = targetType.fields.find((field) => field.id === fieldId);
  if (!targetField) throw new Error("未找到要编辑的字段。");
  if (!targetField.location?.line) throw new Error("该字段缺少源码位置，暂不能受控编辑。");
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const lines = content.split(/\r?\n/);
  const lineIndex = targetField.location.line - 1;
  const line = lines[lineIndex] ?? "";
  if (!new RegExp(`\\b${targetField.name}\\b`).test(line) || !line.includes(";")) {
    throw new Error(`无法在 Header 中定位字段声明行：${targetField.name}`);
  }
  return { workspace, targetType, targetField, header, lines, lineIndex };
}

export async function updateField(input: UpdateFieldInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const { workspace, targetType, targetField, header, lines, lineIndex } = await findEditableField(root, input.typeId, input.fieldId);
  const fieldType = sanitizeCppType(input.fieldType);
  const fieldName = sanitizeCppIdentifier(input.fieldName, "字段名称");
  if (fieldName !== targetField.name && targetType.fields.some((field) => field.name === fieldName)) {
    throw new Error(`字段已存在：${fieldName}`);
  }
  void workspace;
  const indent = lines[lineIndex]?.match(/^\s*/)?.[0] ?? "  ";
  lines[lineIndex] = `${indent}${fieldDeclaration(fieldType, fieldName)}`;
  const nextContent = lines.join("\n");
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function deleteField(input: DeleteFieldInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const { header, lines, lineIndex } = await findEditableField(root, input.typeId, input.fieldId);
  lines.splice(lineIndex, 1);
  await atomicWriteFile(header, lines.join("\n"));
  return scanWorkspace(root);
}

async function findEditableEnumValue(root: string, typeId: string, valueId: string): Promise<{
  targetType: WorkspaceTypeView;
  targetValue: WorkspaceEnumValueView;
  header: string;
  lines: string[];
  lineIndex: number;
}> {
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === typeId);
  if (!targetType) throw new Error("未找到要编辑的枚举。");
  if (targetType.kind !== "enum") throw new Error("只能编辑 enum 枚举项。");
  const targetValue = targetType.values.find((value) => value.id === valueId);
  if (!targetValue) throw new Error("未找到要编辑的枚举项。");
  if (!targetValue.location?.line) throw new Error("该枚举项缺少源码位置，暂不能受控编辑。");
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const lines = content.split(/\r?\n/);
  const lineIndex = targetValue.location.line - 1;
  const line = lines[lineIndex] ?? "";
  if (!new RegExp(`\\b${targetValue.name}\\b`).test(line)) {
    throw new Error(`无法在 Header 中定位枚举项声明行：${targetValue.name}`);
  }
  return { targetType, targetValue, header, lines, lineIndex };
}

export async function addEnumValue(input: AddEnumValueInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const targetType = workspace.types.find((type) => type.id === input.typeId);
  if (!targetType) throw new Error("未找到要编辑的枚举。");
  if (targetType.kind !== "enum") throw new Error("只能向 enum 添加枚举项。");
  const valueName = sanitizeCppIdentifier(input.valueName, "枚举项名称");
  if (targetType.values.some((value) => value.name === valueName)) throw new Error(`枚举项已存在：${valueName}`);
  const header = assertWorkspaceFile(root, targetType.file);
  const content = await fs.readFile(header, "utf8");
  const pattern = enumBlockPattern(targetType.name);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 enum ${targetType.name} 的受控编辑区域。`);
  const body = ensureEnumBodyTrailingComma(match[2]);
  const explicitValue = input.value ?? nextEnumValue(targetType);
  const nextBody = `${body}\n  ${enumValueDeclaration(valueName, explicitValue)}`;
  const nextContent = `${content.slice(0, match.index)}${match[1]}${nextBody}${match[3]}${content.slice(match.index + match[0].length)}`;
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function updateEnumValue(input: UpdateEnumValueInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const { targetType, targetValue, header, lines, lineIndex } = await findEditableEnumValue(root, input.typeId, input.valueId);
  const valueName = sanitizeCppIdentifier(input.valueName, "枚举项名称");
  if (valueName !== targetValue.name && targetType.values.some((value) => value.name === valueName)) {
    throw new Error(`枚举项已存在：${valueName}`);
  }
  const indent = lines[lineIndex]?.match(/^\s*/)?.[0] ?? "  ";
  lines[lineIndex] = `${indent}${enumValueDeclaration(valueName, input.value)}`;
  const nextContent = lines.join("\n");
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function deleteEnumValue(input: DeleteEnumValueInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const { header, lines, lineIndex } = await findEditableEnumValue(root, input.typeId, input.valueId);
  lines.splice(lineIndex, 1);
  const nextContent = lines.join("\n");
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}

export async function updateNote(input: UpdateNoteInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const target = findNoteTarget(workspace, input.targetId);
  if (!target) throw new Error("未找到要记录注释的协议对象。");
  const metadata = await readMetadata(root);
  const note = input.note.trim();
  if (note) metadata.notes[input.targetId] = note;
  else delete metadata.notes[input.targetId];
  await writeMetadata(root, metadata);
  await syncNoteToSource(root, target, note);
  return scanWorkspace(root);
}

export async function updateDataFlow(input: UpdateDataFlowInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const target = workspace.types.find((type) => type.id === input.typeId);
  if (!target) throw new Error("未找到要更新数据流标签的协议类型。");
  const metadata = await readMetadata(root);
  const producers = normalizeFlowTags(input.producers);
  const consumers = normalizeFlowTags(input.consumers);
  if (producers.length > 0 || consumers.length > 0) {
    metadata.dataFlows[input.typeId] = { producers, consumers };
  } else {
    delete metadata.dataFlows[input.typeId];
  }
  await writeMetadata(root, metadata);
  return scanWorkspace(root);
}

type NoteSourceTarget = {
  header: string;
  lineIndex: number;
  declarationKind?: WorkspaceTypeView["kind"];
  declarationName?: string;
};

function findNoteTarget(workspace: WorkspaceView, targetId: string): NoteSourceTarget | null {
  for (const type of workspace.types) {
    if (type.id === targetId) {
      return findTypeDeclarationLine(type);
    }
    const field = type.fields.find((item) => item.id === targetId);
    if (field?.location?.line) return { header: type.file, lineIndex: field.location.line - 1 };
    const enumValue = type.values.find((item) => item.id === targetId);
    if (enumValue?.location?.line) return { header: type.file, lineIndex: enumValue.location.line - 1 };
  }
  return null;
}

function findTypeDeclarationLine(type: WorkspaceTypeView): NoteSourceTarget | null {
  return { header: type.file, lineIndex: -1, declarationKind: type.kind, declarationName: type.name };
}

async function syncNoteToSource(root: string, target: NoteSourceTarget, note: string): Promise<void> {
  const header = assertWorkspaceFile(root, target.header);
  const content = await fs.readFile(header, "utf8");
  const lines = content.split(/\r?\n/);
  let lineIndex = target.lineIndex;
  if (lineIndex < 0 && target.declarationKind && target.declarationName) {
    lineIndex = findDeclarationLineIndex(lines, target.declarationKind, target.declarationName);
  }
  if (lineIndex < 0) throw new Error("该对象缺少源码位置，暂不能同步注释到 Header。");
  if (lineIndex >= lines.length) throw new Error("注释同步目标行超出 Header 范围。");

  const indent = lines[lineIndex]?.match(/^\s*/)?.[0] ?? "";
  const existingBlock = commentBlockBefore(lines, lineIndex);
  const commentStart = existingBlock?.start ?? lineIndex;
  const commentLines = note
    ? note.split(/\r?\n/).map((line) => `${indent}/// ${BRIEF_COMMENT_TAG} ${line.trimEnd()}`)
    : [];
  lines.splice(commentStart, (existingBlock?.end ?? lineIndex) - commentStart, ...commentLines);
  await atomicWriteFile(header, lines.join("\n"));
}

function findDeclarationLineIndex(lines: string[], kind: WorkspaceTypeView["kind"], name: string): number {
  const escapedName = escapeRegExp(name);
  const pattern = kind === "struct"
    ? new RegExp(`\\bstruct\\s+${escapedName}\\b`)
    : new RegExp(`\\benum\\s+(?:class\\s+)?${escapedName}\\b`);
  return lines.findIndex((line) => pattern.test(line));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
