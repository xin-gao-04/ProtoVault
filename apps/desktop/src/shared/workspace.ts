export interface WorkspaceFieldView {
  id: string;
  name: string;
  type: string;
  location?: { file: string; line: number; column: number };
}

export interface WorkspaceTypeView {
  id: string;
  kind: "struct" | "enum";
  name: string;
  qualifiedName: string;
  file: string;
  fields: WorkspaceFieldView[];
  values: Array<{ name: string; value?: number }>;
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
