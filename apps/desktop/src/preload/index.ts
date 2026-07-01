import { contextBridge, ipcRenderer } from "electron";
import type {
  AddFieldInput,
  CreateHeaderInput,
  CreateStructInput,
  DeleteFieldInput,
  DeleteHeaderInput,
  DeleteStructInput,
  RenameHeaderInput,
  RenameStructInput,
  UpdateFieldInput,
  WorkspaceView
} from "../shared/workspace";

export interface ProtoVaultDesktopApi {
  health(): Promise<{ status: string; contractVersion: string }>;
  openSampleWorkspace(): Promise<WorkspaceView>;
  openWorkspace(): Promise<WorkspaceView | null>;
  restoreLastWorkspace(): Promise<WorkspaceView | null>;
  createHeader(input: CreateHeaderInput): Promise<WorkspaceView>;
  createStruct(input: CreateStructInput): Promise<WorkspaceView>;
  renameHeader(input: RenameHeaderInput): Promise<WorkspaceView>;
  deleteHeader(input: DeleteHeaderInput): Promise<WorkspaceView>;
  renameStruct(input: RenameStructInput): Promise<WorkspaceView>;
  deleteStruct(input: DeleteStructInput): Promise<WorkspaceView>;
  addField(input: AddFieldInput): Promise<WorkspaceView>;
  updateField(input: UpdateFieldInput): Promise<WorkspaceView>;
  deleteField(input: DeleteFieldInput): Promise<WorkspaceView>;
}

contextBridge.exposeInMainWorld("protoVault", {
  health: () => ipcRenderer.invoke("service:health"),
  openSampleWorkspace: () => ipcRenderer.invoke("workspace:open-sample"),
  openWorkspace: () => ipcRenderer.invoke("workspace:open"),
  restoreLastWorkspace: () => ipcRenderer.invoke("workspace:restore-last"),
  createHeader: (input) => ipcRenderer.invoke("protocol:create-header", input),
  createStruct: (input) => ipcRenderer.invoke("protocol:create-struct", input),
  renameHeader: (input) => ipcRenderer.invoke("protocol:rename-header", input),
  deleteHeader: (input) => ipcRenderer.invoke("protocol:delete-header", input),
  renameStruct: (input) => ipcRenderer.invoke("protocol:rename-struct", input),
  deleteStruct: (input) => ipcRenderer.invoke("protocol:delete-struct", input),
  addField: (input) => ipcRenderer.invoke("protocol:add-field", input),
  updateField: (input) => ipcRenderer.invoke("protocol:update-field", input),
  deleteField: (input) => ipcRenderer.invoke("protocol:delete-field", input)
} satisfies ProtoVaultDesktopApi);
