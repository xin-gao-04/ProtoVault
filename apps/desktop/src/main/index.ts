import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from "electron";
import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { createServiceHealth } from "../shared/service";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateSnapshotInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateNetworkLinkInput,
  CreateNetworkNodeInput,
  CreateProtocolBindingInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteFieldInput,
  DeleteHeaderInput,
  DeleteNetworkLinkInput,
  DeleteNetworkNodeInput,
  DeleteProtocolBindingInput,
  DeleteStructInput,
  DiffProtocolInput,
  GenerateDocumentInput,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  UpdateNetworkLinkInput,
  UpdateNetworkNodeInput,
  UpdateProtocolBindingInput,
  UpdateDataFlowInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateHeaderIncludesInput,
  UpdateNoteInput,
  WorkspaceExternalChange,
  WorkspaceScanProgress,
  WorkspaceView
} from "../shared/workspace";
import {
  addEnumValue,
  addField,
  createNetworkLink,
  createNetworkNode,
  createProtocolSnapshot,
  createProtocolBinding,
  createEnum,
  createHeader,
  createStruct,
  deleteEnum,
  deleteEnumValue,
  deleteField,
  deleteHeader,
  deleteNetworkLink,
  deleteNetworkNode,
  deleteProtocolBinding,
  deleteStruct,
  diffProtocolSnapshot,
  generateProtocolDocument,
  lintWorkspace,
  renameEnum,
  renameHeader,
  renameStruct,
  updateNetworkLink,
  updateNetworkNode,
  updateProtocolBinding,
  sampleWorkspacePath,
  scanWorkspace,
  updateDataFlow,
  updateEnumValue,
  updateField,
  updateHeaderContent,
  updateHeaderIncludes,
  updateNote
} from "./workspace";

interface AppPreferences {
  lastWorkspacePath?: string;
}

const HEADER_EXTENSIONS = new Set([".h", ".hh", ".hpp", ".hxx"]);

interface WatchedWorkspace {
  root: string;
  sender: WebContents;
  watcher: FSWatcher;
  hashes: Map<string, string>;
  ignoreUntil: number;
  debounce?: NodeJS.Timeout;
}

let watchedWorkspace: WatchedWorkspace | null = null;

function preferencesPath(): string {
  return join(app.getPath("userData"), "preferences.json");
}

async function readPreferences(): Promise<AppPreferences> {
  try {
    return JSON.parse(await fs.readFile(preferencesPath(), "utf8")) as AppPreferences;
  } catch {
    return {};
  }
}

