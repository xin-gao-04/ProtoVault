export interface WorkspaceFieldView {
  id: string;
  name: string;
  type: string;
  note?: string;
  location?: { file: string; line: number; column: number };
}

export interface WorkspaceEnumValueView {
  id: string;
  name: string;
  value?: number;
  note?: string;
  location?: { file: string; line: number; column: number };
}

export interface WorkspaceFieldLayoutView {
  fieldId: string;
  name: string;
  type: string;
  offset?: number;
  size?: number;
  alignment?: number;
  paddingBefore: number;
  paddingAfter: number;
  supported: boolean;
  reason?: string;
}

export interface WorkspaceMemoryLayoutView {
  size?: number;
  alignment?: number;
  dataSize: number;
  paddingBytes: number;
  partial: boolean;
  pack?: number;
  source: "estimated";
  fields: WorkspaceFieldLayoutView[];
}

export interface WorkspaceTypeView {
  id: string;
  kind: "struct" | "enum";
  name: string;
  qualifiedName: string;
  file: string;
  note?: string;
  dataFlow?: WorkspaceDataFlowMetadata;
  pack?: number;
  underlyingType?: string;
  location?: { file: string; line: number; column: number };
  layout?: WorkspaceMemoryLayoutView;
  fields: WorkspaceFieldView[];
  values: WorkspaceEnumValueView[];
}

export interface WorkspaceDataFlowMetadata {
  producers: string[];
  consumers: string[];
}

export interface WorkspaceFileView {
  path: string;
  relativePath: string;
  includes: string[];
  content: string;
  contentHash: string;
}

export interface WorkspaceDirectoryView {
  path: string;
  relativePath: string;
}

export interface WorkspaceView {
  name: string;
  rootPath: string;
  metadataPath?: string;
  directories: WorkspaceDirectoryView[];
  files: WorkspaceFileView[];
  types: WorkspaceTypeView[];
  diagnostics: Array<{ severity: "error" | "warning"; message: string; file?: string }>;
  scanner: string;
}

export interface WorkspaceScanProgress {
  phase: "discover" | "read" | "parse" | "metadata" | "done";
  message: string;
  current: number;
  total: number;
  file?: string;
}

export interface CreateHeaderInput {
  workspaceRoot: string;
  relativePath: string;
}

export interface CreateStructInput {
  workspaceRoot: string;
  headerPath: string;
  structName: string;
}

export interface CreateEnumInput {
  workspaceRoot: string;
  headerPath: string;
  enumName: string;
}

export interface RenameHeaderInput {
  workspaceRoot: string;
  headerPath: string;
  newRelativePath: string;
}

export interface DeleteHeaderInput {
  workspaceRoot: string;
  headerPath: string;
}

export interface UpdateHeaderContentInput {
  workspaceRoot: string;
  headerPath: string;
  content: string;
  expectedHash?: string;
}

export interface RenameStructInput {
  workspaceRoot: string;
  typeId: string;
  structName: string;
}

export interface DeleteStructInput {
  workspaceRoot: string;
  typeId: string;
}

export interface RenameEnumInput {
  workspaceRoot: string;
  typeId: string;
  enumName: string;
}

export interface DeleteEnumInput {
  workspaceRoot: string;
  typeId: string;
}

export interface AddFieldInput {
  workspaceRoot: string;
  typeId: string;
  fieldType: string;
  fieldName: string;
}

export interface UpdateFieldInput {
  workspaceRoot: string;
  typeId: string;
  fieldId: string;
  fieldType: string;
  fieldName: string;
}

export interface DeleteFieldInput {
  workspaceRoot: string;
  typeId: string;
  fieldId: string;
}

export interface AddEnumValueInput {
  workspaceRoot: string;
  typeId: string;
  valueName: string;
  value?: number;
}

export interface UpdateEnumValueInput {
  workspaceRoot: string;
  typeId: string;
  valueId: string;
  valueName: string;
  value?: number;
}

export interface DeleteEnumValueInput {
  workspaceRoot: string;
  typeId: string;
  valueId: string;
}

export interface UpdateNoteInput {
  workspaceRoot: string;
  targetId: string;
  note: string;
}

export interface UpdateDataFlowInput {
  workspaceRoot: string;
  typeId: string;
  producers: string[];
  consumers: string[];
}

export interface WorkspaceLintIssue {
  id: string;
  ruleId: string;
  severity: "error" | "warning" | "suggestion";
  message: string;
  targetId?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface WorkspaceLintReport {
  generatedAt: string;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
  issues: WorkspaceLintIssue[];
}

export interface GenerateDocumentInput {
  workspaceRoot: string;
}

export interface GeneratedDocumentReport {
  generatedAt: string;
  path: string;
  relativePath: string;
  content: string;
}

export interface CreateSnapshotInput {
  workspaceRoot: string;
  label?: string;
}

export interface ProtocolSnapshotSummary {
  id: string;
  label?: string;
  createdAt: string;
  path: string;
  relativePath: string;
  typeCount: number;
  fileCount: number;
}

export type SemanticChangeKind =
  | "type-added"
  | "type-removed"
  | "field-added"
  | "field-removed"
  | "field-type-changed"
  | "field-offset-changed"
  | "enum-value-added"
  | "enum-value-removed"
  | "enum-value-number-changed"
  | "type-size-changed";

export interface SemanticChange {
  id: string;
  kind: SemanticChangeKind;
  severity: "breaking" | "compatible" | "review";
  message: string;
  targetId?: string;
  before?: string | number;
  after?: string | number;
}

export interface DiffProtocolInput {
  workspaceRoot: string;
  baseSnapshotPath?: string;
}

export interface SemanticDiffReport {
  generatedAt: string;
  baseSnapshot?: ProtocolSnapshotSummary;
  currentSnapshot: ProtocolSnapshotSummary;
  changeCount: number;
  breakingCount: number;
  compatibleCount: number;
  reviewCount: number;
  changes: SemanticChange[];
}
