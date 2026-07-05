export interface WorkspaceFieldView {
  id: string;
  name: string;
  type: string;
  initializer?: string;
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

export type NetworkNodeKind =
  | "simulator"
  | "model"
  | "service"
  | "gateway"
  | "storage"
  | "visualization"
  | "hardware"
  | "external"
  | "other";

export type NetworkTransportKind = "udp" | "tcp" | "dds" | "shared-memory" | "file" | "mq" | "custom" | "manual";

export type ProtocolBindingCriticality = "low" | "normal" | "high" | "critical";

export interface WorkspaceNetworkNodeView {
  id: string;
  name: string;
  kind: NetworkNodeKind;
  role?: string;
  subsystem?: string;
  host?: string;
  process?: string;
  hardwareProfile?: string;
  softwareProfile?: string;
  notes?: string;
  outgoingLinkCount: number;
  incomingLinkCount: number;
  outgoingBandwidthBps: number;
  incomingBandwidthBps: number;
}

export interface WorkspaceNetworkLinkView {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  fromNodeName?: string;
  toNodeName?: string;
  transport: NetworkTransportKind;
  endpoint?: string;
  latencyBudgetMs?: number;
  bandwidthLimitMbps?: number;
  critical: boolean;
  notes?: string;
  bindingCount: number;
  estimatedBandwidthBps: number;
}

export interface WorkspaceProtocolBindingView {
  id: string;
  name: string;
  linkId: string;
  linkName?: string;
  typeId: string;
  protocolName?: string;
  dataName?: string;
  frequencyHz: number;
  batchSize: number;
  peakMultiplier: number;
  payloadSize?: number;
  estimatedBandwidthBps: number;
  criticality: ProtocolBindingCriticality;
  notes?: string;
}

export interface WorkspaceFlowView {
  id: string;
  name: string;
  description?: string;
  filter?: string;
  source: "manual" | "derived" | "ai";
}

export interface WorkspaceNetworkMapView {
  schemaVersion: 1;
  nodes: WorkspaceNetworkNodeView[];
  links: WorkspaceNetworkLinkView[];
  bindings: WorkspaceProtocolBindingView[];
  views: WorkspaceFlowView[];
  updatedAt?: string;
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
  network: WorkspaceNetworkMapView;
  diagnostics: WorkspaceDiagnostic[];
  scanner: string;
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
}

export interface GitWorkspaceStatus {
  isRepository: boolean;
  repositoryRoot?: string;
  workspaceRelativePath?: string;
  currentBranch?: string;
  headCommit?: string;
  headShortCommit?: string;
  latestTag?: string;
  isDirty: boolean;
  hasConflicts: boolean;
  entries: GitStatusEntry[];
  message?: string;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  commit?: string;
}

export interface GitTagInfo {
  name: string;
  commit?: string;
  subject?: string;
  createdAt?: string;
}

export interface GitPathInput {
  workspaceRoot: string;
  path: string;
}

export interface GitWorkspaceInput {
  workspaceRoot: string;
}

export interface GitCommitInput {
  workspaceRoot: string;
  message: string;
}

export interface GitCheckoutBranchInput {
  workspaceRoot: string;
  branchName: string;
}

export interface GitCreateBranchInput {
  workspaceRoot: string;
  branchName: string;
  checkout?: boolean;
}

export interface GitOperationResult {
  status: GitWorkspaceStatus;
  branches?: GitBranchInfo[];
  tags?: GitTagInfo[];
  message: string;
}

export interface WorkspaceDiagnostic {
  severity: "error" | "warning";
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface WorkspaceScanProgress {
  phase: "discover" | "read" | "parse" | "metadata" | "done";
  message: string;
  current: number;
  total: number;
  file?: string;
}

export interface WorkspaceExternalChange {
  workspaceRoot: string;
  changedPath?: string;
  relativePath?: string;
  detectedAt: string;
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

export interface UpdateHeaderIncludesInput {
  workspaceRoot: string;
  headerPath: string;
  includeRelativePaths: string[];
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
  initializer?: string;
}

export interface UpdateFieldInput {
  workspaceRoot: string;
  typeId: string;
  fieldId: string;
  fieldType: string;
  fieldName: string;
  initializer?: string;
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

export interface CreateNetworkNodeInput {
  workspaceRoot: string;
  name: string;
  kind: NetworkNodeKind;
  role?: string;
  subsystem?: string;
  host?: string;
  process?: string;
  hardwareProfile?: string;
  softwareProfile?: string;
  notes?: string;
}

export interface UpdateNetworkNodeInput extends CreateNetworkNodeInput {
  nodeId: string;
}

export interface DeleteNetworkNodeInput {
  workspaceRoot: string;
  nodeId: string;
}

export interface CreateNetworkLinkInput {
  workspaceRoot: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  transport: NetworkTransportKind;
  endpoint?: string;
  latencyBudgetMs?: number;
  bandwidthLimitMbps?: number;
  critical?: boolean;
  notes?: string;
}

export interface UpdateNetworkLinkInput extends CreateNetworkLinkInput {
  linkId: string;
}

export interface DeleteNetworkLinkInput {
  workspaceRoot: string;
  linkId: string;
}

export interface CreateProtocolBindingInput {
  workspaceRoot: string;
  name: string;
  linkId: string;
  typeId: string;
  dataName?: string;
  frequencyHz?: number;
  batchSize?: number;
  peakMultiplier?: number;
  criticality?: ProtocolBindingCriticality;
  notes?: string;
}

export interface UpdateProtocolBindingInput extends CreateProtocolBindingInput {
  bindingId: string;
}

export interface DeleteProtocolBindingInput {
  workspaceRoot: string;
  bindingId: string;
}

export interface CreateNetworkFlowViewInput {
  workspaceRoot: string;
  name: string;
  description?: string;
  filter?: string;
  source?: WorkspaceFlowView["source"];
}

export interface UpdateNetworkFlowViewInput extends CreateNetworkFlowViewInput {
  viewId: string;
}

export interface DeleteNetworkFlowViewInput {
  workspaceRoot: string;
  viewId: string;
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

export interface GenerateNetworkReportInput {
  workspaceRoot: string;
  flowViewId?: string;
}

export interface GeneratedDocumentReport {
  generatedAt: string;
  path: string;
  relativePath: string;
  content: string;
}

export interface CreateBaselineTagInput {
  workspaceRoot: string;
  tagName: string;
  message?: string;
}

export interface ProtocolBaselineSummary {
  id: string;
  tagName: string;
  branch?: string;
  commit?: string;
  shortCommit?: string;
  createdAt: string;
  path: string;
  relativePath: string;
  typeCount: number;
  fileCount: number;
  networkNodeCount: number;
  networkLinkCount: number;
  protocolBindingCount: number;
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
  | "type-size-changed"
  | "network-node-added"
  | "network-node-removed"
  | "network-link-added"
  | "network-link-removed"
  | "network-link-bandwidth-changed"
  | "protocol-binding-added"
  | "protocol-binding-removed"
  | "protocol-binding-bandwidth-changed"
  | "flow-view-added"
  | "flow-view-removed";

export interface SemanticChange {
  id: string;
  kind: SemanticChangeKind;
  severity: "breaking" | "compatible" | "review";
  message: string;
  targetId?: string;
  before?: string | number;
  after?: string | number;
}

export interface GitSemanticDiffInput {
  workspaceRoot: string;
  baseRef?: string;
  baseBaselinePath?: string;
}

export interface SemanticDiffReport {
  generatedAt: string;
  baseBaseline?: ProtocolBaselineSummary;
  currentBaseline: ProtocolBaselineSummary;
  baseRef?: string;
  targetRef: string;
  changeCount: number;
  breakingCount: number;
  compatibleCount: number;
  reviewCount: number;
  changes: SemanticChange[];
}
