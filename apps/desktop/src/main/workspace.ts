import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  AddFieldInput,
  CreateHeaderInput,
  CreateStructInput,
  WorkspaceDirectoryView,
  WorkspaceFileView,
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

async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, targetPath);
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
          fields: (node.inner ?? []).filter((child) => child.kind === "FieldDecl" && child.name).map((child) => ({
            id: stableId("field", `${qualifiedName}::${child.name}`),
            name: child.name!,
            type: child.type?.qualType ?? "<unknown>",
            location: child.loc?.line ? { file: sourceFile, line: child.loc.line, column: child.loc.col ?? 1 } : undefined
          })),
          values: (node.inner ?? []).filter((child) => child.kind === "EnumConstantDecl" && child.name).map((child) => ({
            name: child.name!,
            value: enumValue(child)
          }))
        });
      }
    }
    for (const child of node.inner ?? []) visit(child, nextNamespaces, traversalFile);
  }

  visit(root, [], defaultFile);
  return types;
}

async function scanHeader(clang: string, header: string, root: string, includeRoots: string[]): Promise<WorkspaceTypeView[]> {
  const includeArgs = includeRoots.flatMap((includeRoot) => ["-I", includeRoot]);
  const { stdout } = await execFileAsync(clang, [
    "-x", "c++-header", "-std=c++20", ...includeArgs,
    "-Xclang", "-ast-dump=json", "-fsyntax-only", header
  ], { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return collectTypes(JSON.parse(stdout) as AstNode, root, header);
}

async function readFileView(path: string, root: string): Promise<WorkspaceFileView> {
  const content = await fs.readFile(path, "utf8");
  const includes = [...content.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)].map((match) => match[1]);
  return { path, relativePath: relative(root, path).replaceAll("\\", "/"), includes, content };
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

export async function scanWorkspace(rootPath: string): Promise<WorkspaceView> {
  const root = resolve(rootPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("请选择工作区文件夹，而不是单个文件。");

  const discovery = await discoverWorkspace(root);
  const headers = discovery.headers;
  const directories = discovery.directories.map((directory) => readDirectoryView(directory, root));
  const files = await Promise.all(headers.map((header) => readFileView(header, root)));
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
      const batches = await Promise.all(headers.map(async (header) => {
        try { return await scanHeader(clang, header, root, includeRoots); }
        catch (error) {
          diagnostics.push({ severity: "error", file: header, message: error instanceof Error ? error.message : String(error) });
          return [];
        }
      }));
      const deduplicated = new Map(batches.flat().map((type) => [type.id, type]));
      types = [...deduplicated.values()].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
    } catch (error) {
      diagnostics.push({ severity: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const workspace: WorkspaceView = { name: basename(root), rootPath: root, directories, files, types, diagnostics, scanner };
  try {
    workspace.metadataPath = await writeWorkspaceRecord(workspace);
  } catch (error) {
    diagnostics.push({ severity: "warning", message: `目录记录写入失败：${error instanceof Error ? error.message : String(error)}` });
  }

  return workspace;
}

export function sampleWorkspacePath(appPath: string): string {
  return resolve(appPath, "..", "..", "examples");
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
  const nextBody = `${body}\n  ${fieldType} ${fieldName};`;
  const nextContent = `${content.slice(0, match.index)}${match[1]}${nextBody}${match[3]}${content.slice(match.index + match[0].length)}`;
  await atomicWriteFile(header, nextContent);
  return scanWorkspace(root);
}
