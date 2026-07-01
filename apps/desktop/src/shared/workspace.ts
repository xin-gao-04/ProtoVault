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

export interface WorkspaceTypeView {
  id: string;
  kind: "struct" | "enum";
  name: string;
  qualifiedName: string;
  file: string;
  note?: string;
  fields: WorkspaceFieldView[];
  values: WorkspaceEnumValueView[];
}

export interface WorkspaceFileView {
  path: string;
  relativePath: string;
  includes: string[];
  content: string;
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
