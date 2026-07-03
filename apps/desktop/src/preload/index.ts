import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AddFieldInput,
  AddEnumValueInput,
  CreateSnapshotInput,
  CreateEnumInput,
  CreateHeaderInput,
  CreateNetworkLinkInput,
  CreateNetworkNodeInput,
  CreateNetworkFlowViewInput,
  CreateProtocolBindingInput,
  CreateStructInput,
  DeleteEnumInput,
  DeleteEnumValueInput,
  DeleteFieldInput,
  DeleteHeaderInput,
  DeleteNetworkLinkInput,
  DeleteNetworkNodeInput,
  DeleteNetworkFlowViewInput,
  DeleteProtocolBindingInput,
  DeleteStructInput,
  DiffProtocolInput,
  GenerateDocumentInput,
  GeneratedDocumentReport,
  RenameEnumInput,
  RenameHeaderInput,
  RenameStructInput,
  ProtocolSnapshotSummary,
  SemanticDiffReport,
  UpdateNetworkLinkInput,
  UpdateNetworkNodeInput,
  UpdateNetworkFlowViewInput,
  UpdateProtocolBindingInput,
  UpdateDataFlowInput,
  UpdateEnumValueInput,
  UpdateFieldInput,
  UpdateHeaderContentInput,
  UpdateHeaderIncludesInput,
  UpdateNoteInput,
  WorkspaceExternalChange,
  WorkspaceScanProgress,
  WorkspaceLintReport,
  WorkspaceView
} from "../shared/workspace";

export interface ProtoVaultDesktopApi {
  health(): Promise<{ status: string; contractVersion: string }>;
  openSampleWorkspace(): Promise<WorkspaceView>;
  openWorkspace(): Promise<WorkspaceView | null>;
  scanWorkspace(workspaceRoot: string): Promise<WorkspaceView>;
  restoreLastWorkspace(): Promise<WorkspaceView | null>;
  openFileLocation(input: { workspaceRoot: string; filePath: string }): Promise<boolean>;
  onScanProgress(listener: (progress: WorkspaceScanProgress) => void): () => void;
  onExternalChange(listener: (change: WorkspaceExternalChange) => void): () => void;
  createHeader(input: CreateHeaderInput): Promise<WorkspaceView>;
  createStruct(input: CreateStructInput): Promise<WorkspaceView>;
  createEnum(input: CreateEnumInput): Promise<WorkspaceView>;
  renameHeader(input: RenameHeaderInput): Promise<WorkspaceView>;
  deleteHeader(input: DeleteHeaderInput): Promise<WorkspaceView>;
  updateHeaderContent(input: UpdateHeaderContentInput): Promise<WorkspaceView>;
  updateHeaderIncludes(input: UpdateHeaderIncludesInput): Promise<WorkspaceView>;
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
  updateDataFlow(input: UpdateDataFlowInput): Promise<WorkspaceView>;
  createNetworkNode(input: CreateNetworkNodeInput): Promise<WorkspaceView>;
  updateNetworkNode(input: UpdateNetworkNodeInput): Promise<WorkspaceView>;
  deleteNetworkNode(input: DeleteNetworkNodeInput): Promise<WorkspaceView>;
  createNetworkLink(input: CreateNetworkLinkInput): Promise<WorkspaceView>;
  updateNetworkLink(input: UpdateNetworkLinkInput): Promise<WorkspaceView>;
  deleteNetworkLink(input: DeleteNetworkLinkInput): Promise<WorkspaceView>;
  createProtocolBinding(input: CreateProtocolBindingInput): Promise<WorkspaceView>;
  updateProtocolBinding(input: UpdateProtocolBindingInput): Promise<WorkspaceView>;
  deleteProtocolBinding(input: DeleteProtocolBindingInput): Promise<WorkspaceView>;
  createNetworkFlowView(input: CreateNetworkFlowViewInput): Promise<WorkspaceView>;
  updateNetworkFlowView(input: UpdateNetworkFlowViewInput): Promise<WorkspaceView>;
  deleteNetworkFlowView(input: DeleteNetworkFlowViewInput): Promise<WorkspaceView>;
  lint(workspaceRoot: string): Promise<WorkspaceLintReport>;
  generateDocument(input: GenerateDocumentInput): Promise<GeneratedDocumentReport>;
  createSnapshot(input: CreateSnapshotInput): Promise<ProtocolSnapshotSummary>;
  diff(input: DiffProtocolInput): Promise<SemanticDiffReport>;
}

