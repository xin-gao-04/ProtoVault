import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;

export const sourceLocationSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive()
});

export const diagnosticSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["error", "warning", "suggestion"]),
  code: z.string().min(1),
  message: z.string().min(1),
  location: sourceLocationSchema.optional()
});

export const semanticMetadataSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  range: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  coordinateSystem: z.string().optional(),
  timeBase: z.string().optional(),
  sourceModules: z.array(z.string()).default([]),
  consumerModules: z.array(z.string()).default([]),
  archived: z.boolean().default(false)
});

const emptyMetadata = {
  sourceModules: [],
  consumerModules: [],
  archived: false
};

const primitiveTypeSchema = z.object({
  kind: z.literal("primitive"),
  name: z.enum([
    "int8_t", "uint8_t", "int16_t", "uint16_t", "int32_t", "uint32_t",
    "int64_t", "uint64_t", "float", "double", "bool", "char"
  ])
});

const namedTypeSchema = z.object({
  kind: z.enum(["struct", "enum"]),
  targetId: z.string().min(1),
  displayName: z.string().min(1)
});

const unsupportedTypeSchema = z.object({
  kind: z.literal("unsupported"),
  spelling: z.string().min(1),
  reason: z.string().min(1)
});

export type TypeRef =
  | z.infer<typeof primitiveTypeSchema>
  | z.infer<typeof namedTypeSchema>
  | { kind: "array"; element: TypeRef; length: number }
  | z.infer<typeof unsupportedTypeSchema>;

export const typeRefSchema: z.ZodType<TypeRef> = z.lazy(() => z.discriminatedUnion("kind", [
  primitiveTypeSchema,
  namedTypeSchema,
  z.object({ kind: z.literal("array"), element: typeRefSchema, length: z.number().int().positive() }),
  unsupportedTypeSchema
]));

export const fieldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: typeRefSchema,
  metadata: semanticMetadataSchema.default(emptyMetadata),
  location: sourceLocationSchema.optional()
});

export const enumSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scoped: z.boolean(),
  underlyingType: z.string().min(1),
  values: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), value: z.number().int() })),
  metadata: semanticMetadataSchema.default(emptyMetadata)
});

export const memoryLayoutSchema = z.object({
  size: z.number().int().nonnegative(),
  alignment: z.number().int().positive(),
  paddingBytes: z.number().int().nonnegative(),
  fields: z.array(z.object({
    fieldId: z.string().min(1),
    offset: z.number().int().nonnegative(),
    size: z.number().int().nonnegative(),
    paddingAfter: z.number().int().nonnegative()
  }))
});

export const structSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fields: z.array(fieldSchema),
  metadata: semanticMetadataSchema.default(emptyMetadata),
  layout: memoryLayoutSchema.optional(),
  pack: z.number().int().positive().optional()
});

export const namespaceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  qualifiedName: z.string()
});

export const protocolFileSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  contentHash: z.string().min(1),
  includes: z.array(z.string()),
  namespaceIds: z.array(z.string()),
  structIds: z.array(z.string()),
  enumIds: z.array(z.string())
});

export const workspaceSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  revision: z.number().int().nonnegative(),
  files: z.array(protocolFileSchema),
  namespaces: z.array(namespaceSchema),
  structs: z.array(structSchema),
  enums: z.array(enumSchema),
  diagnostics: z.array(diagnosticSchema)
});

export const protocolSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  workspaceRevision: z.number().int().nonnegative(),
  workspace: workspaceSchema
});

export const semanticChangeKindSchema = z.enum([
  "type-added",
  "type-removed",
  "type-renamed",
  "field-added",
  "field-removed",
  "field-renamed",
  "field-type-changed",
  "field-offset-changed",
  "enum-value-added",
  "enum-value-removed",
  "enum-value-renamed",
  "enum-value-number-changed",
  "type-size-changed",
  "network-node-added",
  "network-node-removed",
  "network-link-added",
  "network-link-removed",
  "network-link-bandwidth-changed",
  "protocol-binding-added",
  "protocol-binding-removed",
  "protocol-binding-bandwidth-changed",
  "flow-view-added",
  "flow-view-removed"
]);

export const semanticChangeSchema = z.object({
  id: z.string().min(1),
  kind: semanticChangeKindSchema,
  severity: z.enum(["breaking", "compatible", "review"]),
  message: z.string().min(1),
  targetId: z.string().optional(),
  before: z.union([z.string(), z.number()]).optional(),
  after: z.union([z.string(), z.number()]).optional()
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  diagnostics: z.array(diagnosticSchema).default([]),
  location: sourceLocationSchema.optional()
});

