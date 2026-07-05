import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { workspaceViewSchema } from "@protovault/contracts";
import {
  nextEnumValue,
  renderEnumDeclaration,
  renderEnumValueDeclaration,
  renderFieldDeclaration,
  renderNewHeader,
  renderStructDeclaration
} from "./header-generator";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateBaselineTagInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateNetworkFlowViewInput,
  CreateNetworkLinkInput,
  CreateNetworkNodeInput,
  CreateProtocolBindingInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteHeaderInput,
  DeleteFieldInput,
  DeleteNetworkFlowViewInput,
  DeleteNetworkLinkInput,
  DeleteNetworkNodeInput,
  DeleteProtocolBindingInput,
  DeleteStructInput,
  GenerateDocumentInput,
  GenerateNetworkReportInput,
  GeneratedDocumentReport,
  GitBranchInfo,
  GitCheckoutBranchInput,
  GitCommitInput,
  GitCreateBranchInput,
  GitCommitGraphEntry,
  GitDiffInput,
  GitFileDiff,
  GitOperationResult,
  GitPathInput,
  GitSemanticDiffInput,
  GitTagInfo,
  GitWorkspaceInput,
  GitWorkspaceStatus,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  SemanticChange,
  SemanticDiffReport,
  NetworkNodeKind,
  NetworkTransportKind,
  ProtocolBaselineSummary,
  ProtocolBindingCriticality,
  UpdateNetworkLinkInput,
  UpdateNetworkFlowViewInput,
  UpdateNetworkNodeInput,
  UpdateProtocolBindingInput,
  UpdateDataFlowInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateHeaderIncludesInput,
  UpdateNoteInput,
  WorkspaceDirectoryView,
  WorkspaceDiagnostic,
  WorkspaceEnumValueView,
  WorkspaceFieldLayoutView,
  WorkspaceFileView,
  WorkspaceLintIssue,
  WorkspaceLintReport,
  WorkspaceMemoryLayoutView,
  WorkspaceNetworkMapView,
  WorkspaceNetworkNodeView,
  WorkspaceNetworkLinkView,
  WorkspaceProtocolBindingView,
  WorkspaceFlowView,
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

const NETWORK_NODE_KINDS = new Set<NetworkNodeKind>([
  "simulator",
  "model",
  "service",
  "gateway",
  "storage",
  "visualization",
  "hardware",
  "external",
  "other"
]);

const NETWORK_TRANSPORT_KINDS = new Set<NetworkTransportKind>(["udp", "tcp", "dds", "shared-memory", "file", "mq", "custom", "manual"]);
const PROTOCOL_BINDING_CRITICALITIES = new Set<ProtocolBindingCriticality>(["low", "normal", "high", "critical"]);
const NETWORK_FLOW_VIEW_SOURCES = new Set<WorkspaceFlowView["source"]>(["manual", "derived", "ai"]);

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

function sanitizeFieldInitializer(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/[;]|\/\//.test(trimmed) || /\/\*/.test(trimmed)) throw new Error("字段初始化值不能包含注释或分号。");
  if (/[{}]/.test(trimmed) && trimmed !== "{}") throw new Error("当前只支持空聚合初始化 {}，或基础字面量初始化。");
  return trimmed;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function includeReferenceForHeader(root: string, headerPath: string): string {
  return relative(root, headerPath).replaceAll("\\", "/");
}

function resolveInternalInclude(root: string, sourceHeader: string, includeValue: string, headerByRelativePath: Map<string, string>): string | null {
  const normalized = normalizeRelativePath(includeValue);
  const direct = headerByRelativePath.get(normalized);
  if (direct) return direct;
  const sibling = normalizeRelativePath(relative(root, resolve(dirname(sourceHeader), includeValue)));
  return headerByRelativePath.get(sibling) ?? null;
}

function wouldCreateIncludeCycle(graph: Map<string, Set<string>>, from: string, to: string): boolean {
  if (from === to) return true;
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) ?? []) stack.push(next);
  }
  return false;
}

