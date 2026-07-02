import { app, BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createServiceHealth } from "../shared/service";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateSnapshotInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteFieldInput,
  DeleteHeaderInput,
  DeleteStructInput,
  DiffProtocolInput,
  GenerateDocumentInput,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  UpdateDataFlowInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateHeaderIncludesInput,
  UpdateNoteInput,
  WorkspaceScanProgress
} from "../shared/workspace";
import {
  addEnumValue,
  addField,
  createProtocolSnapshot,
  createEnum,
  createHeader,
  createStruct,
  deleteEnum,
  deleteEnumValue,
  deleteField,
  deleteHeader,
  deleteStruct,
  diffProtocolSnapshot,
  generateProtocolDocument,
  lintWorkspace,
  renameEnum,
  renameHeader,
  renameStruct,
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

async function scanAndRemember(rootPath: string, sender?: WebContents) {
  const workspace = await scanWorkspace(rootPath, sender ? { onProgress: scanProgressReporter(sender) } : undefined);
  await writePreferences({ ...(await readPreferences()), lastWorkspacePath: workspace.rootPath });
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
  ipcMain.handle("workspace:restore-last", async (event) => {
    if (process.env.PROTOVAULT_DISABLE_RESTORE === "1") return null;
    const lastWorkspacePath = (await readPreferences()).lastWorkspacePath;
    if (!lastWorkspacePath) return null;
    return scanWorkspace(lastWorkspacePath, { onProgress: scanProgressReporter(event.sender) });
  });
  ipcMain.handle("protocol:create-header", (_event, input: CreateHeaderInput) => createHeader(input));
  ipcMain.handle("protocol:create-struct", (_event, input: CreateStructInput) => createStruct(input));
  ipcMain.handle("protocol:create-enum", (_event, input: CreateEnumInput) => createEnum(input));
  ipcMain.handle("protocol:rename-header", (_event, input: RenameHeaderInput) => renameHeader(input));
  ipcMain.handle("protocol:delete-header", (_event, input: DeleteHeaderInput) => deleteHeader(input));
  ipcMain.handle("protocol:update-header-content", (_event, input: UpdateHeaderContentInput) => updateHeaderContent(input));
  ipcMain.handle("protocol:update-header-includes", (_event, input: UpdateHeaderIncludesInput) => updateHeaderIncludes(input));
  ipcMain.handle("protocol:rename-struct", (_event, input: RenameStructInput) => renameStruct(input));
  ipcMain.handle("protocol:delete-struct", (_event, input: DeleteStructInput) => deleteStruct(input));
  ipcMain.handle("protocol:rename-enum", (_event, input: RenameEnumInput) => renameEnum(input));
  ipcMain.handle("protocol:delete-enum", (_event, input: DeleteEnumInput) => deleteEnum(input));
  ipcMain.handle("protocol:add-field", (_event, input: AddFieldInput) => addField(input));
  ipcMain.handle("protocol:update-field", (_event, input: UpdateFieldInput) => updateField(input));
  ipcMain.handle("protocol:delete-field", (_event, input: DeleteFieldInput) => deleteField(input));
  ipcMain.handle("protocol:add-enum-value", (_event, input: AddEnumValueInput) => addEnumValue(input));
  ipcMain.handle("protocol:update-enum-value", (_event, input: UpdateEnumValueInput) => updateEnumValue(input));
  ipcMain.handle("protocol:delete-enum-value", (_event, input: DeleteEnumValueInput) => deleteEnumValue(input));
  ipcMain.handle("protocol:update-note", (_event, input: UpdateNoteInput) => updateNote(input));
  ipcMain.handle("protocol:update-data-flow", (_event, input: UpdateDataFlowInput) => updateDataFlow(input));
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