contextBridge.exposeInMainWorld("protoVault", {
  health: () => ipcRenderer.invoke("service:health"),
  openSampleWorkspace: () => ipcRenderer.invoke("workspace:open-sample"),
  openWorkspace: () => ipcRenderer.invoke("workspace:open"),
  scanWorkspace: (workspaceRoot) => ipcRenderer.invoke("workspace:scan", workspaceRoot),
  restoreLastWorkspace: () => ipcRenderer.invoke("workspace:restore-last"),
  openFileLocation: (input) => ipcRenderer.invoke("workspace:open-file-location", input),
  onScanProgress: (listener) => {
    const wrapped = (_event: IpcRendererEvent, progress: WorkspaceScanProgress): void => listener(progress);
    ipcRenderer.on("workspace:scan-progress", wrapped);
    return () => ipcRenderer.removeListener("workspace:scan-progress", wrapped);
  },
  onExternalChange: (listener) => {
    const wrapped = (_event: IpcRendererEvent, change: WorkspaceExternalChange): void => listener(change);
    ipcRenderer.on("workspace:external-change", wrapped);
    return () => ipcRenderer.removeListener("workspace:external-change", wrapped);
  },
  createHeader: (input) => ipcRenderer.invoke("protocol:create-header", input),
  createStruct: (input) => ipcRenderer.invoke("protocol:create-struct", input),
  createEnum: (input) => ipcRenderer.invoke("protocol:create-enum", input),
  renameHeader: (input) => ipcRenderer.invoke("protocol:rename-header", input),
  deleteHeader: (input) => ipcRenderer.invoke("protocol:delete-header", input),
  updateHeaderContent: (input) => ipcRenderer.invoke("protocol:update-header-content", input),
  updateHeaderIncludes: (input) => ipcRenderer.invoke("protocol:update-header-includes", input),
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
  updateNote: (input) => ipcRenderer.invoke("protocol:update-note", input),
  updateDataFlow: (input) => ipcRenderer.invoke("protocol:update-data-flow", input),
  createNetworkNode: (input) => ipcRenderer.invoke("network:create-node", input),
  updateNetworkNode: (input) => ipcRenderer.invoke("network:update-node", input),
  deleteNetworkNode: (input) => ipcRenderer.invoke("network:delete-node", input),
  createNetworkLink: (input) => ipcRenderer.invoke("network:create-link", input),
  updateNetworkLink: (input) => ipcRenderer.invoke("network:update-link", input),
  deleteNetworkLink: (input) => ipcRenderer.invoke("network:delete-link", input),
  createProtocolBinding: (input) => ipcRenderer.invoke("network:create-binding", input),
  updateProtocolBinding: (input) => ipcRenderer.invoke("network:update-binding", input),
  deleteProtocolBinding: (input) => ipcRenderer.invoke("network:delete-binding", input),
  createNetworkFlowView: (input) => ipcRenderer.invoke("network:create-flow-view", input),
  updateNetworkFlowView: (input) => ipcRenderer.invoke("network:update-flow-view", input),
  deleteNetworkFlowView: (input) => ipcRenderer.invoke("network:delete-flow-view", input),
  lint: (workspaceRoot) => ipcRenderer.invoke("protocol:lint", workspaceRoot),
  generateDocument: (input) => ipcRenderer.invoke("protocol:generate-document", input),
  createSnapshot: (input) => ipcRenderer.invoke("protocol:create-snapshot", input),
  diff: (input) => ipcRenderer.invoke("protocol:diff", input)
} satisfies ProtoVaultDesktopApi);
