import { contextBridge, ipcRenderer } from "electron";
import type { AddFieldInput, CreateHeaderInput, CreateStructInput, WorkspaceView } from "../shared/workspace";

export interface ProtoVaultDesktopApi {
  health(): Promise<{ status: string; contractVersion: string }>;
  openSampleWorkspace(): Promise<WorkspaceView>;
  openWorkspace(): Promise<WorkspaceView | null>;
  createHeader(input: CreateHeaderInput): Promise<WorkspaceView>;
  createStruct(input: CreateStructInput): Promise<WorkspaceView>;
  addField(input: AddFieldInput): Promise<WorkspaceView>;
}

contextBridge.exposeInMainWorld("protoVault", {
  health: () => ipcRenderer.invoke("service:health"),
  openSampleWorkspace: () => ipcRenderer.invoke("workspace:open-sample"),
  openWorkspace: () => ipcRenderer.invoke("workspace:open"),
  createHeader: (input) => ipcRenderer.invoke("protocol:create-header", input),
  createStruct: (input) => ipcRenderer.invoke("protocol:create-struct", input),
  addField: (input) => ipcRenderer.invoke("protocol:add-field", input)
} satisfies ProtoVaultDesktopApi);