async function writePreferences(preferences: AppPreferences): Promise<void> {
  const target = preferencesPath();
  const temp = join(app.getPath("userData"), `preferences.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(temp, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

function scanProgressReporter(sender: WebContents): (progress: WorkspaceScanProgress) => void {
  return (progress) => sender.send("workspace:scan-progress", progress);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function workspaceFileHashes(workspace: WorkspaceView): Map<string, string> {
  return new Map(workspace.files.map((file) => [resolve(file.path), file.contentHash]));
}

function shouldWatchHeader(root: string, changedPath?: string): boolean {
  if (!changedPath) return true;
  const target = resolve(isAbsolute(changedPath) ? changedPath : join(root, changedPath));
  const normalizedRelative = relative(root, target).replaceAll("\\", "/");
  if (!normalizedRelative || normalizedRelative.startsWith("..") || normalizedRelative.startsWith(".protocol/")) return false;
  return HEADER_EXTENSIONS.has(extname(target).toLowerCase());
}

function suppressWorkspaceWatcher(rootPath: string): void {
  const root = resolve(rootPath);
  if (watchedWorkspace?.root === root) watchedWorkspace.ignoreUntil = Date.now() + 2500;
}

function assertPathInsideWorkspace(workspaceRoot: string, targetPath: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(isAbsolute(targetPath) ? targetPath : join(root, targetPath));
  const relativePath = relative(root, target);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("只能打开当前工作区内的文件位置。");
  }
  return target;
}

async function emitExternalChangeIfNeeded(root: string, sender: WebContents, changedPath?: string): Promise<void> {
  if (!watchedWorkspace || watchedWorkspace.root !== root) return;
  if (Date.now() < watchedWorkspace.ignoreUntil) return;
  if (!shouldWatchHeader(root, changedPath)) return;
  const target = changedPath ? resolve(isAbsolute(changedPath) ? changedPath : join(root, changedPath)) : undefined;
  if (target) {
    try {
      const content = await fs.readFile(target, "utf8");
      const currentHash = hashContent(content);
      if (watchedWorkspace.hashes.get(target) === currentHash) return;
    } catch {
      if (!watchedWorkspace.hashes.has(target)) return;
    }
  }
  const payload: WorkspaceExternalChange = {
    workspaceRoot: root,
    changedPath: target,
    relativePath: target ? relative(root, target).replaceAll("\\", "/") : undefined,
    detectedAt: new Date().toISOString()
  };
  sender.send("workspace:external-change", payload);
}

function rememberWorkspaceState(workspace: WorkspaceView, sender: WebContents): void {
  const root = resolve(workspace.rootPath);
  if (!watchedWorkspace || watchedWorkspace.root !== root || watchedWorkspace.sender.id !== sender.id) {
    watchedWorkspace?.watcher.close();
    let watcher: FSWatcher | null = null;
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!watchedWorkspace || watchedWorkspace.root !== root) return;
        const changedPath = filename ? String(filename) : undefined;
        if (watchedWorkspace.debounce) clearTimeout(watchedWorkspace.debounce);
        watchedWorkspace.debounce = setTimeout(() => {
          void emitExternalChangeIfNeeded(root, sender, changedPath);
        }, 450);
      });
    } catch {
      return;
    }
    watchedWorkspace = {
      root,
      sender,
      watcher,
      hashes: workspaceFileHashes(workspace),
      ignoreUntil: Date.now() + 900
    };
    sender.once("destroyed", () => {
      if (watchedWorkspace?.sender.id === sender.id) {
        watchedWorkspace.watcher.close();
        watchedWorkspace = null;
      }
    });
  } else {
    watchedWorkspace.hashes = workspaceFileHashes(workspace);
  }
}

async function scanAndRemember(rootPath: string, sender?: WebContents) {
  const workspace = await scanWorkspace(rootPath, sender ? { onProgress: scanProgressReporter(sender) } : undefined);
  await writePreferences({ ...(await readPreferences()), lastWorkspacePath: workspace.rootPath });
  if (sender) rememberWorkspaceState(workspace, sender);
  return workspace;
}

async function runWorkspaceMutation<T extends { workspaceRoot: string }>(
  sender: WebContents,
  input: T,
  action: (input: T) => Promise<WorkspaceView>
): Promise<WorkspaceView> {
  suppressWorkspaceWatcher(input.workspaceRoot);
  const workspace = await action(input);
  suppressWorkspaceWatcher(workspace.rootPath);
  rememberWorkspaceState(workspace, sender);
  return workspace;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#17191f",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("service:health", createServiceHealth);
  ipcMain.handle("workspace:open-sample", (event) => scanAndRemember(sampleWorkspacePath(app.getAppPath()), event.sender));
  ipcMain.handle("workspace:open", async (event) => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "打开 ProtoVault 工作区" });
    if (result.canceled || result.filePaths.length === 0) return null;
    return scanAndRemember(result.filePaths[0], event.sender);
  });
  ipcMain.handle("workspace:scan", (event, workspaceRoot: string) => scanAndRemember(workspaceRoot, event.sender));
  ipcMain.handle("workspace:open-file-location", async (_event, input: { workspaceRoot: string; filePath: string }) => {
    const target = assertPathInsideWorkspace(input.workspaceRoot, input.filePath);
    await shell.showItemInFolder(target);
    return true;
  });
  ipcMain.handle("workspace:restore-last", async (event) => {
    if (process.env.PROTOVAULT_DISABLE_RESTORE === "1") return null;
    const lastWorkspacePath = (await readPreferences()).lastWorkspacePath;
    if (!lastWorkspacePath) return null;
    return scanAndRemember(lastWorkspacePath, event.sender);
  });
  ipcMain.handle("protocol:create-header", (event, input: CreateHeaderInput) => runWorkspaceMutation(event.sender, input, createHeader));
  ipcMain.handle("protocol:create-struct", (event, input: CreateStructInput) => runWorkspaceMutation(event.sender, input, createStruct));
  ipcMain.handle("protocol:create-enum", (event, input: CreateEnumInput) => runWorkspaceMutation(event.sender, input, createEnum));
  ipcMain.handle("protocol:rename-header", (event, input: RenameHeaderInput) => runWorkspaceMutation(event.sender, input, renameHeader));
  ipcMain.handle("protocol:delete-header", (event, input: DeleteHeaderInput) => runWorkspaceMutation(event.sender, input, deleteHeader));
  ipcMain.handle("protocol:update-header-content", (event, input: UpdateHeaderContentInput) => runWorkspaceMutation(event.sender, input, updateHeaderContent));
  ipcMain.handle("protocol:update-header-includes", (event, input: UpdateHeaderIncludesInput) => runWorkspaceMutation(event.sender, input, updateHeaderIncludes));
  ipcMain.handle("protocol:rename-struct", (event, input: RenameStructInput) => runWorkspaceMutation(event.sender, input, renameStruct));
  ipcMain.handle("protocol:delete-struct", (event, input: DeleteStructInput) => runWorkspaceMutation(event.sender, input, deleteStruct));
  ipcMain.handle("protocol:rename-enum", (event, input: RenameEnumInput) => runWorkspaceMutation(event.sender, input, renameEnum));
  ipcMain.handle("protocol:delete-enum", (event, input: DeleteEnumInput) => runWorkspaceMutation(event.sender, input, deleteEnum));
  ipcMain.handle("protocol:add-field", (event, input: AddFieldInput) => runWorkspaceMutation(event.sender, input, addField));
  ipcMain.handle("protocol:update-field", (event, input: UpdateFieldInput) => runWorkspaceMutation(event.sender, input, updateField));
  ipcMain.handle("protocol:delete-field", (event, input: DeleteFieldInput) => runWorkspaceMutation(event.sender, input, deleteField));
  ipcMain.handle("protocol:add-enum-value", (event, input: AddEnumValueInput) => runWorkspaceMutation(event.sender, input, addEnumValue));
  ipcMain.handle("protocol:update-enum-value", (event, input: UpdateEnumValueInput) => runWorkspaceMutation(event.sender, input, updateEnumValue));
  ipcMain.handle("protocol:delete-enum-value", (event, input: DeleteEnumValueInput) => runWorkspaceMutation(event.sender, input, deleteEnumValue));
  ipcMain.handle("protocol:update-note", (event, input: UpdateNoteInput) => runWorkspaceMutation(event.sender, input, updateNote));
  ipcMain.handle("protocol:update-data-flow", (event, input: UpdateDataFlowInput) => runWorkspaceMutation(event.sender, input, updateDataFlow));
  ipcMain.handle("network:create-node", (event, input: CreateNetworkNodeInput) => runWorkspaceMutation(event.sender, input, createNetworkNode));
  ipcMain.handle("network:update-node", (event, input: UpdateNetworkNodeInput) => runWorkspaceMutation(event.sender, input, updateNetworkNode));
  ipcMain.handle("network:delete-node", (event, input: DeleteNetworkNodeInput) => runWorkspaceMutation(event.sender, input, deleteNetworkNode));
  ipcMain.handle("network:create-link", (event, input: CreateNetworkLinkInput) => runWorkspaceMutation(event.sender, input, createNetworkLink));
  ipcMain.handle("network:update-link", (event, input: UpdateNetworkLinkInput) => runWorkspaceMutation(event.sender, input, updateNetworkLink));
  ipcMain.handle("network:delete-link", (event, input: DeleteNetworkLinkInput) => runWorkspaceMutation(event.sender, input, deleteNetworkLink));
  ipcMain.handle("network:create-binding", (event, input: CreateProtocolBindingInput) => runWorkspaceMutation(event.sender, input, createProtocolBinding));
  ipcMain.handle("network:update-binding", (event, input: UpdateProtocolBindingInput) => runWorkspaceMutation(event.sender, input, updateProtocolBinding));
  ipcMain.handle("network:delete-binding", (event, input: DeleteProtocolBindingInput) => runWorkspaceMutation(event.sender, input, deleteProtocolBinding));
  ipcMain.handle("protocol:lint", (_event, workspaceRoot: string) => lintWorkspace(workspaceRoot));
  ipcMain.handle("protocol:generate-document", (_event, input: GenerateDocumentInput) => generateProtocolDocument(input));
  ipcMain.handle("protocol:create-snapshot", (_event, input: CreateSnapshotInput) => createProtocolSnapshot(input));
  ipcMain.handle("protocol:diff", (_event, input: DiffProtocolInput) => diffProtocolSnapshot(input));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
