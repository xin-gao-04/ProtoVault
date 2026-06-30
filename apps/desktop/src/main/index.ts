import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { createServiceHealth } from "../shared/service";
import type { AddFieldInput, CreateHeaderInput, CreateStructInput } from "../shared/workspace";
import { addField, createHeader, createStruct, sampleWorkspacePath, scanWorkspace } from "./workspace";

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
  ipcMain.handle("workspace:open-sample", () => scanWorkspace(sampleWorkspacePath(app.getAppPath())));
  ipcMain.handle("workspace:open", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "打开 ProtoVault 工作区" });
    if (result.canceled || result.filePaths.length === 0) return null;
    return scanWorkspace(result.filePaths[0]);
  });
  ipcMain.handle("protocol:create-header", (_event, input: CreateHeaderInput) => createHeader(input));
  ipcMain.handle("protocol:create-struct", (_event, input: CreateStructInput) => createStruct(input));
  ipcMain.handle("protocol:add-field", (_event, input: AddFieldInput) => addField(input));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