export const serviceRequestSchema = z.object({
  id: z.string().min(1),
  method: z.enum([
    "workspace/open", "workspace/scan", "workspace/status", "protocol/get",
    "protocol/update", "protocol/generate", "protocol/layout", "protocol/lint",
    "protocol/diff", "git/status", "git/branches", "git/tags",
    "git/create-baseline-tag", "git/semantic-diff", "sync/status", "sync/resolve"
  ]),
  payload: z.unknown()
});

export const workspaceViewLocationSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive()
});

export const workspaceDataFlowMetadataSchema = z.object({
  producers: z.array(z.string()),
  consumers: z.array(z.string())
});

export const networkNodeKindSchema = z.enum([
  "simulator",
  "model",
  "service",
  "gateway",
  "storage",
  "visualization",
  "hardware",
  "external",
  "other"
]);

export const networkTransportKindSchema = z.enum(["udp", "tcp", "dds", "shared-memory", "file", "mq", "custom", "manual"]);

export const protocolBindingCriticalitySchema = z.enum(["low", "normal", "high", "critical"]);

export const workspaceNetworkNodeViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: networkNodeKindSchema,
  role: z.string().optional(),
  subsystem: z.string().optional(),
  host: z.string().optional(),
  process: z.string().optional(),
  hardwareProfile: z.string().optional(),
  softwareProfile: z.string().optional(),
  notes: z.string().optional(),
  outgoingLinkCount: z.number().int().nonnegative(),
  incomingLinkCount: z.number().int().nonnegative(),
  outgoingBandwidthBps: z.number().nonnegative(),
  incomingBandwidthBps: z.number().nonnegative()
});

export const workspaceNetworkLinkViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  fromNodeName: z.string().optional(),
  toNodeName: z.string().optional(),
  transport: networkTransportKindSchema,
  endpoint: z.string().optional(),
  latencyBudgetMs: z.number().nonnegative().optional(),
  bandwidthLimitMbps: z.number().nonnegative().optional(),
  critical: z.boolean(),
  notes: z.string().optional(),
  bindingCount: z.number().int().nonnegative(),
  estimatedBandwidthBps: z.number().nonnegative()
});

export const workspaceProtocolBindingViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  linkId: z.string().min(1),
  linkName: z.string().optional(),
  typeId: z.string().min(1),
  protocolName: z.string().optional(),
  dataName: z.string().optional(),
  frequencyHz: z.number().nonnegative(),
  batchSize: z.number().int().positive(),
  peakMultiplier: z.number().positive(),
  payloadSize: z.number().int().nonnegative().optional(),
  estimatedBandwidthBps: z.number().nonnegative(),
  criticality: protocolBindingCriticalitySchema,
  notes: z.string().optional()
});

export const workspaceFlowViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  filter: z.string().optional(),
  source: z.enum(["manual", "derived", "ai"])
});

export const workspaceNetworkMapViewSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(workspaceNetworkNodeViewSchema),
  links: z.array(workspaceNetworkLinkViewSchema),
  bindings: z.array(workspaceProtocolBindingViewSchema),
  views: z.array(workspaceFlowViewSchema),
  updatedAt: z.string().datetime().optional()
});

export const workspaceFieldViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  canonicalType: z.string().min(1).optional(),
  bitField: z.boolean().optional(),
  initializer: z.string().optional(),
  note: z.string().optional(),
  location: workspaceViewLocationSchema.optional()
});

export const workspaceEnumValueViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  value: z.number().int().optional(),
  note: z.string().optional(),
  location: workspaceViewLocationSchema.optional()
});

export const workspaceFieldLayoutViewSchema = z.object({
  fieldId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  size: z.number().int().nonnegative().optional(),
  alignment: z.number().int().positive().optional(),
  paddingBefore: z.number().int().nonnegative(),
  paddingAfter: z.number().int().nonnegative(),
  supported: z.boolean(),
  reason: z.string().optional()
});

export const workspaceMemoryLayoutViewSchema = z.object({
  size: z.number().int().nonnegative().optional(),
  alignment: z.number().int().positive().optional(),
  dataSize: z.number().int().nonnegative(),
  paddingBytes: z.number().int().nonnegative(),
  partial: z.boolean(),
  pack: z.number().int().positive().optional(),
  source: z.literal("estimated"),
  fields: z.array(workspaceFieldLayoutViewSchema)
});

