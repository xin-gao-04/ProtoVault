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

export const semanticChangeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["added", "removed", "renamed", "type-changed", "layout-changed", "metadata-changed"]),
  targetId: z.string().min(1),
  compatibility: z.enum(["compatible", "possibly-breaking", "breaking"]),
  summary: z.string().min(1)
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
    "protocol/diff", "sync/status", "sync/resolve"
  ]),
  payload: z.unknown()
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
