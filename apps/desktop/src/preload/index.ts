import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteFieldInput,
  DeleteHeaderInput,
  DeleteStructInput,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateNoteInput,
  WorkspaceScanProgress,
  WorkspaceView
} from "../shared/workspace";

export interface ProtoVaultDesktopApi {
  health(): Promise<{ status: string; contractVersion: string }>;
  openSampleWorkspace(): Promise<WorkspaceView>;
  openWorkspace(): Promise<WorkspaceView | null>;
  restoreLastWorkspace(): Promise<WorkspaceView | null>;
  onScanProgress(listener: (progress: WorkspaceScanProgress) => void): () => void;
  createHeader(input: CreateHeaderInput): Promise<WorkspaceView>;
  createStruct(input: CreateStructInput): Promise<WorkspaceView>;
  createEnum(input: CreateEnumInput): Promise<WorkspaceView>;
  renameHeader(input: RenameHeaderInput): Promise<WorkspaceView>;
  deleteHeader(input: DeleteHeaderInput): Promise<WorkspaceView>;
  updateHeaderContent(input: UpdateHeaderContentInput): Promise<WorkspaceView>;
  renameStruct(input: RenameStructInput): Promise<WorkspaceView>;
  deleteStruct(input: DeleteStructInput): Promise<WorkspaceView>;
  renameEnum(input: RenameEnumInput): Promise<WorkspaceView>;
  deleteEnum(input: DeleteEnumInput): Promise<WorkspaceView>;
  addField(input: AddFieldInput): Promise<WorkspaceView>;
  updateField(input: UpdateFieldInput): Promise<WorkspaceView>;
  deleteField(input: DeleteFieldInput): Promise<WorkspaceView>;
  addEnumValue(input: AddEnumValueInput): Promise<WorkspaceView>;
  updateEnumValue(input: UpdateEnumValueInput): Promise<WorkspaceView>;
  deleteEnumValue(input: DeleteEnumValueInput): Promise<WorkspaceView>;
  updateNote(input: UpdateNoteInput): Promise<WorkspaceView>;
}

contextBridge.exposeInMainWorld("protoVault", {
  health: () => ipcRenderer.invoke("service:health"),
  openSampleWorkspace: () => ipcRenderer.invoke("workspace:open-sample"),
  openWorkspace: () => ipcRenderer.invoke("workspace:open"),
  restoreLastWorkspace: () => ipcRenderer.invoke("workspace:restore-last"),
  onScanProgress: (listener) => {
    const wrapped = (_event: IpcRendererEvent, progress: WorkspaceScanProgress): void => listener(progress);
    ipcRenderer.on("workspace:scan-progress", wrapped);
    return () => ipcRenderer.removeListener("workspace:scan-progress", wrapped);
  },
  createHeader: (input) => ipcRenderer.invoke("protocol:create-header", input),
  createStruct: (input) => ipcRenderer.invoke("protocol:create-struct", input),
  createEnum: (input) => ipcRenderer.invoke("protocol:create-enum", input),
  renameHeader: (input) => ipcRenderer.invoke("protocol:rename-header", input),
  deleteHeader: (input) => ipcRenderer.invoke("protocol:delete-header", input),
  updateHeaderContent: (input) => ipcRenderer.invoke("protocol:update-header-content", input),
  renameStruct: (input) => ipcRenderer.invoke("protocol:rename-struct", input),
  deleteStruct: (input) => ipcRenderer.invoke("protocol:delete-struct", input),
  renameEnum: (input) => ipcRenderer.invoke("protocol:rename-enum", input),
  deleteEnum: (input) => ipcRenderer.invoke("protocol:delete-enum", input),
  addField: (input) => ipcRenderer.invoke("protocol:add-field", input),
  updateField: (input) => ipcRenderer.invoke("protocol:update-field", input),
  deleteField: (input) => ipcRenderer.invoke("protocol:delete-field", input),
  addEnumValue: (input) => ipcRenderer.invoke("protocol:add-enum-value", input),
  updateEnumValue: (input) => ipcRenderer.invoke("protocol:update-enum-value", input),
  deleteEnumValue: (input) => ipcRenderer.invoke("protocol:delete-enum-value", input),
  updateNote: (input) => ipcRenderer.invoke("protocol:update-note", input)
} satisfies ProtoVaultDesktopApi);