export const workspaceTypeViewSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["struct", "enum"]),
  name: z.string().min(1),
  qualifiedName: z.string().min(1),
  file: z.string().min(1),
  note: z.string().optional(),
  dataFlow: workspaceDataFlowMetadataSchema.optional(),
  pack: z.number().int().positive().optional(),
  underlyingType: z.string().optional(),
  location: workspaceViewLocationSchema.optional(),
  layout: workspaceMemoryLayoutViewSchema.optional(),
  fields: z.array(workspaceFieldViewSchema),
  values: z.array(workspaceEnumValueViewSchema)
});

export const workspaceFileViewSchema = z.object({
  path: z.string().min(1),
  relativePath: z.string().min(1),
  includes: z.array(z.string()),
  content: z.string(),
  contentHash: z.string().min(1)
});

export const workspaceDirectoryViewSchema = z.object({
  path: z.string().min(1),
  relativePath: z.string().min(1)
});

export const workspaceDiagnosticViewSchema = z.object({
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional()
});

export const workspaceViewSchema = z.object({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  metadataPath: z.string().optional(),
  directories: z.array(workspaceDirectoryViewSchema),
  files: z.array(workspaceFileViewSchema),
  types: z.array(workspaceTypeViewSchema),
  network: workspaceNetworkMapViewSchema,
  diagnostics: z.array(workspaceDiagnosticViewSchema),
  scanner: z.string().min(1),
  index: z.object({
    engine: z.enum(["sqlite", "memory"]),
    path: z.string().optional(),
    cacheHits: z.number().int().nonnegative(),
    parsedHeaders: z.number().int().nonnegative(),
    cachedHeaderCount: z.number().int().nonnegative(),
    activeIdentityCount: z.number().int().nonnegative()
  }).optional()
});

export const gitStatusEntrySchema = z.object({
  path: z.string().min(1),
  indexStatus: z.string(),
  workingTreeStatus: z.string()
});

export const gitWorkspaceStatusSchema = z.object({
  isRepository: z.boolean(),
  repositoryRoot: z.string().optional(),
  workspaceRelativePath: z.string().optional(),
  currentBranch: z.string().optional(),
  headCommit: z.string().optional(),
  headShortCommit: z.string().optional(),
  latestTag: z.string().optional(),
  isDirty: z.boolean(),
  hasConflicts: z.boolean(),
  entries: z.array(gitStatusEntrySchema),
  message: z.string().optional()
});

export const gitBranchInfoSchema = z.object({
  name: z.string().min(1),
  current: z.boolean(),
  commit: z.string().optional()
});

export const gitTagInfoSchema = z.object({
  name: z.string().min(1),
  commit: z.string().optional(),
  subject: z.string().optional(),
  createdAt: z.string().optional()
});

export const protocolBaselineSummarySchema = z.object({
  id: z.string().min(1),
  tagName: z.string().min(1),
  branch: z.string().optional(),
  commit: z.string().optional(),
  shortCommit: z.string().optional(),
  createdAt: z.string().datetime(),
  path: z.string().min(1),
  relativePath: z.string().min(1),
  typeCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  networkNodeCount: z.number().int().nonnegative(),
  networkLinkCount: z.number().int().nonnegative(),
  protocolBindingCount: z.number().int().nonnegative()
});

export const semanticDiffReportSchema = z.object({
  generatedAt: z.string().datetime(),
  baseBaseline: protocolBaselineSummarySchema.optional(),
  currentBaseline: protocolBaselineSummarySchema,
  baseRef: z.string().optional(),
  targetRef: z.string().min(1),
  changeCount: z.number().int().nonnegative(),
  breakingCount: z.number().int().nonnegative(),
  compatibleCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  changes: z.array(semanticChangeSchema)
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type ProtocolFile = z.infer<typeof protocolFileSchema>;
export type ProtocolStruct = z.infer<typeof structSchema>;
export type ProtocolEnum = z.infer<typeof enumSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type MemoryLayout = z.infer<typeof memoryLayoutSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type ProtocolSnapshot = z.infer<typeof protocolSnapshotSchema>;
export type SemanticChange = z.infer<typeof semanticChangeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export type WorkspaceViewContract = z.infer<typeof workspaceViewSchema>;
export type WorkspaceNetworkMapViewContract = z.infer<typeof workspaceNetworkMapViewSchema>;
export type GitWorkspaceStatusContract = z.infer<typeof gitWorkspaceStatusSchema>;
export type GitBranchInfoContract = z.infer<typeof gitBranchInfoSchema>;
export type GitTagInfoContract = z.infer<typeof gitTagInfoSchema>;
export type ProtocolBaselineSummaryContract = z.infer<typeof protocolBaselineSummarySchema>;
export type SemanticDiffReportContract = z.infer<typeof semanticDiffReportSchema>;