function rewriteInternalIncludes(content: string, includeReferences: string[], headerByInclude: Map<string, string>): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let inserted = false;
  let lastIncludeIndex = -1;
  const requested = includeReferences.map((includePath) => `#include "${includePath}"`);

  for (const line of lines) {
    const match = line.match(/^\s*#\s*include\s*"([^"]+)"\s*$/);
    if (match && headerByInclude.has(normalizeRelativePath(match[1]))) {
      if (!inserted) {
        output.push(...requested);
        inserted = true;
      }
      lastIncludeIndex = output.length - 1;
      continue;
    }
    output.push(line);
    if (/^\s*#\s*include\b/.test(line)) lastIncludeIndex = output.length - 1;
  }

  if (!inserted && requested.length > 0) {
    const insertAt = lastIncludeIndex >= 0 ? lastIncludeIndex + 1 : 0;
    output.splice(insertAt, 0, ...requested);
  }
  return output.join("\n");
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

function splitInlineLineComment(line: string): { code: string; note?: string } {
  const index = line.indexOf("//");
  if (index < 0) return { code: line };
  const note = line.slice(index + 2).trim();
  return { code: line.slice(0, index).trimEnd(), note: note || undefined };
}

function inlineFieldComment(lines: string[], line?: number): string | undefined {
  if (!line) return undefined;
  const text = lines[line - 1];
  if (text === undefined) return undefined;
  return splitInlineLineComment(text).note;
}

function fieldInitializerFromLine(lines: string[], line?: number): string | undefined {
  if (!line) return undefined;
  const raw = lines[line - 1];
  if (raw === undefined) return undefined;
  const code = splitInlineLineComment(raw).code;
  const match = code.match(/=\s*(.*?)\s*;?\s*$/);
  return match?.[1]?.trim() || undefined;
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

function networkPath(root: string): string {
  return join(root, ".protocol", "network", "network.json");
}

function emptyNetworkMap(updatedAt?: string): WorkspaceNetworkMapView {
  return {
    schemaVersion: 1,
    nodes: [],
    links: [],
    bindings: [],
    views: [],
    updatedAt
  };
}

function cleanOptionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function cleanRequiredText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${label} 不能为空。`);
  return text;
}

function normalizePositiveNumber(value: unknown, fallback: number, label: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) throw new Error(`${label} 必须大于 0。`);
  return numberValue;
}

function normalizeNonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error(`${label} 不能小于 0。`);
  return numberValue;
}

function normalizePositiveInteger(value: unknown, fallback: number, label: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) throw new Error(`${label} 必须是大于 0 的整数。`);
  return numberValue;
}

function parseNetworkNodeKind(value: unknown): NetworkNodeKind {
  return typeof value === "string" && NETWORK_NODE_KINDS.has(value as NetworkNodeKind)
    ? value as NetworkNodeKind
    : "other";
}

function parseNetworkTransport(value: unknown): NetworkTransportKind {
  return typeof value === "string" && NETWORK_TRANSPORT_KINDS.has(value as NetworkTransportKind)
    ? value as NetworkTransportKind
    : "manual";
}

function parseProtocolBindingCriticality(value: unknown): ProtocolBindingCriticality {
  return typeof value === "string" && PROTOCOL_BINDING_CRITICALITIES.has(value as ProtocolBindingCriticality)
    ? value as ProtocolBindingCriticality
    : "normal";
}

function createNetworkId(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}

function normalizeNetworkMap(value: unknown): WorkspaceNetworkMapView {
  if (!value || typeof value !== "object") return emptyNetworkMap();
  const parsed = value as Partial<WorkspaceNetworkMapView>;
  const nodes = Array.isArray(parsed.nodes)
    ? parsed.nodes.flatMap((node): WorkspaceNetworkNodeView[] => {
        if (!node || typeof node !== "object") return [];
        const candidate = node as Partial<WorkspaceNetworkNodeView>;
        const id = cleanOptionalText(candidate.id);
        const name = cleanOptionalText(candidate.name);
        if (!id || !name) return [];
        return [{
          id,
          name,
          kind: parseNetworkNodeKind(candidate.kind),
          role: cleanOptionalText(candidate.role),
          subsystem: cleanOptionalText(candidate.subsystem),
          host: cleanOptionalText(candidate.host),
          process: cleanOptionalText(candidate.process),
          hardwareProfile: cleanOptionalText(candidate.hardwareProfile),
          softwareProfile: cleanOptionalText(candidate.softwareProfile),
          notes: cleanOptionalText(candidate.notes),
          outgoingLinkCount: 0,
          incomingLinkCount: 0,
          outgoingBandwidthBps: 0,
          incomingBandwidthBps: 0
        }];
      })
    : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = Array.isArray(parsed.links)
    ? parsed.links.flatMap((link): WorkspaceNetworkLinkView[] => {
        if (!link || typeof link !== "object") return [];
        const candidate = link as Partial<WorkspaceNetworkLinkView>;
        const id = cleanOptionalText(candidate.id);
        const name = cleanOptionalText(candidate.name);
        const fromNodeId = cleanOptionalText(candidate.fromNodeId);
        const toNodeId = cleanOptionalText(candidate.toNodeId);
        if (!id || !name || !fromNodeId || !toNodeId || !nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return [];
        return [{
          id,
          name,
          fromNodeId,
          toNodeId,
          transport: parseNetworkTransport(candidate.transport),
          endpoint: cleanOptionalText(candidate.endpoint),
          latencyBudgetMs: normalizeNonNegativeNumber(candidate.latencyBudgetMs, "延迟预算"),
          bandwidthLimitMbps: normalizeNonNegativeNumber(candidate.bandwidthLimitMbps, "带宽上限"),
          critical: Boolean(candidate.critical),
          notes: cleanOptionalText(candidate.notes),
          bindingCount: 0,
          estimatedBandwidthBps: 0
        }];
      })
    : [];
  const linkIds = new Set(links.map((link) => link.id));
  const bindings = Array.isArray(parsed.bindings)
    ? parsed.bindings.flatMap((binding): WorkspaceProtocolBindingView[] => {
        if (!binding || typeof binding !== "object") return [];
        const candidate = binding as Partial<WorkspaceProtocolBindingView>;
        const id = cleanOptionalText(candidate.id);
        const name = cleanOptionalText(candidate.name);
        const linkId = cleanOptionalText(candidate.linkId);
        const typeId = cleanOptionalText(candidate.typeId);
        if (!id || !name || !linkId || !typeId || !linkIds.has(linkId)) return [];
        return [{
          id,
          name,
          linkId,
          typeId,
          dataName: cleanOptionalText(candidate.dataName),
          frequencyHz: normalizeNonNegativeNumber(candidate.frequencyHz, "发送频率") ?? 0,
          batchSize: normalizePositiveInteger(candidate.batchSize ?? 1, 1, "批量大小"),
          peakMultiplier: normalizePositiveNumber(candidate.peakMultiplier ?? 1, 1, "峰值倍数"),
          criticality: parseProtocolBindingCriticality(candidate.criticality),
          notes: cleanOptionalText(candidate.notes),
          estimatedBandwidthBps: 0
        }];
      })
    : [];
  const views = Array.isArray(parsed.views)
    ? parsed.views.flatMap((view): WorkspaceNetworkMapView["views"] => {
        if (!view || typeof view !== "object") return [];
        const candidate = view as Partial<WorkspaceNetworkMapView["views"][number]>;
        const id = cleanOptionalText(candidate.id);
        const name = cleanOptionalText(candidate.name);
        if (!id || !name) return [];
        const source = candidate.source === "derived" || candidate.source === "ai" ? candidate.source : "manual";
        return [{ id, name, source, description: cleanOptionalText(candidate.description), filter: cleanOptionalText(candidate.filter) }];
      })
    : [];
  return {
    schemaVersion: 1,
    nodes,
    links,
    bindings,
    views,
    updatedAt: cleanOptionalText(parsed.updatedAt)
  };
}

async function readNetworkMap(root: string): Promise<WorkspaceNetworkMapView> {
  try {
    return normalizeNetworkMap(JSON.parse(await fs.readFile(networkPath(root), "utf8")) as unknown);
  } catch {
    return emptyNetworkMap();
  }
}

function networkMapForStorage(network: WorkspaceNetworkMapView) {
  return {
    schemaVersion: 1,
    nodes: network.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      role: node.role,
      subsystem: node.subsystem,
      host: node.host,
      process: node.process,
      hardwareProfile: node.hardwareProfile,
      softwareProfile: node.softwareProfile,
      notes: node.notes
    })),
    links: network.links.map((link) => ({
      id: link.id,
      name: link.name,
      fromNodeId: link.fromNodeId,
      toNodeId: link.toNodeId,
      transport: link.transport,
      endpoint: link.endpoint,
      latencyBudgetMs: link.latencyBudgetMs,
      bandwidthLimitMbps: link.bandwidthLimitMbps,
      critical: link.critical,
      notes: link.notes
    })),
    bindings: network.bindings.map((binding) => ({
      id: binding.id,
      name: binding.name,
      linkId: binding.linkId,
      typeId: binding.typeId,
      dataName: binding.dataName,
      frequencyHz: binding.frequencyHz,
      batchSize: binding.batchSize,
      peakMultiplier: binding.peakMultiplier,
      criticality: binding.criticality,
      notes: binding.notes
    })),
    views: network.views,
    updatedAt: new Date().toISOString()
  };
}

async function writeNetworkMap(root: string, network: WorkspaceNetworkMapView): Promise<void> {
  await atomicWriteFile(networkPath(root), `${JSON.stringify(networkMapForStorage(network), null, 2)}\n`);
}

function protocolPayloadSize(type: WorkspaceTypeView | undefined): number | undefined {
  if (!type) return undefined;
  if (type.layout?.size !== undefined) return type.layout.size;
  if (type.layout?.dataSize !== undefined) return type.layout.dataSize;
  return undefined;
}

function enrichNetworkMap(network: WorkspaceNetworkMapView, types: WorkspaceTypeView[]): WorkspaceNetworkMapView {
  const typeById = new Map(types.map((type) => [type.id, type]));
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const enrichedNodes = network.nodes.map((node) => ({
    ...node,
    outgoingLinkCount: 0,
    incomingLinkCount: 0,
    outgoingBandwidthBps: 0,
    incomingBandwidthBps: 0
  }));
  const enrichedNodeById = new Map(enrichedNodes.map((node) => [node.id, node]));
  const enrichedLinks = network.links.map((link) => ({
    ...link,
    fromNodeName: nodeById.get(link.fromNodeId)?.name,
    toNodeName: nodeById.get(link.toNodeId)?.name,
    bindingCount: 0,
    estimatedBandwidthBps: 0
  }));
  const enrichedLinkById = new Map(enrichedLinks.map((link) => [link.id, link]));
  const enrichedBindings = network.bindings.map((binding) => {
    const type = typeById.get(binding.typeId);
    const payloadSize = protocolPayloadSize(type);
    const estimatedBandwidthBps = payloadSize === undefined
      ? 0
      : payloadSize * binding.frequencyHz * binding.batchSize * binding.peakMultiplier;
    return {
      ...binding,
      protocolName: type?.qualifiedName,
      linkName: enrichedLinkById.get(binding.linkId)?.name,
      payloadSize,
      estimatedBandwidthBps
    };
  });

  for (const binding of enrichedBindings) {
    const link = enrichedLinkById.get(binding.linkId);
    if (!link) continue;
    link.bindingCount += 1;
    link.estimatedBandwidthBps += binding.estimatedBandwidthBps;
  }
  for (const link of enrichedLinks) {
    const source = enrichedNodeById.get(link.fromNodeId);
    const target = enrichedNodeById.get(link.toNodeId);
    if (source) {
      source.outgoingLinkCount += 1;
      source.outgoingBandwidthBps += link.estimatedBandwidthBps;
    }
    if (target) {
      target.incomingLinkCount += 1;
      target.incomingBandwidthBps += link.estimatedBandwidthBps;
    }
  }

  return {
    ...network,
    nodes: enrichedNodes,
    links: enrichedLinks,
    bindings: enrichedBindings
  };
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
      const lines = await linesFor(type.file);
      const fieldNote = inlineFieldComment(lines, field.location?.line) ?? await noteBefore(type.file, field.location?.line);
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

function validateWorkspaceContract(workspace: WorkspaceView): WorkspaceView {
  workspaceViewSchema.parse(workspace);
  return workspace;
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
  const lines = content.split(/\r?\n/);
  return types.map((type) => {
    const line = type.location?.line;
    const pack = line ? detectPackAtLine(content, line) : undefined;
    const underlyingType = type.kind === "enum" && line ? detectEnumUnderlyingType(content, line, type.name) : undefined;
    return {
      ...type,
      pack,
      underlyingType: underlyingType ?? type.underlyingType,
      fields: type.fields.map((field) => ({
        ...field,
        initializer: fieldInitializerFromLine(lines, field.location?.line)
      }))
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
      diagnostics: workspace.diagnostics.length,
      networkNodes: workspace.network.nodes.length,
      networkLinks: workspace.network.links.length,
      protocolBindings: workspace.network.bindings.length,
      flowViews: workspace.network.views.length
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
    network: {
      nodes: workspace.network.nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind })),
      links: workspace.network.links.map((link) => ({
        id: link.id,
        name: link.name,
        from: link.fromNodeName ?? link.fromNodeId,
        to: link.toNodeName ?? link.toNodeId,
        transport: link.transport,
        estimatedBandwidthBps: link.estimatedBandwidthBps
      })),
      bindings: workspace.network.bindings.map((binding) => ({
        id: binding.id,
        name: binding.name,
        protocolName: binding.protocolName ?? binding.typeId,
        linkName: binding.linkName ?? binding.linkId,
        estimatedBandwidthBps: binding.estimatedBandwidthBps
      })),
      views: workspace.network.views.map((view) => ({
        id: view.id,
        name: view.name,
        source: view.source,
        filter: view.filter
      }))
    },
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

  let workspace: WorkspaceView = {
    name: basename(root),
    rootPath: root,
    directories,
    files,
    types,
    network: enrichNetworkMap(await readNetworkMap(root), types),
    diagnostics,
    scanner
  };
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
  return validateWorkspaceContract(workspace);
}

export function sampleWorkspacePath(appPath: string): string {
  if (process.env.PROTOVAULT_SAMPLE_WORKSPACE) return resolve(process.env.PROTOVAULT_SAMPLE_WORKSPACE);
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

interface NetworkReportAnalysis {
  nodes: WorkspaceNetworkNodeView[];
  links: WorkspaceNetworkLinkView[];
  bindings: WorkspaceProtocolBindingView[];
  totalBandwidthBps: number;
  busiestNode?: WorkspaceNetworkNodeView;
  busiestLink?: WorkspaceNetworkLinkView;
  warnings: string[];
}

function networkReportFlowViewOptions(workspace: WorkspaceView): WorkspaceFlowView[] {
  return [
    { id: "derived:all", name: "全量网络", description: "展示当前网络地图的所有节点、链路和协议载荷。", filter: "", source: "derived" },
    { id: "derived:critical", name: "关键与高风险", description: "自动聚合关键链路、高关键等级绑定和超过带宽上限的链路。", filter: "critical", source: "derived" },
    ...workspace.network.views
  ];
}

function networkReportFilterTerms(filter?: string): string[] {
  return [...new Set((filter ?? "")
    .split(/[,，;\s]+/u)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean))];
}

function networkReportEntityText(workspace: WorkspaceView, context: {
  node?: WorkspaceNetworkNodeView;
  link?: WorkspaceNetworkLinkView;
  binding?: WorkspaceProtocolBindingView;
}): string {
  const type = context.binding ? workspace.types.find((item) => item.id === context.binding?.typeId) : undefined;
  const link = context.link ?? (context.binding ? workspace.network.links.find((item) => item.id === context.binding?.linkId) : undefined);
  const fromNode = link ? workspace.network.nodes.find((node) => node.id === link.fromNodeId) : undefined;
  const toNode = link ? workspace.network.nodes.find((node) => node.id === link.toNodeId) : undefined;
  return [
    context.node?.name,
    context.node?.kind,
    context.node?.role,
    context.node?.subsystem,
    context.node?.host,
    context.node?.process,
    context.node?.hardwareProfile,
    context.node?.softwareProfile,
    context.node?.notes,
    link?.name,
    link?.transport,
    link?.endpoint,
    link?.notes,
    fromNode?.name,
    fromNode?.kind,
    fromNode?.subsystem,
    toNode?.name,
    toNode?.kind,
    toNode?.subsystem,
    context.binding?.name,
    context.binding?.dataName,
    context.binding?.protocolName,
    context.binding?.criticality,
    context.binding?.notes,
    type?.name,
    type?.qualifiedName,
    type?.note
  ].filter(Boolean).join(" ").toLowerCase();
}

function networkReportEntityMatches(terms: string[], workspace: WorkspaceView, context: {
  node?: WorkspaceNetworkNodeView;
  link?: WorkspaceNetworkLinkView;
  binding?: WorkspaceProtocolBindingView;
}): boolean {
  if (terms.length === 0) return true;
  const link = context.link ?? (context.binding ? workspace.network.links.find((item) => item.id === context.binding?.linkId) : undefined);
  const overLimit = link ? isNetworkReportLinkOverLimit(link) : false;
  const critical = Boolean(link?.critical)
    || context.binding?.criticality === "high"
    || context.binding?.criticality === "critical"
    || overLimit;
  const highRate = (context.binding?.frequencyHz ?? 0) >= 30 || (context.binding?.estimatedBandwidthBps ?? link?.estimatedBandwidthBps ?? 0) >= 1024 * 64;
  const text = networkReportEntityText(workspace, context);
  return terms.some((term) => {
    if (["critical", "关键", "risk", "风险"].includes(term)) return critical;
    if (["high", "高频", "大流量", "hot"].includes(term)) return highRate || critical;
    if (["over", "over-limit", "超限", "瓶颈"].includes(term)) return overLimit;
    return text.includes(term);
  });
}

function isNetworkReportLinkOverLimit(link: WorkspaceNetworkLinkView): boolean {
  if (!link.bandwidthLimitMbps || link.bandwidthLimitMbps <= 0) return false;
  return link.estimatedBandwidthBps > link.bandwidthLimitMbps * 125_000;
}

function networkNodeBottleneckHints(node: WorkspaceNetworkNodeView): string[] {
  const hints: string[] = [];
  const total = node.incomingBandwidthBps + node.outgoingBandwidthBps;
  if (total >= 1024 * 1024 && !node.hardwareProfile?.trim()) {
    hints.push(`节点 ${node.name} 吞吐已到 ${formatReportBandwidth(total)}，建议补充 CPU/GPU/网卡/内存画像。`);
  }
  if (total >= 1024 * 1024 && !node.softwareProfile?.trim()) {
    hints.push(`节点 ${node.name} 吞吐较高，建议补充线程、队列、运行时和序列化策略。`);
  }
  if (node.outgoingLinkCount + node.incomingLinkCount >= 4) {
    hints.push(`节点 ${node.name} 连接数较多（出 ${node.outgoingLinkCount} / 入 ${node.incomingLinkCount}），适合作为架构评审重点。`);
  }
  if (node.kind === "gateway" && total >= 512 * 1024) {
    hints.push(`网关节点 ${node.name} 存在汇聚压力，建议检查转发队列、背压和丢包策略。`);
  }
  if (node.kind === "storage" && node.incomingBandwidthBps >= 512 * 1024) {
    hints.push(`存储节点 ${node.name} 写入压力较高，建议补充落盘频率、批量策略和 IO 上限。`);
  }
  return hints;
}

function protocolBindingBottleneckHints(binding: WorkspaceProtocolBindingView, link?: WorkspaceNetworkLinkView): string[] {
  const hints: string[] = [];
  if (binding.payloadSize === undefined) {
    hints.push(`协议 ${binding.name} 缺少载荷大小，带宽估算可靠性不足。`);
  }
  if (binding.peakMultiplier > 2) {
    hints.push(`协议 ${binding.name} 峰值系数为 x${binding.peakMultiplier}，建议确认突发来源和缓冲策略。`);
  }
  if (binding.estimatedBandwidthBps >= 1024 * 1024) {
    hints.push(`协议 ${binding.name} 单项吞吐 ${formatReportBandwidth(binding.estimatedBandwidthBps)}，建议优先审查字段布局和传输频率。`);
  }
  if (link && isNetworkReportLinkOverLimit(link)) {
    hints.push(`链路 ${link.name} 已超过配置带宽上限，${binding.name} 可能参与瓶颈。`);
  }
  return hints;
}

function deriveNetworkReportAnalysis(workspace: WorkspaceView, view: WorkspaceFlowView): NetworkReportAnalysis {
  const terms = networkReportFilterTerms(view.filter);
  const linkById = new Map(workspace.network.links.map((link) => [link.id, link]));
  const nodeById = new Map(workspace.network.nodes.map((node) => [node.id, node]));

  const matchedBindings = workspace.network.bindings.filter((binding) => {
    const link = linkById.get(binding.linkId);
    return networkReportEntityMatches(terms, workspace, { binding, link });
  });
  const matchedLinkIds = new Set(matchedBindings.map((binding) => binding.linkId));
  const matchedLinks = workspace.network.links.filter((link) => {
    if (matchedLinkIds.has(link.id)) return true;
    if (networkReportEntityMatches(terms, workspace, { link })) return true;
    const from = nodeById.get(link.fromNodeId);
    const to = nodeById.get(link.toNodeId);
    return networkReportEntityMatches(terms, workspace, { node: from }) || networkReportEntityMatches(terms, workspace, { node: to });
  });
  for (const link of matchedLinks) matchedLinkIds.add(link.id);
  const nodeIds = new Set<string>();
  for (const link of matchedLinks) {
    nodeIds.add(link.fromNodeId);
    nodeIds.add(link.toNodeId);
  }
  for (const node of workspace.network.nodes) {
    if (networkReportEntityMatches(terms, workspace, { node })) nodeIds.add(node.id);
  }
  const matchedNodes = workspace.network.nodes.filter((node) => nodeIds.has(node.id));
  const matchedBindingIds = new Set(matchedBindings.map((binding) => binding.id));
  for (const binding of workspace.network.bindings) {
    if (matchedLinkIds.has(binding.linkId)) matchedBindingIds.add(binding.id);
  }
  const bindings = workspace.network.bindings.filter((binding) => matchedBindingIds.has(binding.id));
  const links = matchedLinks.length > 0 || terms.length > 0 ? matchedLinks : workspace.network.links;
  const nodes = matchedNodes.length > 0 || terms.length > 0 ? matchedNodes : workspace.network.nodes;
  const totalBandwidthBps = bindings.reduce((sum, binding) => sum + binding.estimatedBandwidthBps, 0);
  const busiestNode = [...nodes].sort((a, b) => (b.incomingBandwidthBps + b.outgoingBandwidthBps) - (a.incomingBandwidthBps + a.outgoingBandwidthBps))[0];
  const busiestLink = [...links].sort((a, b) => b.estimatedBandwidthBps - a.estimatedBandwidthBps)[0];
  const warnings = new Set<string>();
  for (const link of links) {
    if (link.critical) warnings.add(`关键链路：${link.name}`);
    if (isNetworkReportLinkOverLimit(link)) warnings.add(`链路超限：${link.name} ${formatReportBandwidth(link.estimatedBandwidthBps)} / ${link.bandwidthLimitMbps} Mbps`);
  }
  for (const binding of bindings) {
    if (binding.criticality === "critical") warnings.add(`关键协议：${binding.name}`);
    if (binding.criticality === "high") warnings.add(`高优先级协议：${binding.name}`);
    const link = linkById.get(binding.linkId);
    for (const hint of protocolBindingBottleneckHints(binding, link)) warnings.add(hint);
  }
  for (const node of nodes) {
    for (const hint of networkNodeBottleneckHints(node)) warnings.add(hint);
  }
  return { nodes, links, bindings, totalBandwidthBps, busiestNode, busiestLink, warnings: [...warnings] };
}

function formatReportBandwidth(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function safeReportId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "network-flow";
}

async function git(root: string, args: string[], options?: { allowFailure?: false; trim?: boolean }): Promise<string>;
async function git(root: string, args: string[], options: { allowFailure: true; trim?: boolean }): Promise<string | null>;
async function git(root: string, args: string[], options?: { allowFailure?: boolean; trim?: boolean }): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
    return options?.trim === false ? stdout.replace(/\r?\n$/, "") : stdout.trim();
  } catch (error) {
    if (options?.allowFailure) return null;
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr.trim() : "";
    const message = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(message);
  }
}

function normalizeGitPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function assertGitPathInsideRepository(repositoryRoot: string, path: string): string {
  const normalized = validateGitRelativePath(path);
  const target = resolve(repositoryRoot, normalized);
  const relativePath = relative(repositoryRoot, target);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Git 文件路径必须位于当前仓库内。");
  }
  return target;
}

function parseGitStatusLine(line: string): { indexStatus: string; workingTreeStatus: string; path: string } | null {
  if (!line.trim()) return null;
  const indexStatus = line[0] ?? " ";
  const workingTreeStatus = line[1] ?? " ";
  const rawPath = line.slice(2).trim();
  const renamed = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
  return { indexStatus, workingTreeStatus, path: normalizeGitPath(renamed.replace(/^"|"$/g, "")) };
}

async function gitWorkspacePathspec(root: string, repositoryRoot: string): Promise<string> {
  const relativePath = normalizeGitPath(relative(repositoryRoot, root));
  return relativePath && !relativePath.startsWith("..") ? relativePath : ".";
}

function validateGitRelativePath(path: string): string {
  const normalized = normalizeGitPath(path.trim());
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../") || normalized === ".." || isAbsolute(normalized)) {
    throw new Error("Git 文件路径必须是当前仓库内的相对路径。");
  }
  return normalized;
}

function isStagedGitEntry(entry: GitWorkspaceStatus["entries"][number]): boolean {
  return entry.indexStatus.trim() !== "" && entry.indexStatus !== "?";
}

function isGitPathInsidePathspec(path: string, pathspec: string): boolean {
  if (pathspec === ".") return true;
  const normalizedPath = normalizeGitPath(path);
  const normalizedPathspec = normalizeGitPath(pathspec).replace(/\/+$/, "");
  return normalizedPath === normalizedPathspec || normalizedPath.startsWith(`${normalizedPathspec}/`);
}

async function assertGitRepository(workspaceRoot: string): Promise<GitWorkspaceStatus> {
  const status = await getGitStatus(workspaceRoot);
  if (!status.isRepository || !status.repositoryRoot) {
    throw new Error(status.message ?? "当前工作区不在 Git 仓库中。");
  }
  return status;
}

async function gitOperationResult(workspaceRoot: string, message: string, includeRefs = false): Promise<GitOperationResult> {
  return {
    status: await getGitStatus(workspaceRoot),
    branches: includeRefs ? await listGitBranches(workspaceRoot) : undefined,
    tags: includeRefs ? await listGitTags(workspaceRoot) : undefined,
    message
  };
}

export async function getGitStatus(workspaceRoot: string): Promise<GitWorkspaceStatus> {
  const root = resolve(workspaceRoot);
  const repositoryRoot = await git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (!repositoryRoot) {
    return {
      isRepository: false,
      isDirty: false,
      hasConflicts: false,
      entries: [],
      message: "当前工作区不在 Git 仓库中。"
    };
  }
  const repoRoot = resolve(repositoryRoot);
  const pathspec = await gitWorkspacePathspec(root, repoRoot);
  const currentBranch = await git(repoRoot, ["branch", "--show-current"], { allowFailure: true }) || undefined;
  const headCommit = await git(repoRoot, ["rev-parse", "HEAD"], { allowFailure: true }) || undefined;
  const latestTag = await git(repoRoot, ["describe", "--tags", "--abbrev=0"], { allowFailure: true }) || undefined;
  const statusOutput = await git(repoRoot, ["status", "--porcelain", "--untracked-files=all", "--", pathspec], { allowFailure: true, trim: false }) ?? "";
  const entries = statusOutput.split(/\r?\n/).map(parseGitStatusLine).filter((entry): entry is GitWorkspaceStatus["entries"][number] => Boolean(entry));
  const hasConflicts = entries.some((entry) => entry.indexStatus === "U" || entry.workingTreeStatus === "U" || ["AA", "DD"].includes(`${entry.indexStatus}${entry.workingTreeStatus}`));
  return {
    isRepository: true,
    repositoryRoot: repoRoot,
    workspaceRelativePath: pathspec,
    currentBranch,
    headCommit,
    headShortCommit: headCommit?.slice(0, 7),
    latestTag,
    isDirty: entries.length > 0,
    hasConflicts,
    entries
  };
}

export async function listGitBranches(workspaceRoot: string): Promise<GitBranchInfo[]> {
  const status = await getGitStatus(workspaceRoot);
  if (!status.isRepository || !status.repositoryRoot) return [];
  const output = await git(status.repositoryRoot, ["branch", "--format=%(if)%(HEAD)%(then)*%(else) %(end)%(refname:short)|%(objectname)"], { allowFailure: true }) ?? "";
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const current = line.startsWith("*");
    const [name, commit] = line.slice(1).split("|");
    return { name, current, commit };
  });
}

export async function listGitTags(workspaceRoot: string): Promise<GitTagInfo[]> {
  const status = await getGitStatus(workspaceRoot);
  if (!status.isRepository || !status.repositoryRoot) return [];
  const output = await git(status.repositoryRoot, ["tag", "--sort=-creatordate", "--format=%(refname:short)|%(objectname)|%(subject)|%(creatordate:iso-strict)"], { allowFailure: true }) ?? "";
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, commit, subject, createdAt] = line.split("|");
    return { name, commit, subject, createdAt };
  });
}

async function readGitRevisionFile(repositoryRoot: string, revision: "HEAD" | ":", path: string): Promise<string> {
  const normalized = validateGitRelativePath(path);
  const spec = revision === ":" ? `:${normalized}` : `${revision}:${normalized}`;
  return await git(repositoryRoot, ["show", spec], { allowFailure: true, trim: false }) ?? "";
}

async function readGitWorkingTreeFile(repositoryRoot: string, path: string): Promise<string> {
  const target = assertGitPathInsideRepository(repositoryRoot, path);
  return await fs.readFile(target, "utf8").catch(() => "");
}

async function getGitStatusEntryForPath(workspaceRoot: string, path: string): Promise<GitWorkspaceStatus["entries"][number]> {
  const status = await assertGitRepository(workspaceRoot);
  const normalized = validateGitRelativePath(path);
  const entry = status.entries.find((item) => item.path === normalized);
  if (entry) return entry;
  const fullStatusOutput = await git(status.repositoryRoot!, ["status", "--porcelain", "--untracked-files=all", "--", normalized], { allowFailure: true, trim: false }) ?? "";
  const parsed = fullStatusOutput.split(/\r?\n/).map(parseGitStatusLine).find((item): item is GitWorkspaceStatus["entries"][number] => Boolean(item));
  return parsed ?? { path: normalized, indexStatus: " ", workingTreeStatus: " " };
}

export async function getGitFileDiff(input: GitDiffInput): Promise<GitFileDiff> {
  const status = await assertGitRepository(input.workspaceRoot);
  const path = validateGitRelativePath(input.path);
  const entry = await getGitStatusEntryForPath(input.workspaceRoot, path);
  const isIndexSide = input.side === "index";
  const baseContent = isIndexSide
    ? await readGitRevisionFile(status.repositoryRoot!, "HEAD", path)
    : isStagedGitEntry(entry)
      ? await readGitRevisionFile(status.repositoryRoot!, ":", path)
      : await readGitRevisionFile(status.repositoryRoot!, "HEAD", path);
  const nextContent = isIndexSide
    ? entry.indexStatus === "D" ? "" : await readGitRevisionFile(status.repositoryRoot!, ":", path)
    : entry.workingTreeStatus === "D" ? "" : await readGitWorkingTreeFile(status.repositoryRoot!, path);
  return {
    path,
    side: input.side,
    status: entry,
    oldLabel: isIndexSide ? "HEAD" : isStagedGitEntry(entry) ? "Index" : "HEAD",
    newLabel: isIndexSide ? "Index" : "Working Tree",
    oldContent: baseContent,
    newContent: nextContent,
    binary: false
  };
}

export async function listGitCommitGraph(workspaceRoot: string, limit = 40): Promise<GitCommitGraphEntry[]> {
  const status = await getGitStatus(workspaceRoot);
  if (!status.isRepository || !status.repositoryRoot) return [];
  const safeLimit = String(Math.max(1, Math.min(100, Math.floor(limit))));
  const output = await git(status.repositoryRoot, [
    "log",
    `-${safeLimit}`,
    "--date=relative",
    "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%cr%x1f%D"
  ], { allowFailure: true }) ?? "";
  return output.split(/\r?\n/).filter(Boolean).map((line): GitCommitGraphEntry => {
    const [hash = "", shortHash = "", subject = "", author = "", relativeDate = "", refsRaw = ""] = line.split("\x1f");
    const refs = refsRaw.split(",").map((ref) => ref.trim()).filter(Boolean);
    return {
      hash,
      shortHash,
      subject,
      author,
      relativeDate,
      refs,
      current: status.headCommit === hash
    };
  });
}

export async function stageGitPath(input: GitPathInput): Promise<GitOperationResult> {
  const status = await assertGitRepository(input.workspaceRoot);
  const path = validateGitRelativePath(input.path);
  await git(status.repositoryRoot!, ["add", "--", path]);
  return gitOperationResult(input.workspaceRoot, `已暂存：${path}`);
}

export async function unstageGitPath(input: GitPathInput): Promise<GitOperationResult> {
  const status = await assertGitRepository(input.workspaceRoot);
  const path = validateGitRelativePath(input.path);
  await git(status.repositoryRoot!, ["reset", "--", path]);
  return gitOperationResult(input.workspaceRoot, `已取消暂存：${path}`);
}

export async function stageGitWorkspace(input: GitWorkspaceInput): Promise<GitOperationResult> {
  const status = await assertGitRepository(input.workspaceRoot);
  await git(status.repositoryRoot!, ["add", "--", status.workspaceRelativePath ?? "."]);
  return gitOperationResult(input.workspaceRoot, "已暂存当前工作区所有改动");
}

export async function unstageGitWorkspace(input: GitWorkspaceInput): Promise<GitOperationResult> {
  const status = await assertGitRepository(input.workspaceRoot);
  await git(status.repositoryRoot!, ["reset", "--", status.workspaceRelativePath ?? "."]);
  return gitOperationResult(input.workspaceRoot, "已取消当前工作区所有暂存");
}

export async function commitGitWorkspace(input: GitCommitInput): Promise<GitOperationResult> {
  const message = input.message.trim();
  if (!message) throw new Error("提交信息不能为空。");
  const status = await assertGitRepository(input.workspaceRoot);
  if (status.hasConflicts) throw new Error("当前工作区存在 Git 冲突，请先解决冲突再提交。");
  const stagedEntries = status.entries.filter(isStagedGitEntry);
  if (stagedEntries.length === 0) throw new Error("没有暂存的改动。请先暂存文件再提交。");

  const fullStatusOutput = await git(status.repositoryRoot!, ["status", "--porcelain", "--untracked-files=all"], { allowFailure: true, trim: false }) ?? "";
  const fullEntries = fullStatusOutput.split(/\r?\n/).map(parseGitStatusLine).filter((entry): entry is GitWorkspaceStatus["entries"][number] => Boolean(entry));
  const workspacePathspec = status.workspaceRelativePath ?? ".";
  const stagedOutsideWorkspace = fullEntries.filter((entry) => isStagedGitEntry(entry) && !isGitPathInsidePathspec(entry.path, workspacePathspec));
  if (stagedOutsideWorkspace.length > 0) {
    throw new Error(`仓库中存在当前工作区之外的暂存改动：${stagedOutsideWorkspace.slice(0, 3).map((entry) => entry.path).join(", ")}。请先处理这些暂存项，避免误提交。`);
  }

  await git(status.repositoryRoot!, ["commit", "-m", message]);
  return gitOperationResult(input.workspaceRoot, `已提交：${message}`, true);
}

export async function checkoutGitBranch(input: GitCheckoutBranchInput): Promise<GitOperationResult> {
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error("分支名称不能为空。");
  const status = await assertGitRepository(input.workspaceRoot);
  await git(status.repositoryRoot!, ["switch", branchName]);
  return gitOperationResult(input.workspaceRoot, `已切换分支：${branchName}`, true);
}

export async function createGitBranch(input: GitCreateBranchInput): Promise<GitOperationResult> {
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error("分支名称不能为空。");
  const status = await assertGitRepository(input.workspaceRoot);
  await git(status.repositoryRoot!, input.checkout === false ? ["branch", branchName] : ["switch", "-c", branchName]);
  return gitOperationResult(input.workspaceRoot, input.checkout === false ? `已创建分支：${branchName}` : `已创建并切换分支：${branchName}`, true);
}

export async function generateNetworkReport(input: GenerateNetworkReportInput): Promise<GeneratedDocumentReport> {
  const workspace = await scanWorkspace(input.workspaceRoot);
  const flowViews = networkReportFlowViewOptions(workspace);
  const selectedView = (input.flowViewId ? flowViews.find((view) => view.id === input.flowViewId) : undefined) ?? flowViews[0];
  const analysis = deriveNetworkReportAnalysis(workspace, selectedView);
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    `# ${workspace.name} 网络数据流报告`,
    "",
    `生成时间：${generatedAt}`,
    "",
    "## 视图摘要",
    "",
    markdownTable([
      ["指标", "值"],
      ["视图", selectedView.name],
      ["来源", selectedView.source],
      ["过滤条件", selectedView.filter || "全量"],
      ["节点", String(analysis.nodes.length)],
      ["链路", String(analysis.links.length)],
      ["协议载荷", String(analysis.bindings.length)],
      ["估算总量", formatReportBandwidth(analysis.totalBandwidthBps)]
    ]),
    "",
    selectedView.description ? `说明：${selectedView.description}` : "说明：从网络事实层派生的业务观察视角。",
    "",
    "## 关键观察",
    ""
  ];

  if (analysis.busiestLink) lines.push(`- 最高链路：${analysis.busiestLink.name}，${formatReportBandwidth(analysis.busiestLink.estimatedBandwidthBps)}。`);
  if (analysis.busiestNode) lines.push(`- 最高节点：${analysis.busiestNode.name}，入 ${formatReportBandwidth(analysis.busiestNode.incomingBandwidthBps)} / 出 ${formatReportBandwidth(analysis.busiestNode.outgoingBandwidthBps)}。`);
  if (!analysis.busiestLink && !analysis.busiestNode) lines.push("- 当前视图没有匹配到网络事实。");
  lines.push("", "## 风险与瓶颈提示", "");
  if (analysis.warnings.length === 0) {
    lines.push("当前视图未发现关键风险。", "");
  } else {
    lines.push(...analysis.warnings.map((warning) => `- ${warning}`), "");
  }

  lines.push("## 协议载荷", "");
  lines.push(markdownTable([
    ["名称", "业务数据", "协议", "链路", "频率", "批量", "峰值系数", "估算带宽", "关键等级"],
    ...analysis.bindings.map((binding) => [
      binding.name,
      binding.dataName || "—",
      binding.protocolName ?? binding.typeId,
      binding.linkName ?? binding.linkId,
      `${binding.frequencyHz} Hz`,
      String(binding.batchSize),
      `x${binding.peakMultiplier}`,
      formatReportBandwidth(binding.estimatedBandwidthBps),
      binding.criticality
    ])
  ]), "");

  lines.push("## 通信链路", "");
  lines.push(markdownTable([
    ["名称", "方向", "传输", "Endpoint", "协议数", "估算带宽", "上限", "关键"],
    ...analysis.links.map((link) => [
      link.name,
      `${link.fromNodeName ?? link.fromNodeId} → ${link.toNodeName ?? link.toNodeId}`,
      link.transport,
      link.endpoint || "—",
      String(link.bindingCount),
      formatReportBandwidth(link.estimatedBandwidthBps),
      link.bandwidthLimitMbps === undefined ? "—" : `${link.bandwidthLimitMbps} Mbps`,
      link.critical ? "是" : "否"
    ])
  ]), "");

  lines.push("## 实体节点", "");
  lines.push(markdownTable([
    ["名称", "类型", "角色", "分系统", "主机/进程", "入", "出", "画像完整度"],
    ...analysis.nodes.map((node) => [
      node.name,
      node.kind,
      node.role || "—",
      node.subsystem || "—",
      [node.host, node.process].filter(Boolean).join(" / ") || "—",
      formatReportBandwidth(node.incomingBandwidthBps),
      formatReportBandwidth(node.outgoingBandwidthBps),
      [node.hardwareProfile ? "硬件" : "", node.softwareProfile ? "软件" : ""].filter(Boolean).join("+") || "待补充"
    ])
  ]), "");

  const content = `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  const target = join(workspace.rootPath, ".protocol", "reports", `network-flow-${safeReportId(selectedView.id)}.md`);
  await atomicWriteFile(target, content);
  return { generatedAt, path: target, relativePath: reportRelativePath(workspace.rootPath, target), content };
}

interface ProtocolStateFile {
  schemaVersion: 2;
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

interface BaselineFile extends ProtocolStateFile {
  schemaVersion: 2;
  tagName: string;
  branch?: string;
  commit?: string;
  shortCommit?: string;
  gitStatus: {
    repositoryRoot?: string;
    workspaceRelativePath?: string;
    clean: boolean;
  };
  network: {
    nodeCount: number;
    linkCount: number;
    bindingCount: number;
    flowViewCount: number;
    nodes: Array<{ id: string; name: string; kind: string }>;
    links: Array<{ id: string; name: string; fromNodeId: string; toNodeId: string; transport: string; estimatedBandwidthBps: number }>;
    bindings: Array<{ id: string; name: string; linkId: string; typeId: string; estimatedBandwidthBps: number; criticality: string }>;
    views: Array<{ id: string; name: string; filter?: string }>;
  };
}

function baselineId(tagName: string): string {
  return tagName.trim().replace(/[^A-Za-z0-9._/-]+/g, "-").replace(/^-+|-+$/g, "").replaceAll("/", "-").slice(0, 80) || "baseline";
}

function baselineSummary(root: string, baseline: BaselineFile, path: string): ProtocolBaselineSummary {
  return {
    id: baseline.id,
    tagName: baseline.tagName,
    branch: baseline.branch,
    commit: baseline.commit,
    shortCommit: baseline.shortCommit,
    createdAt: baseline.createdAt,
    path,
    relativePath: reportRelativePath(root, path),
    typeCount: baseline.workspace.typeCount,
    fileCount: baseline.workspace.fileCount,
    networkNodeCount: baseline.network.nodeCount,
    networkLinkCount: baseline.network.linkCount,
    protocolBindingCount: baseline.network.bindingCount
  };
}

function protocolStateFromWorkspace(workspace: WorkspaceView, id: string, label?: string): ProtocolStateFile {
  return {
    schemaVersion: 2,
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

async function baselineFromWorkspace(workspace: WorkspaceView, tagName: string, status?: GitWorkspaceStatus): Promise<BaselineFile> {
  const gitStatus = status ?? await getGitStatus(workspace.rootPath);
  const state = protocolStateFromWorkspace(workspace, baselineId(tagName), tagName);
  return {
    ...state,
    schemaVersion: 2,
    tagName,
    branch: gitStatus.currentBranch,
    commit: gitStatus.headCommit,
    shortCommit: gitStatus.headShortCommit,
    gitStatus: {
      repositoryRoot: gitStatus.repositoryRoot,
      workspaceRelativePath: gitStatus.workspaceRelativePath,
      clean: !gitStatus.isDirty && !gitStatus.hasConflicts
    },
    network: {
      nodeCount: workspace.network.nodes.length,
      linkCount: workspace.network.links.length,
      bindingCount: workspace.network.bindings.length,
      flowViewCount: workspace.network.views.length,
      nodes: workspace.network.nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind })),
      links: workspace.network.links.map((link) => ({
        id: link.id,
        name: link.name,
        fromNodeId: link.fromNodeId,
        toNodeId: link.toNodeId,
        transport: link.transport,
        estimatedBandwidthBps: link.estimatedBandwidthBps
      })),
      bindings: workspace.network.bindings.map((binding) => ({
        id: binding.id,
        name: binding.name,
        linkId: binding.linkId,
        typeId: binding.typeId,
        estimatedBandwidthBps: binding.estimatedBandwidthBps,
        criticality: binding.criticality
      })),
      views: workspace.network.views.map((view) => ({ id: view.id, name: view.name, filter: view.filter }))
    }
  };
}

async function writeBaseline(root: string, baseline: BaselineFile): Promise<string> {
  const target = join(root, ".protocol", "baselines", `${baseline.id}.json`);
  await atomicWriteFile(target, `${JSON.stringify(baseline, null, 2)}\n`);
  return target;
}

async function readBaseline(path: string): Promise<BaselineFile> {
  return JSON.parse(await fs.readFile(path, "utf8")) as BaselineFile;
}

async function latestBaselinePath(root: string): Promise<string | undefined> {
  const directory = join(root, ".protocol", "baselines");
  try {
    const entries = await fs.readdir(directory);
    const baselines = entries.filter((entry) => entry.endsWith(".json")).sort();
    const latest = baselines.at(-1);
    return latest ? join(directory, latest) : undefined;
  } catch {
    return undefined;
  }
}

async function baselinePathForRef(root: string, ref?: string): Promise<string | undefined> {
  if (!ref) return latestBaselinePath(root);
  const direct = resolve(isAbsolute(ref) ? ref : join(root, ref));
  try {
    await fs.stat(direct);
    return direct;
  } catch {
    // Fall through to tag-name lookup.
  }
  const directory = join(root, ".protocol", "baselines");
  try {
    const entries = await fs.readdir(directory);
    for (const entry of entries.filter((item) => item.endsWith(".json")).sort().reverse()) {
      const path = join(directory, entry);
      const baseline = await readBaseline(path);
      if (baseline.tagName === ref || baseline.id === ref) return path;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sanitizeGitTagName(value: string): string {
  const tag = value.trim();
  if (!tag) throw new Error("Tag 名称不能为空。");
  if (tag.startsWith("-") || tag.endsWith("/") || tag.includes("..") || /[\s~^:?*[\]\\]/.test(tag)) {
    throw new Error("Tag 名称包含 Git 不支持的字符。");
  }
  return tag;
}

export async function createProtocolBaselineTag(input: CreateBaselineTagInput): Promise<ProtocolBaselineSummary> {
  const root = resolve(input.workspaceRoot);
  const tagName = sanitizeGitTagName(input.tagName);
  const status = await getGitStatus(root);
  if (!status.isRepository || !status.repositoryRoot) throw new Error("当前工作区不在 Git 仓库中，无法创建基线 Tag。");
  if (status.hasConflicts) throw new Error("当前工作区存在 Git 冲突，请先解决冲突再创建基线。");
  if (status.isDirty) throw new Error("当前工作区存在未提交改动。创建基线 Tag 前请先提交或清理改动。");
  const existingTag = await git(status.repositoryRoot, ["tag", "--list", tagName], { allowFailure: true });
  if (existingTag?.split(/\r?\n/).includes(tagName)) throw new Error(`Tag 已存在：${tagName}`);
  const workspace = await scanWorkspace(root);
  const baseline = await baselineFromWorkspace(workspace, tagName, status);
  const path = await writeBaseline(root, baseline);
  const message = input.message?.trim() || `ProtoVault protocol baseline ${tagName}\n\nBaseline: ${reportRelativePath(root, path)}\nCommit: ${baseline.commit ?? "unknown"}`;
  await git(status.repositoryRoot, ["tag", "-a", tagName, "-m", message]);
  return baselineSummary(root, baseline, path);
}

function semanticChange(kind: SemanticChange["kind"], severity: SemanticChange["severity"], message: string, targetId?: string, before?: string | number, after?: string | number): SemanticChange {
  return { id: stableId("change", `${kind}:${targetId ?? message}:${before ?? ""}:${after ?? ""}`), kind, severity, message, targetId, before, after };
}

function diffProtocolStates(base: ProtocolStateFile, current: ProtocolStateFile): SemanticChange[] {
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

function diffNetworkBaselines(base: BaselineFile, current: BaselineFile): SemanticChange[] {
  const changes: SemanticChange[] = [];
  const baseNodes = new Map(base.network.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.network.nodes.map((node) => [node.id, node]));
  for (const [id, node] of currentNodes) {
    if (!baseNodes.has(id)) changes.push(semanticChange("network-node-added", "compatible", `新增网络节点 ${node.name}。`, id));
  }
  for (const [id, node] of baseNodes) {
    if (!currentNodes.has(id)) changes.push(semanticChange("network-node-removed", "review", `删除网络节点 ${node.name}。`, id));
  }

  const baseLinks = new Map(base.network.links.map((link) => [link.id, link]));
  const currentLinks = new Map(current.network.links.map((link) => [link.id, link]));
  for (const [id, link] of currentLinks) {
    const before = baseLinks.get(id);
    if (!before) {
      changes.push(semanticChange("network-link-added", "compatible", `新增通信链路 ${link.name}。`, id));
      continue;
    }
    if (before.estimatedBandwidthBps !== link.estimatedBandwidthBps) {
      changes.push(semanticChange("network-link-bandwidth-changed", "review", `${link.name} 估算带宽从 ${formatReportBandwidth(before.estimatedBandwidthBps)} 变为 ${formatReportBandwidth(link.estimatedBandwidthBps)}。`, id, before.estimatedBandwidthBps, link.estimatedBandwidthBps));
    }
  }
  for (const [id, link] of baseLinks) {
    if (!currentLinks.has(id)) changes.push(semanticChange("network-link-removed", "review", `删除通信链路 ${link.name}。`, id));
  }

  const baseBindings = new Map(base.network.bindings.map((binding) => [binding.id, binding]));
  const currentBindings = new Map(current.network.bindings.map((binding) => [binding.id, binding]));
  for (const [id, binding] of currentBindings) {
    const before = baseBindings.get(id);
    if (!before) {
      changes.push(semanticChange("protocol-binding-added", "compatible", `新增协议绑定 ${binding.name}。`, id));
      continue;
    }
    if (before.estimatedBandwidthBps !== binding.estimatedBandwidthBps) {
      changes.push(semanticChange("protocol-binding-bandwidth-changed", "review", `${binding.name} 估算带宽从 ${formatReportBandwidth(before.estimatedBandwidthBps)} 变为 ${formatReportBandwidth(binding.estimatedBandwidthBps)}。`, id, before.estimatedBandwidthBps, binding.estimatedBandwidthBps));
    }
  }
  for (const [id, binding] of baseBindings) {
    if (!currentBindings.has(id)) changes.push(semanticChange("protocol-binding-removed", "review", `删除协议绑定 ${binding.name}。`, id));
  }

  const baseViews = new Map(base.network.views.map((view) => [view.id, view]));
  const currentViews = new Map(current.network.views.map((view) => [view.id, view]));
  for (const [id, view] of currentViews) {
    if (!baseViews.has(id)) changes.push(semanticChange("flow-view-added", "compatible", `新增数据流视角 ${view.name}。`, id));
  }
  for (const [id, view] of baseViews) {
    if (!currentViews.has(id)) changes.push(semanticChange("flow-view-removed", "review", `删除数据流视角 ${view.name}。`, id));
  }
  return changes;
}

export async function diffProtocolBaseline(input: GitSemanticDiffInput): Promise<SemanticDiffReport> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const current = await baselineFromWorkspace(workspace, "working-tree");
  const currentPath = await writeBaseline(root, current);
  const basePath = input.baseBaselinePath ? assertWorkspaceFile(root, input.baseBaselinePath) : await baselinePathForRef(root, input.baseRef);
  const base = basePath ? await readBaseline(basePath) : undefined;
  const changes = base ? [...diffProtocolStates(base, current), ...diffNetworkBaselines(base, current)] : [];
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    baseBaseline: base && basePath ? baselineSummary(root, base, basePath) : undefined,
    currentBaseline: baselineSummary(root, current, currentPath),
    baseRef: input.baseRef ?? base?.tagName,
    targetRef: "working-tree",
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

  await atomicWriteFile(target, renderNewHeader(relativePath));
  return scanWorkspace(root);
}

export async function createStruct(input: CreateStructInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  const structName = sanitizeCppIdentifier(input.structName, "结构体名称");
  const content = await fs.readFile(header, "utf8");
  if (new RegExp(`\\bstruct\\s+${structName}\\b`).test(content)) throw new Error(`结构体已存在：${structName}`);
  const insertion = `\n${renderStructDeclaration(structName)}\n`;
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
  const insertion = `\n${renderEnumDeclaration(enumName)}\n`;
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

export async function updateHeaderIncludes(input: UpdateHeaderIncludesInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const header = assertWorkspaceFile(root, input.headerPath);
  if (!HEADER_EXTENSIONS.has(extname(header).toLowerCase())) throw new Error("只能编辑 Header 依赖。");
  const discovery = await discoverWorkspace(root);
  const headerByRelativePath = new Map(discovery.headers.map((item) => [includeReferenceForHeader(root, item), item]));
  const currentRelativePath = includeReferenceForHeader(root, header);
  if (!headerByRelativePath.has(currentRelativePath)) throw new Error("当前 Header 不在工作区扫描范围内。");

  const includeReferences = [...new Set(input.includeRelativePaths.map(sanitizeHeaderRelativePath))]
    .filter((includePath) => includePath !== currentRelativePath)
    .sort((a, b) => a.localeCompare(b));
  for (const includePath of includeReferences) {
    if (!headerByRelativePath.has(includePath)) throw new Error(`未找到可 include 的 Header：${includePath}`);
  }

  const graph = new Map<string, Set<string>>();
  for (const candidate of discovery.headers) {
    const from = includeReferenceForHeader(root, candidate);
    const content = await fs.readFile(candidate, "utf8");
    const includes = [...content.matchAll(/^\s*#\s*include\s*"([^"]+)"/gm)]
      .map((match) => resolveInternalInclude(root, candidate, match[1], headerByRelativePath))
      .filter((target): target is string => Boolean(target))
      .map((target) => includeReferenceForHeader(root, target));
    graph.set(from, new Set(from === currentRelativePath ? includeReferences : includes));
  }
  for (const includePath of includeReferences) {
    if (wouldCreateIncludeCycle(graph, currentRelativePath, includePath)) {
      throw new Error(`已取消保存：${currentRelativePath} include ${includePath} 会形成循环引用。`);
    }
  }

  const content = await fs.readFile(header, "utf8");
  const nextContent = rewriteInternalIncludes(content, includeReferences, headerByRelativePath);
  await validateHeaderContent(root, header, nextContent);
  await atomicWriteFile(header, nextContent);
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
  const initializer = sanitizeFieldInitializer(input.initializer);
  if (targetType.fields.some((field) => field.name === fieldName)) throw new Error(`字段已存在：${fieldName}`);

  const content = await fs.readFile(header, "utf8");
  const pattern = new RegExp(`(struct\\s+${targetType.name}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\};)`);
  const match = pattern.exec(content);
  if (!match) throw new Error(`无法在 Header 中定位 struct ${targetType.name} 的受控编辑区域。`);
  const body = match[2].trimEnd();
  const nextBody = `${body}\n  ${renderFieldDeclaration(fieldType, fieldName, initializer)}`;
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
  const initializer = sanitizeFieldInitializer(input.initializer);
  if (fieldName !== targetField.name && targetType.fields.some((field) => field.name === fieldName)) {
    throw new Error(`字段已存在：${fieldName}`);
  }
  void workspace;
  const indent = lines[lineIndex]?.match(/^\s*/)?.[0] ?? "  ";
  const inlineNote = splitInlineLineComment(lines[lineIndex] ?? "").note;
  lines[lineIndex] = `${indent}${renderFieldDeclaration(fieldType, fieldName, initializer)}${inlineNote ? ` // ${inlineNote}` : ""}`;
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
  const nextBody = `${body}\n  ${renderEnumValueDeclaration(valueName, explicitValue)}`;
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
  lines[lineIndex] = `${indent}${renderEnumValueDeclaration(valueName, input.value)}`;
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

function networkNodeFromInput(input: CreateNetworkNodeInput | UpdateNetworkNodeInput, id: string): WorkspaceNetworkNodeView {
  const kind = input.kind;
  if (!NETWORK_NODE_KINDS.has(kind)) throw new Error("未知的网络节点类型。");
  return {
    id,
    name: cleanRequiredText(input.name, "节点名称"),
    kind,
    role: cleanOptionalText(input.role),
    subsystem: cleanOptionalText(input.subsystem),
    host: cleanOptionalText(input.host),
    process: cleanOptionalText(input.process),
    hardwareProfile: cleanOptionalText(input.hardwareProfile),
    softwareProfile: cleanOptionalText(input.softwareProfile),
    notes: cleanOptionalText(input.notes),
    outgoingLinkCount: 0,
    incomingLinkCount: 0,
    outgoingBandwidthBps: 0,
    incomingBandwidthBps: 0
  };
}

function networkLinkFromInput(input: CreateNetworkLinkInput | UpdateNetworkLinkInput, id: string, network: WorkspaceNetworkMapView): WorkspaceNetworkLinkView {
  const transport = input.transport;
  if (!NETWORK_TRANSPORT_KINDS.has(transport)) throw new Error("未知的链路传输方式。");
  if (!network.nodes.some((node) => node.id === input.fromNodeId)) throw new Error("链路源节点不存在。");
  if (!network.nodes.some((node) => node.id === input.toNodeId)) throw new Error("链路目标节点不存在。");
  if (input.fromNodeId === input.toNodeId) throw new Error("链路源节点和目标节点不能相同。");
  return {
    id,
    name: cleanRequiredText(input.name, "链路名称"),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    transport,
    endpoint: cleanOptionalText(input.endpoint),
    latencyBudgetMs: normalizeNonNegativeNumber(input.latencyBudgetMs, "延迟预算"),
    bandwidthLimitMbps: normalizeNonNegativeNumber(input.bandwidthLimitMbps, "带宽上限"),
    critical: Boolean(input.critical),
    notes: cleanOptionalText(input.notes),
    bindingCount: 0,
    estimatedBandwidthBps: 0
  };
}

function protocolBindingFromInput(input: CreateProtocolBindingInput | UpdateProtocolBindingInput, id: string, network: WorkspaceNetworkMapView, workspace: WorkspaceView): WorkspaceProtocolBindingView {
  const criticality = input.criticality ?? "normal";
  if (!PROTOCOL_BINDING_CRITICALITIES.has(criticality)) throw new Error("未知的协议绑定关键等级。");
  if (!network.links.some((link) => link.id === input.linkId)) throw new Error("协议绑定所属链路不存在。");
  if (!workspace.types.some((type) => type.id === input.typeId)) throw new Error("协议绑定引用的协议类型不存在。");
  return {
    id,
    name: cleanRequiredText(input.name, "协议绑定名称"),
    linkId: input.linkId,
    typeId: input.typeId,
    dataName: cleanOptionalText(input.dataName),
    frequencyHz: normalizeNonNegativeNumber(input.frequencyHz ?? 0, "发送频率") ?? 0,
    batchSize: normalizePositiveInteger(input.batchSize ?? 1, 1, "批量大小"),
    peakMultiplier: normalizePositiveNumber(input.peakMultiplier ?? 1, 1, "峰值倍数"),
    criticality,
    notes: cleanOptionalText(input.notes),
    estimatedBandwidthBps: 0
  };
}

function networkFlowViewFromInput(input: CreateNetworkFlowViewInput | UpdateNetworkFlowViewInput, id: string): WorkspaceFlowView {
  const source = input.source ?? "manual";
  if (!NETWORK_FLOW_VIEW_SOURCES.has(source)) throw new Error("未知的数据流视图来源。");
  return {
    id,
    name: cleanRequiredText(input.name, "数据流视图名称"),
    description: cleanOptionalText(input.description),
    filter: cleanOptionalText(input.filter),
    source
  };
}

export async function createNetworkNode(input: CreateNetworkNodeInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  network.nodes.push(networkNodeFromInput(input, createNetworkId("node")));
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function updateNetworkNode(input: UpdateNetworkNodeInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  const index = network.nodes.findIndex((node) => node.id === input.nodeId);
  if (index < 0) throw new Error("未找到要更新的网络节点。");
  network.nodes[index] = networkNodeFromInput(input, input.nodeId);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function deleteNetworkNode(input: DeleteNetworkNodeInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  if (!network.nodes.some((node) => node.id === input.nodeId)) throw new Error("未找到要删除的网络节点。");
  const removedLinkIds = new Set(network.links.filter((link) => link.fromNodeId === input.nodeId || link.toNodeId === input.nodeId).map((link) => link.id));
  network.nodes = network.nodes.filter((node) => node.id !== input.nodeId);
  network.links = network.links.filter((link) => !removedLinkIds.has(link.id));
  network.bindings = network.bindings.filter((binding) => !removedLinkIds.has(binding.linkId));
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function createNetworkLink(input: CreateNetworkLinkInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  network.links.push(networkLinkFromInput(input, createNetworkId("link"), network));
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function updateNetworkLink(input: UpdateNetworkLinkInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  const index = network.links.findIndex((link) => link.id === input.linkId);
  if (index < 0) throw new Error("未找到要更新的网络链路。");
  network.links[index] = networkLinkFromInput(input, input.linkId, network);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function deleteNetworkLink(input: DeleteNetworkLinkInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  if (!network.links.some((link) => link.id === input.linkId)) throw new Error("未找到要删除的网络链路。");
  network.links = network.links.filter((link) => link.id !== input.linkId);
  network.bindings = network.bindings.filter((binding) => binding.linkId !== input.linkId);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function createProtocolBinding(input: CreateProtocolBindingInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const network = await readNetworkMap(root);
  network.bindings.push(protocolBindingFromInput(input, createNetworkId("binding"), network, workspace));
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function updateProtocolBinding(input: UpdateProtocolBindingInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const workspace = await scanWorkspace(root);
  const network = await readNetworkMap(root);
  const index = network.bindings.findIndex((binding) => binding.id === input.bindingId);
  if (index < 0) throw new Error("未找到要更新的协议绑定。");
  network.bindings[index] = protocolBindingFromInput(input, input.bindingId, network, workspace);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function deleteProtocolBinding(input: DeleteProtocolBindingInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  if (!network.bindings.some((binding) => binding.id === input.bindingId)) throw new Error("未找到要删除的协议绑定。");
  network.bindings = network.bindings.filter((binding) => binding.id !== input.bindingId);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function createNetworkFlowView(input: CreateNetworkFlowViewInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  network.views.push(networkFlowViewFromInput(input, createNetworkId("flow")));
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function updateNetworkFlowView(input: UpdateNetworkFlowViewInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  const index = network.views.findIndex((view) => view.id === input.viewId);
  if (index < 0) throw new Error("未找到要更新的数据流视图。");
  network.views[index] = networkFlowViewFromInput(input, input.viewId);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

export async function deleteNetworkFlowView(input: DeleteNetworkFlowViewInput): Promise<WorkspaceView> {
  const root = resolve(input.workspaceRoot);
  const network = await readNetworkMap(root);
  if (!network.views.some((view) => view.id === input.viewId)) throw new Error("未找到要删除的数据流视图。");
  network.views = network.views.filter((view) => view.id !== input.viewId);
  await writeNetworkMap(root, network);
  return scanWorkspace(root);
}

type NoteSourceTarget = {
  header: string;
  lineIndex: number;
  targetKind: "type" | "field" | "enum-value";
  declarationKind?: WorkspaceTypeView["kind"];
  declarationName?: string;
};

function findNoteTarget(workspace: WorkspaceView, targetId: string): NoteSourceTarget | null {
  for (const type of workspace.types) {
    if (type.id === targetId) {
      return findTypeDeclarationLine(type);
    }
    const field = type.fields.find((item) => item.id === targetId);
    if (field?.location?.line) return { header: type.file, lineIndex: field.location.line - 1, targetKind: "field" };
    const enumValue = type.values.find((item) => item.id === targetId);
    if (enumValue?.location?.line) return { header: type.file, lineIndex: enumValue.location.line - 1, targetKind: "enum-value" };
  }
  return null;
}

function findTypeDeclarationLine(type: WorkspaceTypeView): NoteSourceTarget | null {
  return { header: type.file, lineIndex: -1, targetKind: "type", declarationKind: type.kind, declarationName: type.name };
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

  if (target.targetKind === "field") {
    const existingBlock = commentBlockBefore(lines, lineIndex);
    if (existingBlock) {
      lines.splice(existingBlock.start, existingBlock.end - existingBlock.start);
      lineIndex -= existingBlock.end - existingBlock.start;
    }
    const current = lines[lineIndex] ?? "";
    const { code } = splitInlineLineComment(current);
    lines[lineIndex] = note ? `${code} // ${note.replace(/\r?\n/g, " ").trim()}` : code;
    await atomicWriteFile(header, lines.join("\n"));
    return;
  }

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
