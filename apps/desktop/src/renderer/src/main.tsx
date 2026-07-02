import React from "react";
import ReactDOM from "react-dom/client";
import type {
  GeneratedDocumentReport,
  ProtocolSnapshotSummary,
  SemanticDiffReport,
  WorkspaceEnumValueView,
  WorkspaceFieldView,
  WorkspaceFileView,
  WorkspaceLintReport,
  WorkspaceMemoryLayoutView,
  WorkspaceScanProgress,
  WorkspaceTypeView,
  WorkspaceView
} from "../../shared/workspace";
import "./styles.css";

type ProtocolTreeNode =
  | { id: string; kind: "folder"; name: string; children: ProtocolTreeNode[] }
  | { id: string; kind: "file"; name: string; file: WorkspaceFileView; children: ProtocolTreeNode[] }
  | { id: string; kind: "type"; name: string; type: WorkspaceTypeView; children: ProtocolTreeNode[] }
  | { id: string; kind: "field"; name: string; parent: WorkspaceTypeView; field?: WorkspaceFieldView; enumValue?: WorkspaceEnumValueView };

type WorkspaceAction = "create-header" | "create-struct" | "create-enum" | "edit-header" | "edit-struct" | "edit-enum" | "add-field" | "edit-field" | "add-enum-value" | "edit-enum-value";
type WorkspaceTab = { id: string; kind: "file"; title: string; filePath: string } | { id: string; kind: "type"; title: string; typeId: string };
type FieldTypeOption = { group: "composite" | "base"; value: string; label: string; detail?: string };
type DirtyStructuralEdit =
  | { kind: "field"; typeId: string; fieldId: string; fieldName: string; fieldType: string; savedFieldName: string; savedFieldType: string }
  | { kind: "enum-value"; typeId: string; valueId: string; valueName: string; valueNumber: string; savedValueName: string; savedValueNumber: string };
type DirtyDataFlowEdit = { producers: string[]; consumers: string[] };
type CenterViewMode = "workspace" | "graph";
type WorkspaceReportState =
  | { kind: "lint"; report: WorkspaceLintReport }
  | { kind: "document"; report: GeneratedDocumentReport }
  | { kind: "snapshot"; report: ProtocolSnapshotSummary }
  | { kind: "diff"; report: SemanticDiffReport };
type ContextMenuState = {
  x: number;
  y: number;
  target:
    | { kind: "workspace" }
    | { kind: "file"; file: WorkspaceFileView }
    | { kind: "type"; type: WorkspaceTypeView }
    | { kind: "field"; type: WorkspaceTypeView; field: WorkspaceFieldView }
    | { kind: "enum-value"; type: WorkspaceTypeView; value: WorkspaceEnumValueView };
};
type ProtocolGraphNode =
  | { id: string; kind: "file"; label: string; file: WorkspaceFileView; x: number; y: number; z: number; metrics: GraphNodeMetrics }
  | { id: string; kind: "struct" | "enum"; label: string; type: WorkspaceTypeView; x: number; y: number; z: number; metrics: GraphNodeMetrics }
  | { id: string; kind: "producer" | "consumer"; label: string; x: number; y: number; z: number; metrics: GraphNodeMetrics };
type ProtocolGraphMode = "dependency" | "data-flow";
type ProtocolGraphEdge = { id: string; from: string; to: string; label: string; kind: "contains" | "references" | "flow" };
type GraphSimNode = ProtocolGraphNode & { vx: number; vy: number; vz: number; radius: number; screenX: number; screenY: number; screenRadius: number };
type GraphSimEdge = ProtocolGraphEdge & { source: GraphSimNode; target: GraphSimNode };
type GraphRiskLevel = "normal" | "warning" | "critical";
type GraphNodeMetrics = {
  inboundReferences: number;
  outboundReferences: number;
  impactScore: number;
  diagnosticCount: number;
  metadataMissingCount: number;
  layoutRisk: GraphRiskLevel;
  layoutRiskLabel: string;
  paddingRatio: number;
};

const SUPPORTED_BASE_FIELD_TYPES = [
  "std::int8_t",
  "std::uint8_t",
  "std::int16_t",
  "std::uint16_t",
  "std::int32_t",
  "std::uint32_t",
  "std::int64_t",
  "std::uint64_t",
  "float",
  "double",
  "bool",
  "char",
  "std::byte"
];

function App(): React.JSX.Element {
  const [health, setHealth] = React.useState("正在连接本地协议服务…");
  const [workspace, setWorkspace] = React.useState<WorkspaceView | null>(null);
  const [selectedTypeId, setSelectedTypeId] = React.useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<Set<string>>(new Set());
  const [treeSearchOpen, setTreeSearchOpen] = React.useState(false);
  const [treeSearchQuery, setTreeSearchQuery] = React.useState("");
  const [navigatorWidth, setNavigatorWidth] = React.useState(340);
  const [inspectorWidth, setInspectorWidth] = React.useState(260);
  const [uiNotice, setUiNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState<WorkspaceScanProgress | null>(null);
  const [activeAction, setActiveAction] = React.useState<WorkspaceAction | null>(null);
  const [headerRelativePath, setHeaderRelativePath] = React.useState("");
  const [structName, setStructName] = React.useState("NewProtocol");
  const [structHeaderPath, setStructHeaderPath] = React.useState("");
  const [enumName, setEnumName] = React.useState("NewEnum");
  const [enumHeaderPath, setEnumHeaderPath] = React.useState("");
  const [headerEditRelativePath, setHeaderEditRelativePath] = React.useState("");
  const [headerIncludePaths, setHeaderIncludePaths] = React.useState<string[]>([]);
  const [structEditName, setStructEditName] = React.useState("");
  const [enumEditName, setEnumEditName] = React.useState("");
  const [fieldType, setFieldType] = React.useState("std::uint32_t");
  const [fieldName, setFieldName] = React.useState("value");
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [enumValueName, setEnumValueName] = React.useState("Unknown");
  const [enumValueNumber, setEnumValueNumber] = React.useState("0");
  const [editingEnumValueId, setEditingEnumValueId] = React.useState<string | null>(null);
  const [dirtyNotes, setDirtyNotes] = React.useState<Record<string, string>>({});
  const [dirtyStructuralEdits, setDirtyStructuralEdits] = React.useState<Record<string, DirtyStructuralEdit>>({});
  const [dirtyDataFlows, setDirtyDataFlows] = React.useState<Record<string, DirtyDataFlowEdit>>({});
  const [sourceDrafts, setSourceDrafts] = React.useState<Record<string, string>>({});
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([]);
  const [previewTab, setPreviewTab] = React.useState<WorkspaceTab | null>(null);
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [workspaceReport, setWorkspaceReport] = React.useState<WorkspaceReportState | null>(null);
  const [centerViewMode, setCenterViewMode] = React.useState<CenterViewMode>("workspace");
  const selectedType = workspace?.types.find((type) => type.id === selectedTypeId);
  const selectedFile = workspace?.files.find((file) => file.path === selectedFilePath);
  const selectedField = selectedType?.fields.find((field) => field.id === selectedMemberId);
  const selectedEnumValue = selectedType?.values.find((value) => value.id === selectedMemberId);
  const selectedNoteTarget = selectedField
    ? { id: selectedField.id, label: `字段 ${selectedType?.name}.${selectedField.name}`, note: selectedField.note ?? "" }
    : selectedEnumValue
      ? { id: selectedEnumValue.id, label: `枚举项 ${selectedType?.name}.${selectedEnumValue.name}`, note: selectedEnumValue.note ?? "" }
      : selectedType
        ? { id: selectedType.id, label: `${selectedType.kind === "struct" ? "Struct" : "Enum"} ${selectedType.qualifiedName}`, note: selectedType.note ?? "" }
        : null;
  const dirtyTabIds = React.useMemo(
    () => workspace ? buildDirtyTabIds(workspace, dirtyNotes, dirtyStructuralEdits, dirtyDataFlows, sourceDrafts) : new Set<string>(),
    [workspace, dirtyNotes, dirtyStructuralEdits, dirtyDataFlows, sourceDrafts]
  );
  const selectedFieldTypeOptions = React.useMemo(
    () => workspace && selectedType ? buildFieldTypeOptions(workspace, selectedType) : buildBaseFieldTypeOptions(),
    [workspace, selectedType]
  );
  const selectedLayout = selectedType?.layout ?? null;
  const rawTree = React.useMemo(() => workspace ? buildProtocolTree(workspace) : [], [workspace]);
  const graphContext = React.useMemo(() => workspace ? buildProtocolGraph(workspace, "dependency") : null, [workspace]);
  const selectedGraphNode = React.useMemo(() => {
    if (!graphContext) return null;
    const selectedId = selectedTypeId ? `type:${selectedTypeId}` : selectedFilePath ? `file:${selectedFilePath}` : null;
    return selectedId ? graphContext.nodes.find((node) => node.id === selectedId) ?? null : null;
  }, [graphContext, selectedFilePath, selectedTypeId]);
  const treeSearchResult = React.useMemo(() => filterProtocolTree(rawTree, treeSearchQuery), [rawTree, treeSearchQuery]);
  const tree = treeSearchResult.nodes;
  const effectiveExpandedNodeIds = React.useMemo(() => {
    if (!treeSearchQuery.trim()) return expandedNodeIds;
    return new Set([...expandedNodeIds, ...treeSearchResult.expandedNodeIds]);
  }, [expandedNodeIds, treeSearchQuery, treeSearchResult.expandedNodeIds]);

  const applyWorkspaceResult = React.useCallback((result: WorkspaceView, options?: {
    selectFileRelativePath?: string;
    selectTypeName?: string;
    selectFieldName?: string;
  }): void => {
    const nextTree = buildProtocolTree(result);
    const nextType = options?.selectTypeName
      ? result.types.find((type) => type.name === options.selectTypeName)
      : result.types[0];
    const nextFile = options?.selectFileRelativePath
      ? result.files.find((file) => file.relativePath === options.selectFileRelativePath)
      : undefined;
    const nextMemberId = options?.selectFieldName && nextType
      ? nextType.fields.find((field) => field.name === options.selectFieldName)?.id ?? null
      : null;

    setWorkspace(result);
    setSourceDrafts((current) => {
      const filesByPath = new Map(result.files.map((file) => [file.path, file]));
      return Object.fromEntries(Object.entries(current).filter(([path, draft]) => {
        const file = filesByPath.get(path);
        return file && draft !== file.content;
      }));
    });
    setSelectedTypeId(nextFile ? null : nextType?.id ?? null);
    setSelectedFilePath(nextFile?.path ?? null);
    setSelectedMemberId(nextMemberId);
    setExpandedNodeIds(initialExpandedNodeIds(nextTree, nextType?.id ?? null));
    const nextActiveTab = nextFile ? tabForFile(nextFile) : nextType ? tabForType(nextType) : null;
    setTabs((current) => reconcileTabs(current, result));
    setPreviewTab(nextActiveTab);
    setActiveTabId(nextActiveTab?.id ?? null);
  }, []);

  React.useEffect(() => {
    window.protoVault.health()
      .then((result) => setHealth(`服务就绪 · Contract ${result.contractVersion}`))
      .catch(() => setHealth("本地协议服务不可用"));
  }, []);

  React.useEffect(() => window.protoVault.onScanProgress((progress) => {
    setScanProgress(progress);
  }), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScanProgress({ phase: "discover", message: "正在尝试恢复上次工作区…", current: 0, total: 1 });
    window.protoVault.restoreLastWorkspace()
      .then((result) => {
        if (cancelled || !result) return;
        applyWorkspaceResult(result);
        setUiNotice(`已恢复上次工作区：${result.name}`);
      })
      .catch(() => {
        if (!cancelled) setUiNotice("上次工作区不可用，请重新打开目录");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyWorkspaceResult]);

  React.useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [uiNotice]);

  React.useEffect(() => {
    function closeMenu(): void {
      setContextMenu(null);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveChanges();
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        triggerEditSelected();
      }
      if (event.key === "Escape") closeMenu();
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  async function openWorkspace(sample: boolean): Promise<void> {
    setLoading(true);
    setScanProgress({ phase: "discover", message: sample ? "正在加载示例工作区…" : "正在打开本地工作区…", current: 0, total: 1 });
    try {
      const result = sample ? await window.protoVault.openSampleWorkspace() : await window.protoVault.openWorkspace();
      if (result) {
        applyWorkspaceResult(result);
        setUiNotice(result.metadataPath ? "目录记录已更新：.protocol/workspace.json" : "工作区已扫描");
      }
    } finally {
      setLoading(false);
    }
  }

  async function runWorkspaceAction(action: () => Promise<void>): Promise<boolean> {
    setLoading(true);
    try {
      await action();
      return true;
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setLoading(false);
    }
  }

  function openStructuredAction(action: WorkspaceAction): void {
    if (!workspace) return;
    if (action === "create-header") {
      setHeaderRelativePath(`headers/new_protocol_${workspace.files.length + 1}.hpp`);
    }
    if (action === "create-struct") {
      setStructName("NewProtocol");
      setStructHeaderPath(selectedFilePath ?? selectedType?.file ?? workspace.files[0]?.path ?? "");
    }
    if (action === "create-enum") {
      setEnumName("NewEnum");
      setEnumHeaderPath(selectedFilePath ?? selectedType?.file ?? workspace.files[0]?.path ?? "");
    }
    if (action === "edit-header") {
      const file = selectedFile ?? workspace.files.find((item) => item.path === selectedType?.file) ?? workspace.files[0];
      if (!file) return;
      setSelectedFilePath(file.path);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
      setHeaderEditRelativePath(file.relativePath);
      setHeaderIncludePaths(internalIncludeRelativePaths(workspace, file));
    }
    if (action === "edit-struct") {
      if (!selectedType || selectedType.kind !== "struct") return;
      setStructEditName(selectedType.name);
    }
    if (action === "edit-enum") {
      if (!selectedType || selectedType.kind !== "enum") return;
      setEnumEditName(selectedType.name);
    }
    if (action === "add-field") {
      setFieldType("std::uint32_t");
      setFieldName("value");
    }
    if (action === "add-enum-value") {
      setEnumValueName("Unknown");
      setEnumValueNumber(selectedType?.kind === "enum" ? nextEnumValueNumber(selectedType) : "0");
      setEditingEnumValueId(null);
    }
    setActiveAction(action);
  }

  function triggerEditSelected(): void {
    if (selectedMemberId && selectedType?.kind === "struct") {
      const field = selectedType.fields.find((item) => item.id === selectedMemberId);
      if (field) {
        openEditFieldAction(selectedType, field);
        return;
      }
    }
    if (selectedMemberId && selectedType?.kind === "enum") {
      const value = selectedType.values.find((item) => item.id === selectedMemberId);
      if (value) {
        openEditEnumValueAction(selectedType, value);
        return;
      }
    }
    if (selectedType?.kind === "struct") {
      openStructuredAction("edit-struct");
      return;
    }
    if (selectedType?.kind === "enum") {
      openStructuredAction("edit-enum");
      return;
    }
    if (selectedFile) {
      openStructuredAction("edit-header");
      return;
    }
    setUiNotice("当前选中项暂不支持 F2 编辑");
  }

  function openContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  }

  function runContextAction(action: () => void): void {
    setContextMenu(null);
    action();
  }

  function scrollTreeNodeIntoView(nodeId: string): void {
    window.setTimeout(() => {
      const escaped = CSS.escape(nodeId);
      document.querySelector(`[data-tree-node-id="${escaped}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
    }, 0);
  }

  function locateMemberInTree(type: WorkspaceTypeView, memberId: string): void {
    const path = findTreePath(rawTree, memberId);
    setExpandedNodeIds((current) => new Set([...current, ...path, `type:${type.id}`]));
    setSelectedTypeId(type.id);
    setSelectedFilePath(null);
    setSelectedMemberId(memberId);
    scrollTreeNodeIntoView(memberId);
  }

  function locateFileInTree(file: WorkspaceFileView): void {
    const nodeId = `file:${file.path}`;
    const path = findTreePath(rawTree, nodeId);
    setExpandedNodeIds((current) => new Set([...current, ...path]));
    setSelectedFilePath(file.path);
    setSelectedTypeId(null);
    setSelectedMemberId(null);
    scrollTreeNodeIntoView(nodeId);
  }

  function locateTypeInTree(type: WorkspaceTypeView): void {
    const nodeId = `type:${type.id}`;
    const path = findTreePath(rawTree, nodeId);
    setExpandedNodeIds((current) => new Set([...current, ...path]));
    setSelectedTypeId(type.id);
    setSelectedFilePath(null);
    setSelectedMemberId(null);
    scrollTreeNodeIntoView(nodeId);
  }

  function selectGraphNode(node: ProtocolGraphNode): void {
    if (node.kind === "file") locateFileInTree(node.file);
    else if (node.kind === "struct" || node.kind === "enum") locateTypeInTree(node.type);
    else setUiNotice(`${node.kind === "producer" ? "生产节点" : "消费节点"}：${node.label}`);
  }

  async function openGraphNode(node: ProtocolGraphNode): Promise<void> {
    if (node.kind === "file") {
      if (await openFileTab(node.file)) setCenterViewMode("workspace");
    } else if (node.kind === "struct" || node.kind === "enum") {
      if (await openTypeTab(node.type)) setCenterViewMode("workspace");
    } else {
      setCenterViewMode("graph");
    }
  }

  async function deleteFieldWithConfirm(type: WorkspaceTypeView, field: WorkspaceFieldView): Promise<void> {
    if (!window.confirm(`确认删除字段？\n${type.name}.${field.name}`)) return;
    await deleteFieldInline(type, field);
  }

  async function deleteEnumValueWithConfirm(type: WorkspaceTypeView, value: WorkspaceEnumValueView): Promise<void> {
    if (!window.confirm(`确认删除枚举项？\n${type.name}.${value.name}`)) return;
    await deleteEnumValueInline(type, value);
  }

  function editFile(file: WorkspaceFileView): void {
    openFileTab(file);
    setHeaderEditRelativePath(file.relativePath);
    if (workspace) setHeaderIncludePaths(internalIncludeRelativePaths(workspace, file));
    setActiveAction("edit-header");
  }

  function editType(type: WorkspaceTypeView): void {
    openTypeTab(type);
    if (type.kind === "struct") {
      setStructEditName(type.name);
      setActiveAction("edit-struct");
    } else {
      setEnumEditName(type.name);
      setActiveAction("edit-enum");
    }
  }

  function syncActionForFileSelection(file: WorkspaceFileView): void {
    if (!activeAction) return;
    if (activeAction === "create-header") return;
    if (activeAction === "create-struct") {
      setStructHeaderPath(file.path);
      return;
    }
    if (activeAction === "create-enum") {
      setEnumHeaderPath(file.path);
      return;
    }
    setHeaderEditRelativePath(file.relativePath);
    if (workspace) setHeaderIncludePaths(internalIncludeRelativePaths(workspace, file));
    setEditingFieldId(null);
    setEditingEnumValueId(null);
    setActiveAction("edit-header");
  }

  function syncActionForTypeSelection(type: WorkspaceTypeView, memberId: string | null): void {
    if (!activeAction) return;
    if (activeAction === "create-header") return;
    if (activeAction === "create-struct") {
      setStructHeaderPath(type.file);
      return;
    }
    if (activeAction === "create-enum") {
      setEnumHeaderPath(type.file);
      return;
    }
    if (type.kind === "enum") {
      const value = memberId ? type.values.find((item) => item.id === memberId) : undefined;
      setEditingFieldId(null);
      if (value) {
        setEnumValueName(value.name);
        setEnumValueNumber(value.value === undefined ? "" : String(value.value));
        setEditingEnumValueId(value.id);
        setActiveAction("edit-enum-value");
        return;
      }
      if (activeAction === "add-enum-value") {
        setEnumValueName("Unknown");
        setEnumValueNumber(nextEnumValueNumber(type));
        setEditingEnumValueId(null);
        return;
      }
      setEnumEditName(type.name);
      setEditingEnumValueId(null);
      setActiveAction("edit-enum");
      return;
    }
    const field = memberId ? type.fields.find((item) => item.id === memberId) : undefined;
    if (field) {
      setFieldType(field.type);
      setFieldName(field.name);
      setEditingFieldId(field.id);
      setActiveAction("edit-field");
      return;
    }
    if (activeAction === "add-field") {
      setFieldType("std::uint32_t");
      setFieldName("value");
      setEditingFieldId(null);
      return;
    }
    setStructEditName(type.name);
    setEditingFieldId(null);
    setEditingEnumValueId(null);
    setActiveAction("edit-struct");
  }

  async function createHeaderFromForm(): Promise<void> {
    if (!workspace) return;
    const relativePath = headerRelativePath.trim();
    if (!relativePath) {
      setUiNotice("Header 相对路径不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.createHeader({ workspaceRoot: workspace.rootPath, relativePath });
      applyWorkspaceResult(result, { selectFileRelativePath: relativePath.replaceAll("\\", "/").replace(/^\/+/, "") });
      setUiNotice(`已创建 Header：${relativePath}`);
      setActiveAction(null);
    });
  }

  async function createStructFromForm(): Promise<void> {
    if (!workspace) return;
    const headerPath = structHeaderPath || selectedFilePath || selectedType?.file || workspace.files[0]?.path;
    if (!headerPath) {
      setUiNotice("当前工作区还没有 Header，请先新建 Header 文件");
      return;
    }
    const nextStructName = structName.trim();
    if (!nextStructName) {
      setUiNotice("结构体名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.createStruct({ workspaceRoot: workspace.rootPath, headerPath, structName: nextStructName });
      applyWorkspaceResult(result, { selectTypeName: nextStructName });
      setUiNotice(`已创建数据结构：${nextStructName}`);
      setActiveAction(null);
    });
  }

  async function createEnumFromForm(): Promise<void> {
    if (!workspace) return;
    const headerPath = enumHeaderPath || selectedFilePath || selectedType?.file || workspace.files[0]?.path;
    if (!headerPath) {
      setUiNotice("当前工作区还没有 Header，请先新建 Header 文件");
      return;
    }
    const nextEnumName = enumName.trim();
    if (!nextEnumName) {
      setUiNotice("枚举名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.createEnum({ workspaceRoot: workspace.rootPath, headerPath, enumName: nextEnumName });
      applyWorkspaceResult(result, { selectTypeName: nextEnumName });
      setUiNotice(`已创建枚举：${nextEnumName}`);
      setActiveAction(null);
    });
  }

  async function renameHeaderFromForm(): Promise<void> {
    if (!workspace || !selectedFile) return;
    const newRelativePath = headerEditRelativePath.trim();
    if (!newRelativePath) {
      setUiNotice("Header 相对路径不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.renameHeader({ workspaceRoot: workspace.rootPath, headerPath: selectedFile.path, newRelativePath });
      applyWorkspaceResult(result, { selectFileRelativePath: newRelativePath.replaceAll("\\", "/").replace(/^\/+/, "") });
      setUiNotice(`已重命名 Header：${newRelativePath}`);
      setActiveAction(null);
    });
  }

  async function deleteHeaderFromForm(): Promise<void> {
    if (!workspace || !selectedFile) return;
    if (!window.confirm(`确认删除 Header？\n${selectedFile.relativePath}`)) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteHeader({ workspaceRoot: workspace.rootPath, headerPath: selectedFile.path });
      applyWorkspaceResult(result);
      setUiNotice(`已删除 Header：${selectedFile.relativePath}`);
      setActiveAction(null);
    });
  }

  async function updateHeaderIncludesFromForm(): Promise<void> {
    if (!workspace || !selectedFile) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.updateHeaderIncludes({
        workspaceRoot: workspace.rootPath,
        headerPath: selectedFile.path,
        includeRelativePaths: headerIncludePaths
      });
      applyWorkspaceResult(result, { selectFileRelativePath: selectedFile.relativePath });
      const nextFile = result.files.find((file) => file.relativePath === selectedFile.relativePath);
      if (nextFile) setHeaderIncludePaths(internalIncludeRelativePaths(result, nextFile));
      setUiNotice("Header 依赖已更新");
    });
  }

  async function saveHeaderContent(file: WorkspaceFileView, content: string): Promise<boolean> {
    if (!workspace) return false;
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateHeaderContent({
        workspaceRoot: workspace.rootPath,
        headerPath: file.path,
        content,
        expectedHash: file.contentHash
      });
      applyWorkspaceResult(result, { selectFileRelativePath: file.relativePath });
      setSourceDrafts((current) => {
        const next = { ...current };
        delete next[file.path];
        return next;
      });
      setUiNotice(result.diagnostics.length > 0
        ? "Header 已保存，但仍存在解析问题；可继续在源码区修复"
        : "Header 源码已保存并重新扫描");
    });
  }

  function updateSourceDraft(file: WorkspaceFileView, content: string): void {
    setSourceDrafts((current) => {
      const next = { ...current };
      if (content === file.content) delete next[file.path];
      else next[file.path] = content;
      return next;
    });
  }

  async function runLintReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const report = await window.protoVault.lint(workspace.rootPath);
      setWorkspaceReport({ kind: "lint", report });
      setUiNotice(`Lint 完成：${report.issueCount} 个问题`);
    });
  }

  async function generateDocumentReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const report = await window.protoVault.generateDocument({ workspaceRoot: workspace.rootPath });
      setWorkspaceReport({ kind: "document", report });
      setUiNotice(`协议文档已生成：${report.relativePath}`);
    });
  }

  async function createSnapshotReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const report = await window.protoVault.createSnapshot({ workspaceRoot: workspace.rootPath, label: "manual" });
      setWorkspaceReport({ kind: "snapshot", report });
      setUiNotice(`协议快照已创建：${report.relativePath}`);
    });
  }

  async function diffSnapshotReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const report = await window.protoVault.diff({ workspaceRoot: workspace.rootPath });
      setWorkspaceReport({ kind: "diff", report });
      setUiNotice(report.baseSnapshot
        ? `语义 Diff 完成：${report.changeCount} 个变化`
        : "已创建首个当前快照；暂无历史快照可对比");
    });
  }

  async function renameStructFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct") return;
    const nextName = structEditName.trim();
    if (!nextName) {
      setUiNotice("结构体名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.renameStruct({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, structName: nextName });
      applyWorkspaceResult(result, { selectTypeName: nextName });
      setUiNotice(`已重命名数据结构：${nextName}`);
      setActiveAction(null);
    });
  }

  async function deleteStructFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct") return;
    if (!window.confirm(`确认删除 struct？\n${selectedType.qualifiedName}`)) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteStruct({ workspaceRoot: workspace.rootPath, typeId: selectedType.id });
      applyWorkspaceResult(result);
      setUiNotice(`已删除数据结构：${selectedType.name}`);
      setActiveAction(null);
    });
  }

  async function renameEnumFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "enum") return;
    const nextName = enumEditName.trim();
    if (!nextName) {
      setUiNotice("枚举名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.renameEnum({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, enumName: nextName });
      applyWorkspaceResult(result, { selectTypeName: nextName });
      setUiNotice(`已重命名枚举：${nextName}`);
      setActiveAction(null);
    });
  }

  async function deleteEnumFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "enum") return;
    if (!window.confirm(`确认删除 enum？\n${selectedType.qualifiedName}`)) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteEnum({ workspaceRoot: workspace.rootPath, typeId: selectedType.id });
      applyWorkspaceResult(result);
      setUiNotice(`已删除枚举：${selectedType.name}`);
      setActiveAction(null);
    });
  }

  async function deleteTypeWithConfirm(type: WorkspaceTypeView): Promise<void> {
    if (!workspace) return;
    const label = type.kind === "struct" ? "struct" : "enum";
    if (!window.confirm(`确认删除 ${label}？\n${type.qualifiedName}`)) return;
    await runWorkspaceAction(async () => {
      const result = type.kind === "struct"
        ? await window.protoVault.deleteStruct({ workspaceRoot: workspace.rootPath, typeId: type.id })
        : await window.protoVault.deleteEnum({ workspaceRoot: workspace.rootPath, typeId: type.id });
      applyWorkspaceResult(result);
      setUiNotice(type.kind === "struct" ? `已删除数据结构：${type.name}` : `已删除枚举：${type.name}`);
      setActiveAction(null);
    });
  }

  async function addFieldFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct") return;
    const nextFieldType = fieldType.trim();
    const nextFieldName = fieldName.trim();
    if (!nextFieldType || !nextFieldName) {
      setUiNotice("字段类型和字段名称不能为空");
      return;
    }
    const typeError = validateFieldTypeValue(nextFieldType, selectedFieldTypeOptions);
    if (typeError) {
      setUiNotice(typeError);
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldType: nextFieldType, fieldName: nextFieldName });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已添加字段：${nextFieldName}`);
      setActiveAction(null);
    });
  }

  async function addFieldInline(type: WorkspaceTypeView, nextFieldType: string, nextFieldName: string): Promise<boolean> {
    if (!workspace || type.kind !== "struct") return false;
    const trimmedType = nextFieldType.trim();
    const trimmedName = nextFieldName.trim();
    if (!trimmedType || !trimmedName) {
      setUiNotice("字段类型和字段名称不能为空");
      return false;
    }
    const typeError = validateFieldTypeValue(trimmedType, buildFieldTypeOptions(workspace, type));
    if (typeError) {
      setUiNotice(typeError);
      return false;
    }
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: type.id, fieldType: trimmedType, fieldName: trimmedName });
      applyWorkspaceResult(result, { selectTypeName: type.name, selectFieldName: trimmedName });
      setUiNotice(`已添加字段：${trimmedName}`);
    });
  }

  async function updateFieldFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct" || !editingFieldId) return;
    const nextFieldType = fieldType.trim();
    const nextFieldName = fieldName.trim();
    if (!nextFieldType || !nextFieldName) {
      setUiNotice("字段类型和字段名称不能为空");
      return;
    }
    const typeError = validateFieldTypeValue(nextFieldType, selectedFieldTypeOptions);
    if (typeError) {
      setUiNotice(typeError);
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.updateField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldId: editingFieldId, fieldType: nextFieldType, fieldName: nextFieldName });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已更新字段：${nextFieldName}`);
      setActiveAction(null);
      setEditingFieldId(null);
    });
  }

  async function updateFieldInline(type: WorkspaceTypeView, field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string): Promise<boolean> {
    if (!workspace || type.kind !== "struct") return false;
    const trimmedType = nextFieldType.trim();
    const trimmedName = nextFieldName.trim();
    if (!trimmedType || !trimmedName) {
      setUiNotice("字段类型和字段名称不能为空");
      return false;
    }
    const typeError = validateFieldTypeValue(trimmedType, buildFieldTypeOptions(workspace, type));
    if (typeError) {
      setUiNotice(typeError);
      return false;
    }
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateField({ workspaceRoot: workspace.rootPath, typeId: type.id, fieldId: field.id, fieldType: trimmedType, fieldName: trimmedName });
      applyWorkspaceResult(result, { selectTypeName: type.name, selectFieldName: trimmedName });
      setUiNotice(`已更新字段：${trimmedName}`);
    });
  }

  function updateFieldDraft(type: WorkspaceTypeView, field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string): void {
    setDirtyStructuralEdits((current) => {
      const next = { ...current };
      if (nextFieldType === field.type && nextFieldName === field.name) delete next[field.id];
      else next[field.id] = {
        kind: "field",
        typeId: type.id,
        fieldId: field.id,
        fieldName: nextFieldName,
        fieldType: nextFieldType,
        savedFieldName: field.name,
        savedFieldType: field.type
      };
      return next;
    });
  }

  async function deleteFieldFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct" || !editingFieldId) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldId: editingFieldId });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name });
      setUiNotice("字段已删除");
      setActiveAction(null);
      setEditingFieldId(null);
    });
  }

  async function deleteFieldInline(type: WorkspaceTypeView, field: WorkspaceFieldView): Promise<boolean> {
    if (!workspace || type.kind !== "struct") return false;
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteField({ workspaceRoot: workspace.rootPath, typeId: type.id, fieldId: field.id });
      applyWorkspaceResult(result, { selectTypeName: type.name });
      setUiNotice(`已删除字段：${field.name}`);
    });
  }

  function parseOptionalEnumNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) throw new Error("枚举值必须是整数，或留空使用自动编号");
    return parsed;
  }

  function nextEnumValueNumber(type: WorkspaceTypeView): string {
    const values = type.values
      .map((value) => value.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return String(values.length === 0 ? 0 : Math.max(...values) + 1);
  }

  async function addEnumValueFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "enum") return;
    const nextValueName = enumValueName.trim();
    if (!nextValueName) {
      setUiNotice("枚举项名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.addEnumValue({
        workspaceRoot: workspace.rootPath,
        typeId: selectedType.id,
        valueName: nextValueName,
        value: parseOptionalEnumNumber(enumValueNumber)
      });
      setWorkspace(result);
      const nextType = result.types.find((type) => type.name === selectedType.name);
      const nextValue = nextType?.values.find((value) => value.name === nextValueName);
      setSelectedTypeId(nextType?.id ?? selectedType.id);
      setSelectedMemberId(nextValue?.id ?? null);
      setUiNotice(`已添加枚举项：${nextValueName}`);
      setActiveAction(null);
    });
  }

  async function addEnumValueInline(type: WorkspaceTypeView, nextValueName: string, nextValueNumber: string): Promise<boolean> {
    if (!workspace || type.kind !== "enum") return false;
    const trimmedName = nextValueName.trim();
    if (!trimmedName) {
      setUiNotice("枚举项名称不能为空");
      return false;
    }
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.addEnumValue({
        workspaceRoot: workspace.rootPath,
        typeId: type.id,
        valueName: trimmedName,
        value: parseOptionalEnumNumber(nextValueNumber)
      });
      setWorkspace(result);
      const nextType = result.types.find((item) => item.name === type.name);
      const nextValue = nextType?.values.find((value) => value.name === trimmedName);
      setSelectedTypeId(nextType?.id ?? type.id);
      setSelectedFilePath(null);
      setSelectedMemberId(nextValue?.id ?? null);
      setUiNotice(`已添加枚举项：${trimmedName}`);
    });
  }

  async function updateEnumValueFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "enum" || !editingEnumValueId) return;
    const nextValueName = enumValueName.trim();
    if (!nextValueName) {
      setUiNotice("枚举项名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.updateEnumValue({
        workspaceRoot: workspace.rootPath,
        typeId: selectedType.id,
        valueId: editingEnumValueId,
        valueName: nextValueName,
        value: parseOptionalEnumNumber(enumValueNumber)
      });
      setWorkspace(result);
      const nextType = result.types.find((type) => type.name === selectedType.name);
      const nextValue = nextType?.values.find((value) => value.name === nextValueName);
      setSelectedTypeId(nextType?.id ?? selectedType.id);
      setSelectedMemberId(nextValue?.id ?? null);
      setUiNotice(`已更新枚举项：${nextValueName}`);
      setActiveAction(null);
      setEditingEnumValueId(null);
    });
  }

  async function updateEnumValueInline(type: WorkspaceTypeView, value: WorkspaceEnumValueView, nextValueName: string, nextValueNumber: string): Promise<boolean> {
    if (!workspace || type.kind !== "enum") return false;
    const trimmedName = nextValueName.trim();
    if (!trimmedName) {
      setUiNotice("枚举项名称不能为空");
      return false;
    }
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateEnumValue({
        workspaceRoot: workspace.rootPath,
        typeId: type.id,
        valueId: value.id,
        valueName: trimmedName,
        value: parseOptionalEnumNumber(nextValueNumber)
      });
      setWorkspace(result);
      const nextType = result.types.find((item) => item.name === type.name);
      const nextValue = nextType?.values.find((item) => item.name === trimmedName);
      setSelectedTypeId(nextType?.id ?? type.id);
      setSelectedFilePath(null);
      setSelectedMemberId(nextValue?.id ?? null);
      setUiNotice(`已更新枚举项：${trimmedName}`);
    });
  }

  function updateEnumValueDraft(type: WorkspaceTypeView, value: WorkspaceEnumValueView, nextValueName: string, nextValueNumber: string): void {
    const savedNumber = value.value === undefined ? "" : String(value.value);
    setDirtyStructuralEdits((current) => {
      const next = { ...current };
      if (nextValueName === value.name && nextValueNumber === savedNumber) delete next[value.id];
      else next[value.id] = {
        kind: "enum-value",
        typeId: type.id,
        valueId: value.id,
        valueName: nextValueName,
        valueNumber: nextValueNumber,
        savedValueName: value.name,
        savedValueNumber: savedNumber
      };
      return next;
    });
  }

  async function deleteEnumValueFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "enum" || !editingEnumValueId) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteEnumValue({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, valueId: editingEnumValueId });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name });
      setUiNotice("枚举项已删除");
      setActiveAction(null);
      setEditingEnumValueId(null);
    });
  }

  async function deleteEnumValueInline(type: WorkspaceTypeView, value: WorkspaceEnumValueView): Promise<boolean> {
    if (!workspace || type.kind !== "enum") return false;
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.deleteEnumValue({ workspaceRoot: workspace.rootPath, typeId: type.id, valueId: value.id });
      applyWorkspaceResult(result, { selectTypeName: type.name });
      setUiNotice(`已删除枚举项：${value.name}`);
    });
  }

  function updateNoteDraft(targetId: string, value: string, savedValue: string): void {
    setDirtyNotes((current) => {
      const next = { ...current };
      if (value === savedValue) delete next[targetId];
      else next[targetId] = value;
      return next;
    });
  }

  function updateDataFlowDraft(type: WorkspaceTypeView, producers: string[], consumers: string[]): void {
    const savedProducers = type.dataFlow?.producers ?? [];
    const savedConsumers = type.dataFlow?.consumers ?? [];
    setDirtyDataFlows((current) => {
      const next = { ...current };
      if (stringArrayEquals(producers, savedProducers) && stringArrayEquals(consumers, savedConsumers)) delete next[type.id];
      else next[type.id] = { producers, consumers };
      return next;
    });
  }

  async function saveNote(): Promise<void> {
    if (!workspace || !selectedNoteTarget) return;
    await saveNoteTarget(selectedNoteTarget.id);
  }

  async function saveNoteTarget(targetId: string): Promise<boolean> {
    if (!workspace) return false;
    if (dirtyNotes[targetId] === undefined) {
      setUiNotice("没有需要保存的注释改动");
      return false;
    }
    const noteToSave = dirtyNotes[targetId];
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateNote({ workspaceRoot: workspace.rootPath, targetId, note: noteToSave });
      setWorkspace(result);
      setDirtyNotes((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      setUiNotice("注释已同步到 Header 和 .protocol/meta/metadata.json");
    });
  }

  async function updateDataFlowForType(type: WorkspaceTypeView, producers: string[], consumers: string[]): Promise<boolean> {
    if (!workspace) return false;
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateDataFlow({ workspaceRoot: workspace.rootPath, typeId: type.id, producers, consumers });
      setWorkspace(result);
      setDirtyDataFlows((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      setUiNotice("数据流标签已保存到 .protocol/meta/metadata.json");
    });
  }

  async function saveStructuralEdit(targetId: string): Promise<boolean> {
    const edit = dirtyStructuralEdits[targetId];
    if (!workspace || !edit) return false;
    if (edit.kind === "field") {
      const type = workspace.types.find((item) => item.id === edit.typeId);
      const field = type?.fields.find((item) => item.id === edit.fieldId);
      if (!type || !field) return false;
      const trimmedName = edit.fieldName.trim();
      const trimmedType = edit.fieldType.trim();
      if (!trimmedName) {
        setUiNotice("字段名称不能为空");
        return false;
      }
      const typeError = validateFieldTypeValue(trimmedType, buildFieldTypeOptions(workspace, type));
      if (typeError) {
        setUiNotice(typeError);
        return false;
      }
      return runWorkspaceAction(async () => {
        const result = await window.protoVault.updateField({
          workspaceRoot: workspace.rootPath,
          typeId: type.id,
          fieldId: field.id,
          fieldType: trimmedType,
          fieldName: trimmedName
        });
        applyWorkspaceResult(result, { selectTypeName: type.name, selectFieldName: trimmedName });
        setDirtyStructuralEdits((current) => {
          const next = { ...current };
          delete next[targetId];
          return next;
        });
        setUiNotice(`已保存字段：${trimmedName}`);
      });
    }

    const type = workspace.types.find((item) => item.id === edit.typeId);
    const value = type?.values.find((item) => item.id === edit.valueId);
    if (!type || !value) return false;
    const trimmedName = edit.valueName.trim();
    if (!trimmedName) {
      setUiNotice("枚举项名称不能为空");
      return false;
    }
    let parsedValue: number | undefined;
    try {
      parsedValue = parseOptionalEnumNumber(edit.valueNumber);
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : "枚举值无效");
      return false;
    }
    return runWorkspaceAction(async () => {
      const result = await window.protoVault.updateEnumValue({
        workspaceRoot: workspace.rootPath,
        typeId: type.id,
        valueId: value.id,
        valueName: trimmedName,
        value: parsedValue
      });
      setWorkspace(result);
      const nextType = result.types.find((item) => item.name === type.name);
      const nextValue = nextType?.values.find((item) => item.name === trimmedName);
      setSelectedTypeId(nextType?.id ?? type.id);
      setSelectedFilePath(null);
      setSelectedMemberId(nextValue?.id ?? null);
      setDirtyStructuralEdits((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      setUiNotice(`已保存枚举项：${trimmedName}`);
    });
  }

  async function saveActiveChanges(): Promise<boolean> {
    if (selectedFile && sourceDrafts[selectedFile.path] !== undefined) {
      return saveHeaderContent(selectedFile, sourceDrafts[selectedFile.path]);
    }
    if (selectedMemberId && dirtyStructuralEdits[selectedMemberId]) {
      return saveStructuralEdit(selectedMemberId);
    }
    if (selectedNoteTarget && dirtyNotes[selectedNoteTarget.id] !== undefined) {
      return saveNoteTarget(selectedNoteTarget.id);
    }
    if (selectedType && dirtyDataFlows[selectedType.id]) {
      const edit = dirtyDataFlows[selectedType.id];
      return updateDataFlowForType(selectedType, edit.producers, edit.consumers);
    }
    if (selectedType) {
      const memberIds = new Set([...selectedType.fields.map((field) => field.id), ...selectedType.values.map((value) => value.id), selectedType.id]);
      const structuralTarget = Object.keys(dirtyStructuralEdits).find((id) => memberIds.has(id));
      if (structuralTarget) {
        return saveStructuralEdit(structuralTarget);
      }
      const noteTarget = Object.keys(dirtyNotes).find((id) => memberIds.has(id));
      if (noteTarget) {
        return saveNoteTarget(noteTarget);
      }
    }
    setUiNotice("没有需要保存的改动");
    return false;
  }

  function activateDocumentTab(tab: WorkspaceTab): void {
    setActiveTabId(tab.id);
    setActiveAction(null);
    if (tab.kind === "file") {
      setSelectedFilePath(tab.filePath);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
    } else {
      setSelectedTypeId(tab.typeId);
      setSelectedFilePath(null);
      setSelectedMemberId(null);
    }
  }

  async function ensureCanNavigateToTab(nextTabId: string): Promise<boolean> {
    if (!activeTabHasDirtyChanges(nextTabId)) return true;
    const shouldSave = window.confirm("当前标签页存在未保存改动。\n确定：保存并切换\n取消：留在当前标签页");
    if (!shouldSave) return false;
    return saveActiveChanges();
  }

  async function previewFileTab(file: WorkspaceFileView): Promise<boolean> {
    const tab = tabForFile(file);
    if (!(await ensureCanNavigateToTab(tab.id))) return false;
    if (tabs.some((item) => item.id === tab.id)) {
      setActiveTabId(tab.id);
      setSelectedFilePath(file.path);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
      syncActionForFileSelection(file);
    } else {
      setPreviewTab(tab);
      setActiveTabId(tab.id);
      setSelectedFilePath(file.path);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
      syncActionForFileSelection(file);
    }
    return true;
  }

  async function previewTypeTab(type: WorkspaceTypeView, memberId: string | null = null): Promise<boolean> {
    const tab = tabForType(type);
    if (!(await ensureCanNavigateToTab(tab.id))) return false;
    if (tabs.some((item) => item.id === tab.id)) {
      setActiveTabId(tab.id);
      setSelectedTypeId(type.id);
      setSelectedFilePath(null);
      setSelectedMemberId(memberId);
      setExpandedNodeIds((current) => new Set(current).add(`type:${type.id}`));
      syncActionForTypeSelection(type, memberId);
    } else {
      setPreviewTab(tab);
      setActiveTabId(tab.id);
      setSelectedTypeId(type.id);
      setSelectedFilePath(null);
      setSelectedMemberId(memberId);
      setExpandedNodeIds((current) => new Set(current).add(`type:${type.id}`));
      syncActionForTypeSelection(type, memberId);
    }
    return true;
  }

  async function openFileTab(file: WorkspaceFileView): Promise<boolean> {
    const tab = tabForFile(file);
    if (!(await ensureCanNavigateToTab(tab.id))) return false;
    setTabs((current) => upsertTab(current, tab));
    setPreviewTab((current) => current?.id === tab.id ? null : current);
    setActiveTabId(tab.id);
    setSelectedFilePath(file.path);
    setSelectedTypeId(null);
    setSelectedMemberId(null);
    syncActionForFileSelection(file);
    return true;
  }

  async function openTypeTab(type: WorkspaceTypeView, memberId: string | null = null): Promise<boolean> {
    const tab = tabForType(type);
    if (!(await ensureCanNavigateToTab(tab.id))) return false;
    setTabs((current) => upsertTab(current, tab));
    setPreviewTab((current) => current?.id === tab.id ? null : current);
    setActiveTabId(tab.id);
    setSelectedTypeId(type.id);
    setSelectedFilePath(null);
    setSelectedMemberId(memberId);
    setExpandedNodeIds((current) => new Set(current).add(`type:${type.id}`));
    syncActionForTypeSelection(type, memberId);
    return true;
  }

  function activeTabHasDirtyChanges(nextTabId?: string): boolean {
    return !!activeTabId && activeTabId !== nextTabId && dirtyTabIds.has(activeTabId);
  }

  async function activateTab(tab: WorkspaceTab): Promise<void> {
    if (!(await ensureCanNavigateToTab(tab.id))) return;
    activateDocumentTab(tab);
  }

  function closeTab(tabId: string): void {
    if (dirtyTabIds.has(tabId) && !window.confirm("该标签页存在未保存改动，关闭会丢弃这些改动。确认关闭？")) return;
    discardDirtyForTab(tabId);
    if (previewTab?.id === tabId) {
      setPreviewTab(null);
      if (activeTabId === tabId) {
        const fallback = tabs.at(-1) ?? null;
        setActiveTabId(fallback?.id ?? null);
        if (fallback) activateDocumentTab(fallback);
        else {
          setSelectedFilePath(null);
          setSelectedTypeId(null);
          setSelectedMemberId(null);
          setActiveAction(null);
        }
      }
      return;
    }
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const fallback = next[Math.max(0, index - 1)] ?? next[0] ?? previewTab ?? null;
        setActiveTabId(fallback?.id ?? null);
        if (!fallback) {
          setSelectedFilePath(null);
          setSelectedTypeId(null);
          setSelectedMemberId(null);
          setActiveAction(null);
        } else if (fallback.kind === "file") {
          setSelectedFilePath(fallback.filePath);
          setSelectedTypeId(null);
          setSelectedMemberId(null);
        } else {
          setSelectedTypeId(fallback.typeId);
          setSelectedFilePath(null);
          setSelectedMemberId(null);
        }
      }
      return next;
    });
  }

  function discardDirtyForTab(tabId: string): void {
    if (!workspace) return;
    if (tabId.startsWith("file:")) {
      const filePath = tabId.replace(/^file:/, "");
      setSourceDrafts((current) => {
        const next = { ...current };
        delete next[filePath];
        return next;
      });
      return;
    }
    if (tabId.startsWith("type:")) {
      const typeId = tabId.replace(/^type:/, "");
      const type = workspace.types.find((item) => item.id === typeId);
      if (!type) return;
      const ids = new Set([type.id, ...type.fields.map((field) => field.id), ...type.values.map((value) => value.id)]);
      setDirtyNotes((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
      setDirtyStructuralEdits((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
      setDirtyDataFlows((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== type.id)));
    }
  }

  async function openEditFieldAction(type: WorkspaceTypeView, field: WorkspaceFieldView): Promise<void> {
    if (!(await openTypeTab(type, field.id))) return;
    setFieldType(field.type);
    setFieldName(field.name);
    setEditingFieldId(field.id);
    setActiveAction("edit-field");
  }

  async function openEditEnumValueAction(type: WorkspaceTypeView, value: WorkspaceEnumValueView): Promise<void> {
    if (!(await openTypeTab(type, value.id))) return;
    setEnumValueName(value.name);
    setEnumValueNumber(value.value === undefined ? "" : String(value.value));
    setEditingEnumValueId(value.id);
    setActiveAction("edit-enum-value");
  }

  function toggleNode(nodeId: string): void {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function collapseAll(): void {
    setExpandedNodeIds(new Set());
    setUiNotice("协议树已折叠");
  }

  function startResize(kind: "navigator" | "inspector", event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const startX = event.clientX;
    const startNavigatorWidth = navigatorWidth;
    const startInspectorWidth = inspectorWidth;

    function move(pointerEvent: PointerEvent): void {
      if (kind === "navigator") {
        setNavigatorWidth(clamp(startNavigatorWidth + pointerEvent.clientX - startX, 280, 560));
      } else {
        setInspectorWidth(clamp(startInspectorWidth + startX - pointerEvent.clientX, 220, 460));
      }
    }

    function stop(): void {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing");
    }

    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  return (
    <main
      className="shell"
      style={{ gridTemplateColumns: `56px ${navigatorWidth}px 6px minmax(420px, 1fr) 6px ${inspectorWidth}px` }}
    >
      <aside className="rail">
        <div className="mark">PV</div>
        <button className={centerViewMode === "workspace" ? "active" : ""} aria-label="协议工作区" title="协议工作区" onClick={() => setCenterViewMode("workspace")}>◇</button>
        <button className={centerViewMode === "graph" ? "active" : ""} aria-label="关系图谱" title="关系图谱" disabled={!workspace} onClick={() => { setActiveAction(null); setWorkspaceReport(null); setCenterViewMode("graph"); }}>⌬</button>
        <button aria-label="问题面板">!</button>
      </aside>
      <aside className="navigator">
        <div className="navigator-title">
          <div>
            <h1>ProtoVault</h1>
            <p className="eyebrow">协议资产库</p>
          </div>
        </div>
        <div className="tree-actions" aria-label="协议树操作">
          <button aria-label="新增数据结构" title="新增数据结构" disabled={!workspace || loading} onClick={() => openStructuredAction("create-struct")}>✎</button>
          <button aria-label="新增枚举" title="新增枚举" disabled={!workspace || loading} onClick={() => openStructuredAction("create-enum")}>E＋</button>
          <button aria-label="新建 Header 文件" title="新建 Header 文件" disabled={!workspace || loading} onClick={() => openStructuredAction("create-header")}>▣＋</button>
          <button aria-label="添加字段" title="添加字段" disabled={selectedType?.kind !== "struct" || loading} onClick={() => openStructuredAction("add-field")}>＋f</button>
          <button aria-label="添加枚举项" title="添加枚举项" disabled={selectedType?.kind !== "enum" || loading} onClick={() => openStructuredAction("add-enum-value")}>＋#</button>
          <button aria-label="排序协议树" title="排序协议树" disabled={!workspace} onClick={() => setUiNotice("协议树已按目录、Header、类型排序")}>↥</button>
          <button aria-label="搜索协议树" title="搜索协议树" disabled={!workspace} aria-pressed={treeSearchOpen} onClick={() => setTreeSearchOpen((open) => !open)}>⌕</button>
          <button aria-label="折叠全部" title="折叠全部" disabled={!workspace} onClick={collapseAll}>⌃⌄</button>
        </div>
        {workspace && treeSearchOpen && <div className="tree-search" role="search">
          <input
            aria-label="协议树搜索"
            autoFocus
            value={treeSearchQuery}
            placeholder="搜索 Header / Struct / Field / Enum…"
            onChange={(event) => setTreeSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setTreeSearchQuery("");
                setTreeSearchOpen(false);
              }
            }}
          />
          <span>{treeSearchQuery.trim() ? `${treeSearchResult.matchCount} 项` : "过滤树图"}</span>
          {treeSearchQuery && <button aria-label="清空搜索" onClick={() => setTreeSearchQuery("")}>×</button>}
        </div>}
        {workspace
          ? <nav className="tree" aria-label="协议资产树" onContextMenu={(event) => openContextMenu(event, { kind: "workspace" })}>
              {tree.length > 0 ? <TreeNodes
                nodes={tree}
                selectedFilePath={selectedFilePath}
                selectedTypeId={selectedTypeId}
                selectedMemberId={selectedMemberId}
                expandedNodeIds={effectiveExpandedNodeIds}
                onToggleNode={toggleNode}
                onSelectFile={(file) => previewFileTab(file)}
                onPinFile={(file) => openFileTab(file)}
                onSelectType={(type) => previewTypeTab(type)}
                onPinType={(type) => openTypeTab(type)}
                onSelectMember={(parent, memberId) => previewTypeTab(parent, memberId)}
                onPinMember={(parent, memberId) => openTypeTab(parent, memberId)}
                onOpenContextMenu={openContextMenu}
              /> : <p className="tree-no-results">没有匹配的协议节点</p>}
            </nav>
          : <div className="tree-empty"><p>打开工作区后，这里会显示 Header、协议类型与字段。</p></div>}
        <div className="workspace-dock" aria-label="工作区管理">
          <div className="workspace-dock-summary">
            <span>{workspace?.name ?? "未打开工作区"}</span>
            <small>{workspace ? `${workspace.files.length} Headers · ${workspace.types.length} Types` : "选择目录或加载示例"}</small>
          </div>
          <div className="workspace-dock-actions">
            <button aria-label="打开本地目录" title="打开本地目录" disabled={loading} onClick={() => void openWorkspace(false)}>▣</button>
            <button aria-label={workspace ? "重新扫描示例" : "加载示例项目"} title={workspace ? "重新扫描示例" : "加载示例项目"} disabled={loading} onClick={() => void openWorkspace(true)}>{loading ? "…" : "↻"}</button>
            <button aria-label="工作区设置" title="工作区设置" disabled={!workspace} onClick={() => setUiNotice("工作区设置面板将在 P2/P7 接入")}>⚙</button>
          </div>
        </div>
      </aside>
      <div className="resize-handle" role="separator" aria-label="调整左侧树栏宽度" onPointerDown={(event) => startResize("navigator", event)} />
      <section className="workspace">
        <header className="workspace-toolbar">
          <div className="workspace-context">
            <span>{selectedFile?.relativePath ?? selectedType?.qualifiedName ?? "欢迎"}</span>
            <small>{workspace ? `${workspace.name} · ${workspace.files.length} Headers · ${workspace.types.length} Types` : "尚未打开协议工作区"}</small>
          </div>
          <div className="toolbar-actions">
            {workspace && <>
              <button className="inline-action" disabled={loading} onClick={() => void runLintReport()}>Lint</button>
              <button className="inline-action" disabled={loading} onClick={() => void generateDocumentReport()}>文档</button>
              <button className="inline-action" disabled={loading} onClick={() => void createSnapshotReport()}>快照</button>
              <button className="inline-action" disabled={loading} onClick={() => void diffSnapshotReport()}>Diff</button>
            </>}
            {uiNotice && <small className="notice" role="status">{uiNotice}</small>}
            <small className="health">{health}</small>
          </div>
        </header>
        {(loading || scanProgress?.phase === "done") && scanProgress && <ScanProgressBar progress={scanProgress} active={loading} />}
        {!workspace && <article>
          <p className="eyebrow">PROTO VAULT · MVP</p>
          <h2>让散落在 Header 中的协议<br />成为可管理的工程资产。</h2>
          <p className="lede">扫描 C++ 数据结构，理解字段布局，维护语义元数据，并用受控生成与语义差异守住协议演进。</p>
          <div className="flow"><span>扫描</span><b>→</b><span>IR</span><b>→</b><span>布局</span><b>→</b><span>生成</span><b>→</b><span>检查</span></div>
        </article>}
        {workspace && <TabStrip tabs={tabs} previewTab={previewTab} activeTabId={activeTabId} dirtyTabIds={dirtyTabIds} onActivate={activateTab} onClose={closeTab} />}
        {workspace && workspaceReport && <WorkspaceReportPanel report={workspaceReport} workspaceRoot={workspace.rootPath} onClose={() => setWorkspaceReport(null)} />}
        {workspace && centerViewMode === "graph" && <ProtocolGraphView
          workspace={workspace}
          selectedTypeId={selectedTypeId}
          selectedFilePath={selectedFilePath}
          onSelectNode={selectGraphNode}
          onOpenNode={openGraphNode}
          onClose={() => setCenterViewMode("workspace")}
        />}
        {workspace && activeAction && <StructuredActionPanel
          action={activeAction}
          workspace={workspace}
          selectedFile={selectedFile}
          selectedType={selectedType}
          loading={loading}
          headerRelativePath={headerRelativePath}
          headerEditRelativePath={headerEditRelativePath}
          headerIncludePaths={headerIncludePaths}
          structHeaderPath={structHeaderPath}
          structName={structName}
          structEditName={structEditName}
          enumHeaderPath={enumHeaderPath}
          enumName={enumName}
          enumEditName={enumEditName}
          fieldTypeOptions={selectedFieldTypeOptions}
          fieldType={fieldType}
          fieldName={fieldName}
          enumValueName={enumValueName}
          enumValueNumber={enumValueNumber}
          onHeaderRelativePathChange={setHeaderRelativePath}
          onHeaderEditRelativePathChange={setHeaderEditRelativePath}
          onHeaderIncludePathsChange={setHeaderIncludePaths}
          onStructHeaderPathChange={setStructHeaderPath}
          onStructNameChange={setStructName}
          onStructEditNameChange={setStructEditName}
          onEnumHeaderPathChange={setEnumHeaderPath}
          onEnumNameChange={setEnumName}
          onEnumEditNameChange={setEnumEditName}
          onFieldTypeChange={setFieldType}
          onFieldNameChange={setFieldName}
          onEnumValueNameChange={setEnumValueName}
          onEnumValueNumberChange={setEnumValueNumber}
          onCancel={() => setActiveAction(null)}
          onCreateHeader={() => void createHeaderFromForm()}
          onCreateStruct={() => void createStructFromForm()}
          onCreateEnum={() => void createEnumFromForm()}
          onRenameHeader={() => void renameHeaderFromForm()}
          onDeleteHeader={() => void deleteHeaderFromForm()}
          onUpdateHeaderIncludes={() => void updateHeaderIncludesFromForm()}
          onRenameStruct={() => void renameStructFromForm()}
          onDeleteStruct={() => void deleteStructFromForm()}
          onRenameEnum={() => void renameEnumFromForm()}
          onDeleteEnum={() => void deleteEnumFromForm()}
          onAddField={() => void addFieldFromForm()}
          onUpdateField={() => void updateFieldFromForm()}
          onDeleteField={() => void deleteFieldFromForm()}
          onAddEnumValue={() => void addEnumValueFromForm()}
          onUpdateEnumValue={() => void updateEnumValueFromForm()}
          onDeleteEnumValue={() => void deleteEnumValueFromForm()}
        />}
        {workspace && centerViewMode === "workspace" && selectedType && <ProtocolEditor
          type={selectedType}
          workspaceTypes={workspace.types}
          selectedMemberId={selectedMemberId}
          loading={loading}
          fieldTypeOptions={selectedFieldTypeOptions}
          dirtyNotes={dirtyNotes}
          dirtyStructuralEdits={dirtyStructuralEdits}
          onEditType={() => openStructuredAction(selectedType.kind === "struct" ? "edit-struct" : "edit-enum")}
          onAddFieldInline={addFieldInline}
          onAddEnumValueInline={addEnumValueInline}
          onFieldDraftChange={updateFieldDraft}
          onEnumValueDraftChange={updateEnumValueDraft}
          onSaveStructuralEdit={saveStructuralEdit}
          onJumpToType={(target) => openTypeTab(target)}
          onSelectMember={setSelectedMemberId}
          onLocateMemberInTree={locateMemberInTree}
          onNoteChange={updateNoteDraft}
          onOpenContextMenu={openContextMenu}
        />}
        {workspace && centerViewMode === "workspace" && selectedFile && <SourceViewer
          file={selectedFile}
          content={sourceDrafts[selectedFile.path] ?? selectedFile.content}
          diagnostics={workspace.diagnostics.filter((diagnostic) => diagnostic.file && normalizePath(diagnostic.file) === normalizePath(selectedFile.path))}
          loading={loading}
          onContentChange={(content) => updateSourceDraft(selectedFile, content)}
          onSaveContent={saveHeaderContent}
          onEditHeader={() => openStructuredAction("edit-header")}
          onOpenContextMenu={openContextMenu}
        />}
        {workspace && centerViewMode === "workspace" && !selectedType && !selectedFile && <div className="scan-empty">已发现 {workspace.files.length} 个 Header，但尚未解析到协议类型。</div>}
        {workspace && contextMenu && <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onCreateHeader={() => runContextAction(() => openStructuredAction("create-header"))}
          onCreateStruct={(file) => runContextAction(() => {
            openFileTab(file);
            setStructName("NewProtocol");
            setStructHeaderPath(file.path);
            setActiveAction("create-struct");
          })}
          onCreateEnum={(file) => runContextAction(() => {
            openFileTab(file);
            setEnumName("NewEnum");
            setEnumHeaderPath(file.path);
            setActiveAction("create-enum");
          })}
          onAddField={(type) => runContextAction(() => {
            openTypeTab(type);
            setFieldType("std::uint32_t");
            setFieldName("value");
            setActiveAction("add-field");
          })}
          onAddEnumValue={(type) => runContextAction(() => {
            openTypeTab(type);
            setEnumValueName("Unknown");
            setEnumValueNumber(nextEnumValueNumber(type));
            setEditingEnumValueId(null);
            setActiveAction("add-enum-value");
          })}
          onEditFile={(file) => runContextAction(() => editFile(file))}
          onEditType={(type) => runContextAction(() => editType(type))}
          onEditField={(type, field) => runContextAction(() => { void openEditFieldAction(type, field); })}
          onEditEnumValue={(type, value) => runContextAction(() => { void openEditEnumValueAction(type, value); })}
          onDeleteType={(type) => runContextAction(() => { void deleteTypeWithConfirm(type); })}
          onDeleteField={(type, field) => runContextAction(() => { void deleteFieldWithConfirm(type, field); })}
          onDeleteEnumValue={(type, value) => runContextAction(() => { void deleteEnumValueWithConfirm(type, value); })}
        />}
      </section>
      <div className="resize-handle" role="separator" aria-label="调整属性栏宽度" onPointerDown={(event) => startResize("inspector", event)} />
      <aside className="inspector">
        <div className="inspector-header">
          <h2>{centerViewMode === "graph" ? "图谱上下文" : "属性"}</h2>
        </div>
        {centerViewMode === "graph" && workspace && graphContext ? <GraphInspector
          workspace={workspace}
          graph={graphContext}
          selectedNode={selectedGraphNode}
          dirtyDataFlows={dirtyDataFlows}
          onOpenNode={openGraphNode}
          onSelectNode={selectGraphNode}
          onDataFlowDraftChange={updateDataFlowDraft}
          onUpdateDataFlow={(type, producers, consumers) => void updateDataFlowForType(type, producers, consumers)}
        />
          : selectedType ? <ProtocolInspector
              type={selectedType}
              layout={selectedLayout}
              selectedField={selectedField}
              selectedEnumValue={selectedEnumValue}
              dirtyDataFlows={dirtyDataFlows}
              onDataFlowDraftChange={updateDataFlowDraft}
              onUpdateDataFlow={(type, producers, consumers) => void updateDataFlowForType(type, producers, consumers)}
            />
          : selectedFile ? <dl><dt>文件</dt><dd>{selectedFile.relativePath}</dd><dt>Include</dt><dd>{selectedFile.includes.length}</dd><dt>路径</dt><dd className="break">{selectedFile.path}</dd></dl>
            : <dl><dt>阶段</dt><dd>P2/P3</dd><dt>平台</dt><dd>Windows</dd><dt>解析器</dt><dd>{workspace?.scanner ?? "Clang AST"}</dd></dl>}
        {workspace && <section className="problems"><h2>问题 · {workspace.diagnostics.length}</h2>{workspace.diagnostics.length === 0 ? <p className="ok">没有扫描问题</p> : workspace.diagnostics.map((item, index) => <p className="problem" key={index}>{item.message}</p>)}</section>}
      </aside>
    </main>
  );
}

function buildProtocolTree(workspace: WorkspaceView): ProtocolTreeNode[] {
  const root: ProtocolTreeNode[] = [];
  const typesByFile = new Map<string, WorkspaceTypeView[]>();
  for (const type of workspace.types) {
    const fileKey = relativePath(workspace, type.file);
    typesByFile.set(fileKey, [...(typesByFile.get(fileKey) ?? []), type]);
  }

  for (const directory of workspace.directories) {
    ensureFolder(root, directory.relativePath.split("/").filter(Boolean));
  }

  for (const file of workspace.files) {
    const segments = file.relativePath.split("/");
    const fileName = segments.at(-1);
    if (!fileName) continue;
    const cursor = ensureFolder(root, segments.slice(0, -1));
    const existingFile = cursor.find((node): node is Extract<ProtocolTreeNode, { kind: "file" }> => node.kind === "file" && node.file.path === file.path);
    if (!existingFile) {
      cursor.push({
        id: `file:${file.path}`,
        kind: "file",
        name: fileName,
        file,
        children: (typesByFile.get(file.relativePath) ?? []).map(typeNode)
      });
    }
  }
  return sortTree(root);
}

function ensureFolder(root: ProtocolTreeNode[], segments: string[]): ProtocolTreeNode[] {
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    const id = `folder:${segments.slice(0, index + 1).join("/")}`;
    let folder = cursor.find((node): node is Extract<ProtocolTreeNode, { kind: "folder" }> => node.id === id && node.kind === "folder");
    if (!folder) {
      folder = { id, kind: "folder", name: segment, children: [] };
      cursor.push(folder);
    }
    cursor = folder.children;
  }
  return cursor;
}

function typeNode(type: WorkspaceTypeView): ProtocolTreeNode {
  return {
    id: `type:${type.id}`,
    kind: "type",
    name: type.name,
    type,
    children: type.kind === "struct"
      ? type.fields.map((field) => ({ id: field.id, kind: "field" as const, name: field.name, parent: type, field }))
      : type.values.map((value) => ({ id: value.id, kind: "field" as const, name: value.name, parent: type, enumValue: value }))
  };
}

function relativePath(workspace: WorkspaceView, absolutePath: string): string {
  return absolutePath.replace(workspace.rootPath, "").replace(/^[/\\]/, "").replaceAll("\\", "/");
}

function sortTree(nodes: ProtocolTreeNode[]): ProtocolTreeNode[] {
  const order: Record<ProtocolTreeNode["kind"], number> = { folder: 0, file: 1, type: 2, field: 3 };
  return nodes
    .map((node) => {
      if (!("children" in node)) return node;
      if (node.kind === "type") return node;
      return { ...node, children: sortTree(node.children) };
    })
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

function findTreePath(nodes: ProtocolTreeNode[], targetId: string): string[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node.id];
    if ("children" in node) {
      const childPath = findTreePath(node.children, targetId);
      if (childPath.length > 0) return [node.id, ...childPath];
    }
  }
  return [];
}

function filterProtocolTree(nodes: ProtocolTreeNode[], query: string): { nodes: ProtocolTreeNode[]; expandedNodeIds: Set<string>; matchCount: number } {
  const normalizedQuery = query.trim().toLowerCase();
  const expandedNodeIds = new Set<string>();
  if (!normalizedQuery) return { nodes, expandedNodeIds, matchCount: countTreeNodes(nodes) };

  let matchCount = 0;

  function visit(node: ProtocolTreeNode): ProtocolTreeNode | null {
    const selfMatches = nodeSearchText(node).includes(normalizedQuery);
    if (selfMatches) matchCount += 1;
    if (!("children" in node)) return selfMatches ? node : null;

    const children = node.children.flatMap((child) => {
      const filtered = visit(child);
      return filtered ? [filtered] : [];
    });
    if (!selfMatches && children.length === 0) return null;
    if (children.length > 0) expandedNodeIds.add(node.id);
    return { ...node, children } as ProtocolTreeNode;
  }

  return {
    nodes: nodes.flatMap((node) => {
      const filtered = visit(node);
      return filtered ? [filtered] : [];
    }),
    expandedNodeIds,
    matchCount
  };
}

function countTreeNodes(nodes: ProtocolTreeNode[]): number {
  return nodes.reduce((count, node) => count + 1 + ("children" in node ? countTreeNodes(node.children) : 0), 0);
}

function nodeSearchText(node: ProtocolTreeNode): string {
  if (node.kind === "folder") return node.name.toLowerCase();
  if (node.kind === "file") return [
    node.name,
    node.file.relativePath,
    node.file.includes.join(" ")
  ].join(" ").toLowerCase();
  if (node.kind === "type") return [
    node.name,
    node.type.qualifiedName,
    node.type.kind,
    node.type.note ?? ""
  ].join(" ").toLowerCase();
  return [
    node.name,
    node.field?.type ?? "",
    node.field?.note ?? "",
    node.enumValue?.value?.toString() ?? "",
    node.enumValue?.note ?? "",
    node.parent.name,
    node.parent.qualifiedName
  ].join(" ").toLowerCase();
}

function buildBaseFieldTypeOptions(): FieldTypeOption[] {
  return SUPPORTED_BASE_FIELD_TYPES.map((type) => ({ group: "base", value: type, label: type, detail: "基础类型" }));
}

function buildFieldTypeOptions(workspace: WorkspaceView, currentType: WorkspaceTypeView): FieldTypeOption[] {
  const options = new Map<string, FieldTypeOption>();
  const visibleFiles = visibleHeaderPathsForType(workspace, currentType);
  for (const type of workspace.types) {
    if (type.id === currentType.id) continue;
    if (!visibleFiles.has(type.file)) continue;
    const detail = `${type.kind} · ${type.qualifiedName}`;
    options.set(type.qualifiedName, { group: "composite", value: type.qualifiedName, label: type.qualifiedName, detail });
    if (!options.has(type.name)) options.set(type.name, { group: "composite", value: type.name, label: type.name, detail });
  }
  return [
    ...[...options.values()].sort((a, b) => a.value.localeCompare(b.value)),
    ...buildBaseFieldTypeOptions()
  ];
}

function internalIncludeRelativePaths(workspace: WorkspaceView, file: WorkspaceFileView): string[] {
  const filesByRelativePath = new Map(workspace.files.map((item) => [item.relativePath, item]));
  return file.includes.flatMap((includePath) => {
    const resolved = resolveIncludeFile(workspace, file, includePath);
    return resolved && filesByRelativePath.has(resolved.relativePath) ? [resolved.relativePath] : [];
  }).filter((value, index, values) => values.indexOf(value) === index).sort((a, b) => a.localeCompare(b));
}

function visibleHeaderPathsForType(workspace: WorkspaceView, currentType: WorkspaceTypeView): Set<string> {
  const currentFile = workspace.files.find((file) => file.path === currentType.file);
  const visible = new Set<string>([currentType.file]);
  if (!currentFile) return visible;
  const stack = [...internalIncludeRelativePaths(workspace, currentFile)];
  const byRelativePath = new Map(workspace.files.map((file) => [file.relativePath, file]));
  while (stack.length > 0) {
    const relativePath = stack.pop()!;
    const file = byRelativePath.get(relativePath);
    if (!file || visible.has(file.path)) continue;
    visible.add(file.path);
    stack.push(...internalIncludeRelativePaths(workspace, file));
  }
  return visible;
}

function resolveIncludeFile(workspace: WorkspaceView, sourceFile: WorkspaceFileView, includePath: string): WorkspaceFileView | null {
  const normalized = includePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const byRelativePath = new Map(workspace.files.map((file) => [file.relativePath, file]));
  const direct = byRelativePath.get(normalized);
  if (direct) return direct;
  const sourceDir = sourceFile.relativePath.includes("/") ? sourceFile.relativePath.slice(0, sourceFile.relativePath.lastIndexOf("/")) : "";
  const sibling = normalizeRelativeSegments(`${sourceDir}/${normalized}`);
  return byRelativePath.get(sibling) ?? null;
}

function normalizeRelativeSegments(path: string): string {
  const parts: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function normalizeFieldTypeValue(value: string): { coreType: string; arraySuffix: string } | null {
  const match = value.trim().match(/^(.*?)(\s*\[[1-9][0-9]*\])?$/);
  if (!match) return null;
  const coreType = match[1].trim();
  if (!coreType) return null;
  return { coreType, arraySuffix: match[2]?.replace(/\s+/g, "") ?? "" };
}

function validateFieldTypeValue(value: string, options: FieldTypeOption[]): string | null {
  const normalized = normalizeFieldTypeValue(value);
  if (!normalized) return "字段类型格式无效；定长数组请使用 Type[N]。";
  const allowedTypes = new Set(options.map((option) => option.value));
  if (!allowedTypes.has(normalized.coreType)) {
    return "字段类型不在支持范围内；请从类型索引选择，或输入索引中的类型/定长数组。";
  }
  return null;
}

function initialExpandedNodeIds(nodes: ProtocolTreeNode[], selectedTypeId: string | null): Set<string> {
  const expanded = new Set<string>();
  function visit(node: ProtocolTreeNode): boolean {
    if (!("children" in node)) return false;
    let childContainsSelection = false;
    for (const child of node.children) {
      if (visit(child)) childContainsSelection = true;
    }
    const shouldExpand = node.kind === "folder" || node.kind === "file" || node.id === `type:${selectedTypeId}` || childContainsSelection;
    if (shouldExpand) expanded.add(node.id);
    return node.id === `type:${selectedTypeId}` || childContainsSelection;
  }
  nodes.forEach(visit);
  return expanded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tabForFile(file: WorkspaceFileView): WorkspaceTab {
  return { id: `file:${file.path}`, kind: "file", title: file.relativePath.split("/").at(-1) ?? file.relativePath, filePath: file.path };
}

function tabForType(type: WorkspaceTypeView): WorkspaceTab {
  return { id: `type:${type.id}`, kind: "type", title: type.name, typeId: type.id };
}

function buildDirtyTabIds(
  workspace: WorkspaceView,
  dirtyNotes: Record<string, string>,
  dirtyStructuralEdits: Record<string, DirtyStructuralEdit>,
  dirtyDataFlows: Record<string, DirtyDataFlowEdit>,
  sourceDrafts: Record<string, string>
): Set<string> {
  const dirtyIds = new Set([...Object.keys(dirtyNotes), ...Object.keys(dirtyStructuralEdits), ...Object.keys(dirtyDataFlows)]);
  const tabIds = new Set<string>();
  for (const file of workspace.files) {
    if (sourceDrafts[file.path] !== undefined && sourceDrafts[file.path] !== file.content) {
      tabIds.add(tabForFile(file).id);
    }
  }
  for (const type of workspace.types) {
    if (
      dirtyIds.has(type.id)
      || type.fields.some((field) => dirtyIds.has(field.id))
      || type.values.some((value) => dirtyIds.has(value.id))
    ) {
      tabIds.add(tabForType(type).id);
    }
  }
  return tabIds;
}

function resolveWorkspaceTypeReference(types: WorkspaceTypeView[], rawType: string, currentTypeId?: string): WorkspaceTypeView | null {
  const normalized = normalizeFieldTypeValue(rawType);
  const coreType = normalized?.coreType ?? rawType.trim();
  if (!coreType) return null;
  return types.find((type) => type.id !== currentTypeId && (type.qualifiedName === coreType || type.name === coreType)) ?? null;
}

function upsertTab(tabs: WorkspaceTab[], tab: WorkspaceTab): WorkspaceTab[] {
  return tabs.some((item) => item.id === tab.id) ? tabs : [...tabs, tab];
}

function reconcileTabs(tabs: WorkspaceTab[], workspace: WorkspaceView): WorkspaceTab[] {
  const files = new Map(workspace.files.map((file) => [file.path, file]));
  const types = new Map(workspace.types.map((type) => [type.id, type]));
  return tabs.flatMap((tab): WorkspaceTab[] => {
    if (tab.kind === "file") {
      const file = files.get(tab.filePath);
      return file ? [tabForFile(file)] : [];
    }
    const type = types.get(tab.typeId);
    return type ? [tabForType(type)] : [];
  });
}

function ScanProgressBar({ progress, active }: { progress: WorkspaceScanProgress; active: boolean }): React.JSX.Element {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  return <div className={active ? "scan-progress active" : "scan-progress"} role="status" aria-label="扫描进度">
    <div className="scan-progress-copy">
      <span>{progress.message}</span>
      <small>{progress.phase === "done" ? "完成" : `${Math.min(percent, 100)}%`}</small>
    </div>
    <div className="scan-progress-track" aria-hidden="true">
      <div style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  </div>;
}

function TabStrip({ tabs, previewTab, activeTabId, dirtyTabIds, onActivate, onClose }: {
  tabs: WorkspaceTab[];
  previewTab: WorkspaceTab | null;
  activeTabId: string | null;
  dirtyTabIds: Set<string>;
  onActivate(tab: WorkspaceTab): void | Promise<void>;
  onClose(tabId: string): void;
}): React.JSX.Element | null {
  const visiblePreview = previewTab && !tabs.some((tab) => tab.id === previewTab.id) ? previewTab : null;
  if (tabs.length === 0 && !visiblePreview) return null;
  return <nav className="tab-strip" aria-label="工作区标签页">
    {tabs.map((tab) => {
      const dirty = dirtyTabIds.has(tab.id);
      return <div className={`${tab.id === activeTabId ? "workspace-tab active" : "workspace-tab"}${dirty ? " dirty" : ""}`} key={tab.id}>
      <button className="workspace-tab-main" aria-label={`切换到 ${tab.title}${dirty ? " 未保存" : ""}`} onClick={() => { void onActivate(tab); }}>
        <span className={tab.kind === "file" ? "tab-kind file" : "tab-kind type"}>{tab.kind === "file" ? "H" : "S"}</span>
        <span>{tab.title}</span>
        {dirty && <small>●</small>}
      </button>
      <button className="workspace-tab-close" aria-label={`关闭 ${tab.title}`} onClick={() => onClose(tab.id)}>×</button>
    </div>;
    })}
    {visiblePreview && (() => {
      const dirty = dirtyTabIds.has(visiblePreview.id);
      return <div className={`${visiblePreview.id === activeTabId ? "workspace-tab preview active" : "workspace-tab preview"}${dirty ? " dirty" : ""}`} key={`preview:${visiblePreview.id}`}>
      <button className="workspace-tab-main" aria-label={`预览 ${visiblePreview.title}${dirty ? " 未保存" : ""}`} onClick={() => { void onActivate(visiblePreview); }}>
        <span className={visiblePreview.kind === "file" ? "tab-kind file" : "tab-kind type"}>{visiblePreview.kind === "file" ? "H" : "S"}</span>
        <span>{visiblePreview.title}</span>
        <small>{dirty ? "●" : "Preview"}</small>
      </button>
      <button className="workspace-tab-close" aria-label={`关闭预览 ${visiblePreview.title}`} onClick={() => onClose(visiblePreview.id)}>×</button>
    </div>;
    })()}
  </nav>;
}

function TreeNodes({
  nodes,
  selectedFilePath,
  selectedTypeId,
  selectedMemberId,
  expandedNodeIds,
  onToggleNode,
  onSelectFile,
  onPinFile,
  onSelectType,
  onPinType,
  onSelectMember,
  onPinMember,
  onOpenContextMenu,
  level = 0
}: {
  nodes: ProtocolTreeNode[];
  selectedFilePath: string | null;
  selectedTypeId: string | null;
  selectedMemberId: string | null;
  expandedNodeIds: Set<string>;
  onToggleNode(nodeId: string): void;
  onSelectFile(file: WorkspaceFileView): void;
  onPinFile(file: WorkspaceFileView): void;
  onSelectType(type: WorkspaceTypeView): void;
  onPinType(type: WorkspaceTypeView): void;
  onSelectMember(parent: WorkspaceTypeView, memberId: string): void;
  onPinMember(parent: WorkspaceTypeView, memberId: string): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
  level?: number;
}): React.JSX.Element {
  return <div className="tree-level" style={{ "--level": level } as React.CSSProperties}>
    {nodes.map((node) => {
      if (node.kind === "folder") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className="tree-row folder" data-tree-node-id={node.id}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"}目录 ${node.name}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label folder-label" aria-label={`目录 ${node.name}`} onClick={() => onToggleNode(node.id)}><span className="icon folder-icon">■</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onPinFile={onPinFile} onSelectType={onSelectType} onPinType={onPinType} onSelectMember={onSelectMember} onPinMember={onPinMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      if (node.kind === "file") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.file.path === selectedFilePath ? "tree-row active" : "tree-row"} data-tree-node-id={node.id} onContextMenu={(event) => onOpenContextMenu(event, { kind: "file", file: node.file })}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"} Header ${node.file.relativePath}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={`打开 Header ${node.file.relativePath}`} onClick={() => onSelectFile(node.file)} onDoubleClick={() => onPinFile(node.file)}><span className="icon file-icon">H</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onPinFile={onPinFile} onSelectType={onSelectType} onPinType={onPinType} onSelectMember={onSelectMember} onPinMember={onPinMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      if (node.kind === "type") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.type.id === selectedTypeId && !selectedMemberId ? "tree-row active" : "tree-row"} data-tree-node-id={node.id} onContextMenu={(event) => onOpenContextMenu(event, { kind: "type", type: node.type })}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"}类型 ${node.type.qualifiedName}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={node.type.qualifiedName} onClick={() => onSelectType(node.type)} onDoubleClick={() => onPinType(node.type)}><span className="icon type-icon">{node.type.kind === "struct" ? "S" : "E"}</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onPinFile={onPinFile} onSelectType={onSelectType} onPinType={onPinType} onSelectMember={onSelectMember} onPinMember={onPinMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      return <button className={node.id === selectedMemberId ? "tree-row member active" : "tree-row member"} data-tree-node-id={node.id} key={node.id} aria-label={`${node.parent.name} ${node.name}`} onClick={() => onSelectMember(node.parent, node.id)} onDoubleClick={() => onPinMember(node.parent, node.id)} onContextMenu={(event) => node.field ? onOpenContextMenu(event, { kind: "field", type: node.parent, field: node.field }) : node.enumValue ? onOpenContextMenu(event, { kind: "enum-value", type: node.parent, value: node.enumValue }) : undefined}>
        <span className="disclosure-spacer" /><span className="icon field-icon">{node.field ? "f" : "#"}</span><span>{node.name}</span>
        {node.field && <small>{node.field.type}</small>}
        {node.enumValue && <small>{node.enumValue.value ?? "auto"}</small>}
      </button>;
    })}
  </div>;
}

function StructuredActionPanel({
  action,
  workspace,
  selectedFile,
  selectedType,
  loading,
  headerRelativePath,
  headerEditRelativePath,
  headerIncludePaths,
  structHeaderPath,
  structName,
  structEditName,
  enumHeaderPath,
  enumName,
  enumEditName,
  fieldTypeOptions,
  fieldType,
  fieldName,
  enumValueName,
  enumValueNumber,
  onHeaderRelativePathChange,
  onHeaderEditRelativePathChange,
  onHeaderIncludePathsChange,
  onStructHeaderPathChange,
  onStructNameChange,
  onStructEditNameChange,
  onEnumHeaderPathChange,
  onEnumNameChange,
  onEnumEditNameChange,
  onFieldTypeChange,
  onFieldNameChange,
  onEnumValueNameChange,
  onEnumValueNumberChange,
  onCancel,
  onCreateHeader,
  onCreateStruct,
  onCreateEnum,
  onRenameHeader,
  onDeleteHeader,
  onUpdateHeaderIncludes,
  onRenameStruct,
  onDeleteStruct,
  onRenameEnum,
  onDeleteEnum,
  onAddField,
  onUpdateField,
  onDeleteField,
  onAddEnumValue,
  onUpdateEnumValue,
  onDeleteEnumValue
}: {
  action: WorkspaceAction;
  workspace: WorkspaceView;
  selectedFile?: WorkspaceFileView;
  selectedType?: WorkspaceTypeView;
  loading: boolean;
  headerRelativePath: string;
  headerEditRelativePath: string;
  headerIncludePaths: string[];
  structHeaderPath: string;
  structName: string;
  structEditName: string;
  enumHeaderPath: string;
  enumName: string;
  enumEditName: string;
  fieldTypeOptions: FieldTypeOption[];
  fieldType: string;
  fieldName: string;
  enumValueName: string;
  enumValueNumber: string;
  onHeaderRelativePathChange(value: string): void;
  onHeaderEditRelativePathChange(value: string): void;
  onHeaderIncludePathsChange(value: string[]): void;
  onStructHeaderPathChange(value: string): void;
  onStructNameChange(value: string): void;
  onStructEditNameChange(value: string): void;
  onEnumHeaderPathChange(value: string): void;
  onEnumNameChange(value: string): void;
  onEnumEditNameChange(value: string): void;
  onFieldTypeChange(value: string): void;
  onFieldNameChange(value: string): void;
  onEnumValueNameChange(value: string): void;
  onEnumValueNumberChange(value: string): void;
  onCancel(): void;
  onCreateHeader(): void;
  onCreateStruct(): void;
  onCreateEnum(): void;
  onRenameHeader(): void;
  onDeleteHeader(): void;
  onUpdateHeaderIncludes(): void;
  onRenameStruct(): void;
  onDeleteStruct(): void;
  onRenameEnum(): void;
  onDeleteEnum(): void;
  onAddField(): void;
  onUpdateField(): void;
  onDeleteField(): void;
  onAddEnumValue(): void;
  onUpdateEnumValue(): void;
  onDeleteEnumValue(): void;
}): React.JSX.Element {
  const title = action === "create-header" ? "新建 Header"
    : action === "create-struct" ? "新增数据结构"
      : action === "create-enum" ? "新增枚举"
      : action === "edit-header" ? "编辑 Header"
        : action === "edit-struct" ? "编辑数据结构"
          : action === "edit-enum" ? "编辑枚举"
            : action === "add-field" ? "添加字段"
              : action === "add-enum-value" ? "添加枚举项"
                : action === "edit-enum-value" ? "编辑枚举项"
                  : "编辑字段";
  const description = action === "create-header"
    ? "在当前工作区内创建一个受控 Header 文件。"
    : action === "create-struct"
      ? "选择目标 Header，并插入一个最小 struct。"
      : action === "create-enum"
        ? "选择目标 Header，并插入一个 enum class。"
      : action === "edit-header"
        ? "重命名或删除当前 Header 文件。"
        : action === "edit-struct"
          ? `重命名或删除当前 struct ${selectedType?.name ?? ""}。`
          : action === "edit-enum"
            ? `重命名或删除当前 enum ${selectedType?.name ?? ""}。`
            : action === "add-field"
              ? `向当前 struct ${selectedType?.name ?? ""} 追加字段。`
              : action === "add-enum-value"
                ? `向当前 enum ${selectedType?.name ?? ""} 追加枚举项。`
                : action === "edit-enum-value"
                  ? `修改或删除当前 enum ${selectedType?.name ?? ""} 中的枚举项。`
                  : `修改或删除当前 struct ${selectedType?.name ?? ""} 中的字段。`;
  const includeCandidates = selectedFile
    ? workspace.files.filter((file) => file.path !== selectedFile.path).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    : [];
  const selectedIncludeSet = new Set(headerIncludePaths);

  function toggleHeaderInclude(relativePath: string): void {
    if (selectedIncludeSet.has(relativePath)) {
      onHeaderIncludePathsChange(headerIncludePaths.filter((item) => item !== relativePath));
    } else {
      onHeaderIncludePathsChange([...headerIncludePaths, relativePath].sort((a, b) => a.localeCompare(b)));
    }
  }

  return <section className="action-panel" aria-label="结构化编辑">
    <div className="action-panel-title">
      <div><p className="eyebrow">STRUCTURED EDIT</p><h2>{title}</h2><p>{description}</p></div>
      <button type="button" onClick={onCancel} disabled={loading}>关闭</button>
    </div>

    {action === "create-header" && <form className="action-form" onSubmit={(event) => { event.preventDefault(); onCreateHeader(); }}>
      <label>
        <span>Header 相对路径</span>
        <input value={headerRelativePath} onChange={(event) => onHeaderRelativePathChange(event.target.value)} placeholder="headers/protocol.hpp" autoFocus />
      </label>
      <small>路径必须位于当前 workspace 内，后缀支持 .h/.hh/.hpp/.hxx。</small>
      <button type="submit" disabled={loading}>创建 Header</button>
    </form>}

    {action === "create-struct" && <form className="action-form" onSubmit={(event) => { event.preventDefault(); onCreateStruct(); }}>
      <label>
        <span>目标 Header</span>
        <select value={structHeaderPath} onChange={(event) => onStructHeaderPathChange(event.target.value)}>
          {workspace.files.map((file) => <option key={file.path} value={file.path}>{file.relativePath}</option>)}
        </select>
      </label>
      <label>
        <span>Struct 名称</span>
        <input value={structName} onChange={(event) => onStructNameChange(event.target.value)} placeholder="PacketHeader" autoFocus />
      </label>
      <button type="submit" disabled={loading || workspace.files.length === 0}>创建 Struct</button>
    </form>}

    {action === "create-enum" && <form className="action-form" onSubmit={(event) => { event.preventDefault(); onCreateEnum(); }}>
      <label>
        <span>目标 Header</span>
        <select value={enumHeaderPath} onChange={(event) => onEnumHeaderPathChange(event.target.value)}>
          {workspace.files.map((file) => <option key={file.path} value={file.path}>{file.relativePath}</option>)}
        </select>
      </label>
      <label>
        <span>Enum 名称</span>
        <input value={enumName} onChange={(event) => onEnumNameChange(event.target.value)} placeholder="PacketKind" autoFocus />
      </label>
      <button type="submit" disabled={loading || workspace.files.length === 0}>创建 Enum</button>
    </form>}

    {action === "edit-header" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onRenameHeader(); }}>
      <label>
        <span>Header 相对路径</span>
        <input value={headerEditRelativePath} onChange={(event) => onHeaderEditRelativePathChange(event.target.value)} placeholder="headers/protocol.hpp" autoFocus />
      </label>
      <small>重命名不会自动更新其他 Header 的 include 路径。</small>
      <div className="header-include-editor">
        <div className="header-include-title">
          <span>依赖 Header</span>
          <button type="button" className="inline-action" disabled={loading || !selectedFile} onClick={onUpdateHeaderIncludes}>保存依赖</button>
        </div>
        <p>只管理工作区内的双引号 include；保存时会检查循环引用。</p>
        <div className="header-include-list">
          {includeCandidates.length === 0
            ? <small>当前没有可选 Header。</small>
            : includeCandidates.map((file) => <label key={file.path} className="header-include-option">
                <input
                  type="checkbox"
                  checked={selectedIncludeSet.has(file.relativePath)}
                  onChange={() => toggleHeaderInclude(file.relativePath)}
                />
                <span>{file.relativePath}</span>
              </label>)}
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" disabled={loading}>保存修改</button>
        <button type="button" className="danger" disabled={loading} onClick={onDeleteHeader}>删除 Header</button>
      </div>
    </form>}

    {action === "edit-struct" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onRenameStruct(); }}>
      <label>
        <span>Struct 名称</span>
        <input value={structEditName} onChange={(event) => onStructEditNameChange(event.target.value)} placeholder="PacketHeader" autoFocus />
      </label>
      <small>重命名当前只修改 struct 声明，不自动改引用类型。</small>
      <div className="form-actions">
        <button type="submit" disabled={loading || selectedType?.kind !== "struct"}>保存修改</button>
        <button type="button" className="danger" disabled={loading || selectedType?.kind !== "struct"} onClick={onDeleteStruct}>删除 Struct</button>
      </div>
    </form>}

    {action === "edit-enum" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onRenameEnum(); }}>
      <label>
        <span>Enum 名称</span>
        <input value={enumEditName} onChange={(event) => onEnumEditNameChange(event.target.value)} placeholder="PacketKind" autoFocus />
      </label>
      <small>重命名当前只修改 enum 声明，不自动改引用类型。</small>
      <div className="form-actions">
        <button type="submit" disabled={loading || selectedType?.kind !== "enum"}>保存修改</button>
        <button type="button" className="danger" disabled={loading || selectedType?.kind !== "enum"} onClick={onDeleteEnum}>删除 Enum</button>
      </div>
    </form>}

    {action === "add-field" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onAddField(); }}>
      <FieldTypeInput label="字段类型" value={fieldType} options={fieldTypeOptions} onChange={onFieldTypeChange} autoFocus />
      <label>
        <span>字段名称</span>
        <input value={fieldName} onChange={(event) => onFieldNameChange(event.target.value)} placeholder="value" />
      </label>
      <small>当前目标：{selectedType?.qualifiedName ?? "未选择 struct"}</small>
      <button type="submit" disabled={loading || selectedType?.kind !== "struct"}>添加字段</button>
    </form>}

    {action === "edit-field" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onUpdateField(); }}>
      <FieldTypeInput label="字段类型" value={fieldType} options={fieldTypeOptions} onChange={onFieldTypeChange} autoFocus />
      <label>
        <span>字段名称</span>
        <input value={fieldName} onChange={(event) => onFieldNameChange(event.target.value)} placeholder="value" />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={loading || selectedType?.kind !== "struct"}>保存修改</button>
        <button type="button" className="danger" disabled={loading || selectedType?.kind !== "struct"} onClick={onDeleteField}>删除字段</button>
      </div>
    </form>}

    {action === "add-enum-value" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onAddEnumValue(); }}>
      <label>
        <span>枚举项名称</span>
        <input value={enumValueName} onChange={(event) => onEnumValueNameChange(event.target.value)} placeholder="Unknown" autoFocus />
      </label>
      <label>
        <span>枚举值</span>
        <input value={enumValueNumber} onChange={(event) => onEnumValueNumberChange(event.target.value)} placeholder="留空自动编号" />
      </label>
      <small>当前目标：{selectedType?.qualifiedName ?? "未选择 enum"}</small>
      <button type="submit" disabled={loading || selectedType?.kind !== "enum"}>添加枚举项</button>
    </form>}

    {action === "edit-enum-value" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onUpdateEnumValue(); }}>
      <label>
        <span>枚举项名称</span>
        <input value={enumValueName} onChange={(event) => onEnumValueNameChange(event.target.value)} placeholder="Unknown" autoFocus />
      </label>
      <label>
        <span>枚举值</span>
        <input value={enumValueNumber} onChange={(event) => onEnumValueNumberChange(event.target.value)} placeholder="留空自动编号" />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={loading || selectedType?.kind !== "enum"}>保存修改</button>
        <button type="button" className="danger" disabled={loading || selectedType?.kind !== "enum"} onClick={onDeleteEnumValue}>删除枚举项</button>
      </div>
    </form>}
  </section>;
}

function FieldTypeInput({ label, value, options, onChange, autoFocus = false, compact = false }: {
  label: string;
  value: string;
  options: FieldTypeOption[];
  onChange(value: string): void;
  autoFocus?: boolean;
  compact?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [activeGroup, setActiveGroup] = React.useState<"base" | "composite" | null>(null);
  const rootRef = React.useRef<HTMLLabelElement>(null);
  const query = value.trim().toLowerCase();
  const visibleOptions = React.useMemo(() => {
    if (showAll || !query) return options;
    return options.filter((option) => `${option.value} ${option.label} ${option.detail ?? ""}`.toLowerCase().includes(query));
  }, [options, query, showAll]);
  const compositeOptions = visibleOptions.filter((option) => option.group === "composite");
  const baseOptions = visibleOptions.filter((option) => option.group === "base");

  React.useEffect(() => {
    function closeOnOutside(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", closeOnOutside);
    return () => window.removeEventListener("mousedown", closeOnOutside);
  }, []);

  function selectOption(option: FieldTypeOption): void {
    onChange(option.value);
    setOpen(false);
    setShowAll(false);
    setActiveGroup(null);
  }

  return <label className={compact ? "field-type-input compact" : "field-type-input"} ref={rootRef}>
    <span>{label}</span>
    <div className="field-type-box">
      <input
        className="table-input mono"
        aria-label={label}
        value={value}
        onFocus={() => {
          setOpen(true);
          setShowAll(true);
          setActiveGroup(null);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setShowAll(false);
          setActiveGroup(null);
        }}
        placeholder="std::uint32_t"
        autoFocus={autoFocus}
      />
      <button type="button" className="field-type-index-button" aria-label={`${label} 类型索引`} onClick={() => {
        setOpen((current) => current && showAll ? false : true);
        setShowAll(true);
        setActiveGroup(null);
      }}>⌄</button>
      {open && <div className="field-type-menu" role="listbox" aria-label={`${label} 候选类型`}>
        {!activeGroup && <div className="field-type-levels">
          <button type="button" onClick={() => setActiveGroup("base")}>
            <span>基础类型</span>
            <small>{baseOptions.length} 个可选类型</small>
          </button>
          <button type="button" onClick={() => setActiveGroup("composite")}>
            <span>组合类型</span>
            <small>{compositeOptions.length} 个当前 Header 可见类型</small>
          </button>
        </div>}
        {activeGroup === "base" && <>
          <button type="button" className="field-type-back" onClick={() => setActiveGroup(null)}>← 类型分类</button>
          <FieldTypeGroup title="基础支持类型" emptyText="没有匹配的基础类型" options={baseOptions} onSelect={selectOption} />
        </>}
        {activeGroup === "composite" && <>
          <button type="button" className="field-type-back" onClick={() => setActiveGroup(null)}>← 类型分类</button>
          <FieldTypeGroup title="组合类型" emptyText="当前 Header 依赖范围内没有匹配的组合类型" options={compositeOptions} onSelect={selectOption} />
        </>}
      </div>}
    </div>
  </label>;
}

function FieldTypeGroup({ title, emptyText, options, onSelect }: {
  title: string;
  emptyText: string;
  options: FieldTypeOption[];
  onSelect(option: FieldTypeOption): void;
}): React.JSX.Element {
  return <section className="field-type-group">
    <h3>{title}</h3>
    {options.length === 0
      ? <p>{emptyText}</p>
      : options.map((option) => <button
          type="button"
          role="option"
          key={`${option.group}:${option.value}`}
          onClick={() => onSelect(option)}
        >
          <span>{option.label}</span>
          {option.detail && <small>{option.detail}</small>}
        </button>)}
  </section>;
}

function ProtocolEditor({
  type,
  workspaceTypes,
  selectedMemberId,
  loading,
  fieldTypeOptions,
  dirtyNotes,
  dirtyStructuralEdits,
  onEditType,
  onAddFieldInline,
  onAddEnumValueInline,
  onFieldDraftChange,
  onEnumValueDraftChange,
  onSaveStructuralEdit,
  onJumpToType,
  onSelectMember,
  onLocateMemberInTree,
  onNoteChange,
  onOpenContextMenu
}: {
  type: WorkspaceTypeView;
  workspaceTypes: WorkspaceTypeView[];
  selectedMemberId: string | null;
  loading: boolean;
  fieldTypeOptions: FieldTypeOption[];
  dirtyNotes: Record<string, string>;
  dirtyStructuralEdits: Record<string, DirtyStructuralEdit>;
  onEditType(): void;
  onAddFieldInline(type: WorkspaceTypeView, fieldType: string, fieldName: string): Promise<boolean>;
  onAddEnumValueInline(type: WorkspaceTypeView, valueName: string, valueNumber: string): Promise<boolean>;
  onFieldDraftChange(type: WorkspaceTypeView, field: WorkspaceFieldView, fieldType: string, fieldName: string): void;
  onEnumValueDraftChange(type: WorkspaceTypeView, value: WorkspaceEnumValueView, valueName: string, valueNumber: string): void;
  onSaveStructuralEdit(targetId: string): Promise<boolean>;
  onJumpToType(type: WorkspaceTypeView): void;
  onSelectMember(memberId: string): void;
  onLocateMemberInTree(type: WorkspaceTypeView, memberId: string): void;
  onNoteChange(targetId: string, value: string, savedValue: string): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
}): React.JSX.Element {
  const [addingField, setAddingField] = React.useState(false);
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [draftFieldType, setDraftFieldType] = React.useState("std::uint32_t");
  const [draftFieldName, setDraftFieldName] = React.useState("value");
  const [addingEnumValue, setAddingEnumValue] = React.useState(false);
  const [editingEnumValueId, setEditingEnumValueId] = React.useState<string | null>(null);
  const [draftEnumValueName, setDraftEnumValueName] = React.useState("NewValue");
  const [draftEnumValueNumber, setDraftEnumValueNumber] = React.useState("");

  React.useEffect(() => {
    setAddingField(false);
    setEditingFieldId(null);
    setDraftFieldType("std::uint32_t");
    setDraftFieldName("value");
    setAddingEnumValue(false);
    setEditingEnumValueId(null);
    setDraftEnumValueName("NewValue");
    setDraftEnumValueNumber("");
  }, [type.id]);

  function beginAddField(): void {
    setAddingField(true);
    setEditingFieldId(null);
    setDraftFieldType("std::uint32_t");
    setDraftFieldName(`field${type.fields.length + 1}`);
  }

  function beginEditField(field: WorkspaceFieldView): void {
    const edit = dirtyStructuralEdits[field.id];
    setAddingField(false);
    setEditingFieldId(field.id);
    setDraftFieldType(edit?.kind === "field" ? edit.fieldType : field.type);
    setDraftFieldName(edit?.kind === "field" ? edit.fieldName : field.name);
    onSelectMember(field.id);
  }

  function beginAddEnumValue(): void {
    setAddingEnumValue(true);
    setEditingEnumValueId(null);
    setDraftEnumValueName(`Value${type.values.length + 1}`);
    setDraftEnumValueNumber(nextInlineEnumValueNumber(type));
  }

  function nextInlineEnumValueNumber(enumType: WorkspaceTypeView): string {
    const values = enumType.values
      .map((value) => value.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return String(values.length === 0 ? 0 : Math.max(...values) + 1);
  }

  function beginEditEnumValue(value: WorkspaceEnumValueView): void {
    const edit = dirtyStructuralEdits[value.id];
    setAddingEnumValue(false);
    setEditingEnumValueId(value.id);
    setDraftEnumValueName(edit?.kind === "enum-value" ? edit.valueName : value.name);
    setDraftEnumValueNumber(edit?.kind === "enum-value" ? edit.valueNumber : value.value === undefined ? "" : String(value.value));
    onSelectMember(value.id);
  }

  async function saveAddedField(): Promise<void> {
    const ok = await onAddFieldInline(type, draftFieldType, draftFieldName);
    if (ok) setAddingField(false);
  }

  async function saveAddedEnumValue(): Promise<void> {
    const ok = await onAddEnumValueInline(type, draftEnumValueName, draftEnumValueNumber);
    if (ok) setAddingEnumValue(false);
  }

  function noteValue(target: { id: string; note?: string }): string {
    return dirtyNotes[target.id] ?? target.note ?? "";
  }

  function noteDirty(target: { id: string }): boolean {
    return dirtyNotes[target.id] !== undefined;
  }

  function noteEditor(target: { id: string; note?: string }, label: string, compact = false): React.JSX.Element {
    const dirty = noteDirty(target);
    return <div className={compact ? "inline-note-editor compact" : "inline-note-editor"}>
      <textarea
        aria-label={label}
        value={noteValue(target)}
        placeholder="记录语义说明、单位、范围、兼容性约束…"
        onChange={(event) => onNoteChange(target.id, event.target.value, target.note ?? "")}
      />
      <small className={dirty ? "dirty-hint" : "saved-hint"}>{dirty ? "未保存 · Ctrl+S" : "已同步"}</small>
    </div>;
  }

  function changeFieldDraft(field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string): void {
    setDraftFieldType(nextFieldType);
    setDraftFieldName(nextFieldName);
    onFieldDraftChange(type, field, nextFieldType, nextFieldName);
  }

  function changeEnumValueDraft(value: WorkspaceEnumValueView, nextValueName: string, nextValueNumber: string): void {
    setDraftEnumValueName(nextValueName);
    setDraftEnumValueNumber(nextValueNumber);
    onEnumValueDraftChange(type, value, nextValueName, nextValueNumber);
  }

  function fieldTypeDisplay(field: WorkspaceFieldView): React.JSX.Element {
    const edit = dirtyStructuralEdits[field.id];
    const fieldType = edit?.kind === "field" ? edit.fieldType : field.type;
    const referencedType = resolveWorkspaceTypeReference(workspaceTypes, fieldType, type.id);
    if (!referencedType) return <code>{fieldType}</code>;
    return <span
      className="type-link"
      title={`Ctrl+点击跳转到 ${referencedType.qualifiedName}`}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          onJumpToType(referencedType);
        }
      }}
    >
      {fieldType}
    </span>;
  }

  function selectMemberFromTable(event: React.MouseEvent, memberId: string): void {
    if (event.ctrlKey || event.metaKey) {
      onLocateMemberInTree(type, memberId);
      return;
    }
    onSelectMember(memberId);
  }

  const typeDirty = dirtyNotes[type.id] !== undefined
    || type.fields.some((field) => dirtyNotes[field.id] !== undefined || dirtyStructuralEdits[field.id] !== undefined)
    || type.values.some((value) => dirtyNotes[value.id] !== undefined || dirtyStructuralEdits[value.id] !== undefined);

  async function finishRowEditFromBlankClick(event: React.MouseEvent<HTMLDivElement>): Promise<void> {
    const target = event.target as HTMLElement;
    if (target.closest("table, button, input, textarea, .field-type-menu, .editor-title, .editor-note-card")) return;
    const editingId = editingFieldId ?? editingEnumValueId;
    if (!editingId) return;
    const dirty = dirtyStructuralEdits[editingId] !== undefined;
    if (dirty) {
      const shouldSave = window.confirm("当前行存在未保存的结构化更改，是否立即保存？");
      if (!shouldSave) return;
      const ok = await onSaveStructuralEdit(editingId);
      if (!ok) return;
    }
    setEditingFieldId(null);
    setEditingEnumValueId(null);
  }

  return <div className="editor" onMouseDown={(event) => { void finishRowEditFromBlankClick(event); }} onContextMenu={(event) => onOpenContextMenu(event, { kind: "type", type })}>
    <div className="editor-title">
      <div><p className="eyebrow">{type.kind}</p><h2>{type.name}</h2><p>{type.qualifiedName}</p></div>
      <div className="editor-actions">
        <span className={typeDirty ? "status dirty" : "status"}>{typeDirty ? "未保存 · Ctrl+S" : "AST 已同步"}</span>
        {type.kind === "struct" && <button className="inline-action" disabled={loading} onClick={beginAddField}>添加字段</button>}
        {type.kind === "enum" && <button className="inline-action" disabled={loading} onClick={beginAddEnumValue}>添加枚举项</button>}
        <button className="inline-action" onClick={onEditType}>{type.kind === "struct" ? "编辑 Struct" : "编辑 Enum"}</button>
      </div>
    </div>
    <section className="editor-note-card" aria-label={`${type.name} 注释编辑`}>
      <div>
        <h3>类型注释</h3>
        <p>注释会同步到 Header 上方的 <code>/// @brief</code>，并兼容读取旧 <code>@protovault-note:</code> 与常见 C++ 注释块。</p>
      </div>
      {noteEditor(type, `${type.name} 类型注释`)}
    </section>
    <div className="table-scroll">
    {type.kind === "struct" ? <table><thead><tr><th>字段</th><th>类型</th><th>注释</th><th>位置</th></tr></thead><tbody>
      {type.fields.map((field) => {
        const editing = editingFieldId === field.id;
        const edit = dirtyStructuralEdits[field.id];
        const displayName = edit?.kind === "field" ? edit.fieldName : field.name;
        const dirty = edit !== undefined || dirtyNotes[field.id] !== undefined;
        return <tr
          className={`${field.id === selectedMemberId ? "selected-row" : ""}${dirty ? " dirty-row" : ""}`.trim() || undefined}
          key={field.id}
          onClick={(event) => selectMemberFromTable(event, field.id)}
          onDoubleClick={() => beginEditField(field)}
          onContextMenu={(event) => onOpenContextMenu(event, { kind: "field", type, field })}
        >
          {editing
            ? <>
                <td><input className="table-input" aria-label="字段名称" value={draftFieldName} onChange={(event) => changeFieldDraft(field, draftFieldType, event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingFieldId(null); }} autoFocus /></td>
                <td><FieldTypeInput compact label="字段类型" value={draftFieldType} options={fieldTypeOptions} onChange={(value) => changeFieldDraft(field, value, draftFieldName)} /></td>
                <td>{noteEditor(field, `${field.name} 字段注释`, true)}</td>
                <td>{field.location ? `${field.location.line}:${field.location.column}` : "—"}</td>
              </>
            : <>
                <td>{displayName}</td>
                <td>{fieldTypeDisplay(field)}</td>
                <td>{noteEditor(field, `${field.name} 字段注释`, true)}</td>
                <td>{field.location ? `${field.location.line}:${field.location.column}` : "—"}</td>
              </>}
        </tr>;
      })}
      {addingField && <tr className="draft-row">
        <td><input className="table-input" aria-label="新增字段名称" value={draftFieldName} onChange={(event) => setDraftFieldName(event.target.value)} autoFocus /></td>
        <td><FieldTypeInput compact label="新增字段类型" value={draftFieldType} options={fieldTypeOptions} onChange={setDraftFieldType} /></td>
        <td>—</td>
        <td><div className="row-actions"><span>新增</span><button className="inline-action" disabled={loading} onClick={() => void saveAddedField()}>保存</button><button className="inline-action" disabled={loading} onClick={() => setAddingField(false)}>取消</button></div></td>
      </tr>}
    </tbody></table> : <table><thead><tr><th>枚举项</th><th>值</th><th>注释</th><th>位置</th></tr></thead><tbody>
      {type.values.map((value) => {
        const editing = editingEnumValueId === value.id;
        const edit = dirtyStructuralEdits[value.id];
        const displayName = edit?.kind === "enum-value" ? edit.valueName : value.name;
        const displayValue = edit?.kind === "enum-value" ? edit.valueNumber || "自动" : value.value ?? "自动";
        const dirty = edit !== undefined || dirtyNotes[value.id] !== undefined;
        return <tr
          className={`${value.id === selectedMemberId ? "selected-row" : ""}${dirty ? " dirty-row" : ""}`.trim() || undefined}
          key={value.id}
          onClick={(event) => selectMemberFromTable(event, value.id)}
          onDoubleClick={() => beginEditEnumValue(value)}
          onContextMenu={(event) => onOpenContextMenu(event, { kind: "enum-value", type, value })}
        >
          {editing
            ? <>
                <td><input className="table-input" aria-label="枚举项名称" value={draftEnumValueName} onChange={(event) => changeEnumValueDraft(value, event.target.value, draftEnumValueNumber)} onKeyDown={(event) => { if (event.key === "Escape") setEditingEnumValueId(null); }} autoFocus /></td>
                <td><input className="table-input mono" aria-label="枚举值" value={draftEnumValueNumber} onChange={(event) => changeEnumValueDraft(value, draftEnumValueName, event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingEnumValueId(null); }} placeholder="自动" /></td>
                <td>{noteEditor(value, `${value.name} 枚举项注释`, true)}</td>
                <td>{value.location ? `${value.location.line}:${value.location.column}` : "—"}</td>
              </>
            : <>
                <td>{displayName}</td>
                <td>{displayValue}</td>
                <td>{noteEditor(value, `${value.name} 枚举项注释`, true)}</td>
                <td>{value.location ? `${value.location.line}:${value.location.column}` : "—"}</td>
              </>}
        </tr>;
      })}
      {addingEnumValue && <tr className="draft-row">
        <td><input className="table-input" aria-label="新增枚举项名称" value={draftEnumValueName} onChange={(event) => setDraftEnumValueName(event.target.value)} autoFocus /></td>
        <td><input className="table-input mono" aria-label="新增枚举值" value={draftEnumValueNumber} onChange={(event) => setDraftEnumValueNumber(event.target.value)} placeholder="自动" /></td>
        <td>—</td>
        <td><div className="row-actions"><span>新增</span><button className="inline-action" disabled={loading} onClick={() => void saveAddedEnumValue()}>保存</button><button className="inline-action" disabled={loading} onClick={() => setAddingEnumValue(false)}>取消</button></div></td>
      </tr>}
    </tbody></table>}
    </div>
  </div>;
}

function WorkspaceReportPanel({ report, workspaceRoot, onClose }: {
  report: WorkspaceReportState;
  workspaceRoot: string;
  onClose(): void;
}): React.JSX.Element {
  return <section className="report-panel" aria-label="协议报告">
    <div className="report-panel-title">
      <div>
        <p className="eyebrow">REPORT</p>
        <h2>{report.kind === "lint" ? "协议 Lint"
          : report.kind === "document" ? "协议文档"
            : report.kind === "snapshot" ? "协议快照"
              : "语义 Diff"}</h2>
      </div>
      <button className="inline-action" onClick={onClose}>关闭报告</button>
    </div>

    {report.kind === "lint" && <>
      <div className="report-summary">
        <span>总计 {report.report.issueCount}</span>
        <span>错误 {report.report.errorCount}</span>
        <span>警告 {report.report.warningCount}</span>
        <span>建议 {report.report.suggestionCount}</span>
      </div>
      {report.report.issues.length === 0
        ? <p className="report-empty">没有发现 Lint 问题。</p>
        : <div className="report-list">
            {report.report.issues.slice(0, 80).map((issue) => <article className={`report-item ${issue.severity}`} key={issue.id}>
              <strong>{issue.severity.toUpperCase()} · {issue.ruleId}</strong>
              <p>{issue.message}</p>
              {issue.file && <small>{relativeDisplayPath(workspaceRoot, issue.file)}{issue.line ? `:${issue.line}` : ""}</small>}
            </article>)}
          </div>}
    </>}

    {report.kind === "document" && <>
      <p>Markdown 协议文档已生成：</p>
      <code>{report.report.relativePath}</code>
      <pre className="report-preview">{report.report.content.slice(0, 4000)}</pre>
    </>}

    {report.kind === "snapshot" && <>
      <div className="report-summary">
        <span>{report.report.typeCount} Types</span>
        <span>{report.report.fileCount} Headers</span>
      </div>
      <p>快照已写入：</p>
      <code>{report.report.relativePath}</code>
    </>}

    {report.kind === "diff" && <>
      <div className="report-summary">
        <span>变化 {report.report.changeCount}</span>
        <span>Breaking {report.report.breakingCount}</span>
        <span>Compatible {report.report.compatibleCount}</span>
        <span>Review {report.report.reviewCount}</span>
      </div>
      <p>{report.report.baseSnapshot ? `基线：${report.report.baseSnapshot.relativePath}` : "暂无历史基线；已创建当前快照。"}</p>
      {report.report.changes.length === 0
        ? <p className="report-empty">没有语义变化。</p>
        : <div className="report-list">
            {report.report.changes.map((change) => <article className={`report-item ${change.severity}`} key={change.id}>
              <strong>{change.severity.toUpperCase()} · {change.kind}</strong>
              <p>{change.message}</p>
            </article>)}
          </div>}
    </>}
  </section>;
}

function ProtocolGraphView({ workspace, selectedTypeId, selectedFilePath, onSelectNode, onOpenNode, onClose }: {
  workspace: WorkspaceView;
  selectedTypeId: string | null;
  selectedFilePath: string | null;
  onSelectNode(node: ProtocolGraphNode): void;
  onOpenNode(node: ProtocolGraphNode): void;
  onClose(): void;
}): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderOptionsRef = React.useRef({
    selectedTypeId: null as string | null,
    selectedFilePath: null as string | null,
    focusNodeId: null as string | null,
    relationDepth: new Map<string, number>(),
    searchQuery: "",
    searchMatches: new Set<string>()
  });
  const simulationRef = React.useRef<{
    nodes: GraphSimNode[];
    edges: GraphSimEdge[];
    hovered: GraphSimNode | null;
    draggingNode: GraphSimNode | null;
    panning: boolean;
    lastX: number;
    lastY: number;
    moved: boolean;
    panX: number;
    panY: number;
    zoom: number;
  } | null>(null);
  const [hoveredLabel, setHoveredLabel] = React.useState<string | null>(null);
  const [graphSearchQuery, setGraphSearchQuery] = React.useState("");
  const [graphMode, setGraphMode] = React.useState<ProtocolGraphMode>("dependency");
  const graph = React.useMemo(() => buildProtocolGraph(workspace, graphMode), [workspace, graphMode]);
  const focusedNodeId = selectedTypeId ? `type:${selectedTypeId}` : selectedFilePath ? `file:${selectedFilePath}` : null;
  const relationDepth = React.useMemo(() => buildGraphRelationDepth(graph.edges, focusedNodeId), [graph.edges, focusedNodeId]);
  const normalizedGraphSearch = graphSearchQuery.trim().toLowerCase();
  const graphSearchMatches = React.useMemo(() => normalizedGraphSearch
    ? new Set(graph.nodes.filter((node) => graphNodeSearchText(node).includes(normalizedGraphSearch)).map((node) => node.id))
    : new Set<string>(), [graph.nodes, normalizedGraphSearch]);
  React.useEffect(() => {
    renderOptionsRef.current = {
      selectedTypeId,
      selectedFilePath,
      focusNodeId: focusedNodeId,
      relationDepth,
      searchQuery: normalizedGraphSearch,
      searchMatches: graphSearchMatches
    };
  }, [focusedNodeId, graphSearchMatches, normalizedGraphSearch, relationDepth, selectedFilePath, selectedTypeId]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes: GraphSimNode[] = graph.nodes.map((node) => ({
      ...node,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: graphNodeRadius(node),
      screenX: 0,
      screenY: 0,
      screenRadius: 0
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges: GraphSimEdge[] = graph.edges.flatMap((edge) => {
      const source = byId.get(edge.from);
      const target = byId.get(edge.to);
      return source && target ? [{ ...edge, source, target }] : [];
    });
    simulationRef.current = { nodes, edges, hovered: null, draggingNode: null, panning: false, lastX: 0, lastY: 0, moved: false, panX: 0, panY: 0, zoom: 1 };
    let animationId = 0;
    let lastTime = performance.now();

    function frame(now: number): void {
      const sim = simulationRef.current;
      if (!sim || !canvas) return;
      const delta = Math.min(32, now - lastTime);
      lastTime = now;
      resizeCanvas(canvas);
      tickGraph(sim.nodes, sim.edges, delta / 16.67);
      const renderOptions = renderOptionsRef.current;
      drawGraph(canvas, sim.nodes, sim.edges, {
        panX: sim.panX,
        panY: sim.panY,
        zoom: sim.zoom,
        selectedTypeId: renderOptions.selectedTypeId,
        selectedFilePath: renderOptions.selectedFilePath,
        focusNodeId: renderOptions.focusNodeId,
        relationDepth: renderOptions.relationDepth,
        searchQuery: renderOptions.searchQuery,
        searchMatches: renderOptions.searchMatches,
        hoveredId: sim.hovered?.id ?? null,
        time: now
      });
      animationId = requestAnimationFrame(frame);
    }

    animationId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationId);
  }, [graph]);

  function hitTest(clientX: number, clientY: number): GraphSimNode | null {
    const canvas = canvasRef.current;
    const sim = simulationRef.current;
    if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return [...sim.nodes]
      .sort((a, b) => b.z - a.z)
      .find((node) => {
        const radius = Math.max(12, node.screenRadius + 7);
        return distance(x, y, node.screenX, node.screenY) <= radius;
      }) ?? null;
  }

  function setHover(node: GraphSimNode | null): void {
    const sim = simulationRef.current;
    if (sim) sim.hovered = node;
    const next = node ? `${node.kind === "file" ? "Header" : node.kind} · ${node.label}` : null;
    setHoveredLabel((current) => current === next ? current : next);
  }

  function inverseProject(clientX: number, clientY: number, node: GraphSimNode): { x: number; y: number } {
    const canvas = canvasRef.current;
    const sim = simulationRef.current;
    if (!canvas || !sim) return { x: node.x, y: node.y };
    const rect = canvas.getBoundingClientRect();
    const scale = perspectiveScale(node.z);
    return {
      x: (clientX - rect.left - rect.width / 2 - sim.panX) / (sim.zoom * scale),
      y: (clientY - rect.top - rect.height / 2 - sim.panY) / (sim.zoom * scale)
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const sim = simulationRef.current;
    if (!canvas || !sim) return;
    const node = hitTest(event.clientX, event.clientY);
    sim.draggingNode = node;
    sim.panning = !node;
    sim.lastX = event.clientX;
    sim.lastY = event.clientY;
    sim.moved = false;
    if (node) setHover(node);
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const sim = simulationRef.current;
    if (!sim) return;
    const dx = event.clientX - sim.lastX;
    const dy = event.clientY - sim.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) sim.moved = true;
    if (sim.draggingNode) {
      const next = inverseProject(event.clientX, event.clientY, sim.draggingNode);
      sim.draggingNode.x = next.x;
      sim.draggingNode.y = next.y;
      sim.draggingNode.vx = 0;
      sim.draggingNode.vy = 0;
    } else if (sim.panning) {
      sim.panX += dx;
      sim.panY += dy;
    } else {
      setHover(hitTest(event.clientX, event.clientY));
    }
    sim.lastX = event.clientX;
    sim.lastY = event.clientY;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const sim = simulationRef.current;
    if (!canvas || !sim) return;
    const node = sim.draggingNode ?? (!sim.moved ? hitTest(event.clientX, event.clientY) : null);
    sim.draggingNode = null;
    sim.panning = false;
    canvas.releasePointerCapture(event.pointerId);
    if (node && !sim.moved) onSelectNode(node);
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const node = hitTest(event.clientX, event.clientY);
    if (node) onOpenNode(node);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const sim = simulationRef.current;
    if (!sim) return;
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    sim.zoom = clamp(sim.zoom * factor, 0.45, 2.8);
  }

  return <section className="graph-view" aria-label="协议关系图谱">
    <div className="graph-title">
      <div>
        <p className="eyebrow">GRAPH VIEW</p>
        <h2>协议关系图谱</h2>
        <p>Canvas 力导向视图：拖拽节点、滚轮缩放、拖动画布平移；单击定位左侧树图，双击打开对应 tab。</p>
      </div>
      <div className="graph-title-actions">
        <div className="graph-mode-toggle" role="group" aria-label="图谱模式">
          <button className={graphMode === "dependency" ? "active" : ""} onClick={() => setGraphMode("dependency")}>依赖</button>
          <button className={graphMode === "data-flow" ? "active" : ""} onClick={() => setGraphMode("data-flow")}>数据流</button>
        </div>
        <input
          aria-label="图谱搜索"
          value={graphSearchQuery}
          placeholder="搜索类型 / Header / 字段引用…"
          onChange={(event) => setGraphSearchQuery(event.target.value)}
        />
        <button className="inline-action" onClick={onClose}>返回工作台</button>
      </div>
    </div>
    <div className="graph-canvas">
      <canvas
        ref={canvasRef}
        aria-label="协议关系图谱画布"
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => setHover(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <div className="graph-floating-tools" aria-hidden="true">
        <span>滚轮缩放</span>
        <span>拖拽节点</span>
        <span>双击打开</span>
      </div>
      {hoveredLabel && <div className="graph-hover-card" role="status">{hoveredLabel}</div>}
    </div>
    <div className="graph-legend">
      <span><i className="file-dot" /> Header</span>
      <span><i className="struct-dot" /> Struct</span>
      <span><i className="enum-dot" /> Enum</span>
      {graphMode === "data-flow" && <span><i className="producer-dot" /> 生产/消费节点</span>}
      <span><i className="risk-dot warning" /> 布局/质量关注</span>
      <span><i className="risk-dot critical" /> 高风险</span>
      <span><i className="edge-dot outgoing" /> 选中节点向外引用/包含</span>
      <span><i className="edge-dot incoming" /> 其他节点指向当前节点</span>
    </div>
    <div className="graph-node-shortcuts" aria-label="图谱节点索引">
      {graph.nodes
        .filter((node) => !normalizedGraphSearch || graphSearchMatches.has(node.id))
        .sort((a, b) => b.metrics.impactScore - a.metrics.impactScore)
        .map((node) => <button
        key={node.id}
        aria-label={`图谱节点 ${node.kind} ${node.label}`}
        onClick={() => onSelectNode(node)}
        onDoubleClick={() => onOpenNode(node)}
      >{graphNodeShortKind(node)} · {node.label} · {node.metrics.impactScore}</button>)}
    </div>
  </section>;
}

function graphNodeShortKind(node: ProtocolGraphNode): string {
  if (node.kind === "file") return "H";
  if (node.kind === "struct") return "S";
  if (node.kind === "enum") return "E";
  return node.kind === "producer" ? "P" : "C";
}

function buildProtocolGraph(workspace: WorkspaceView, mode: ProtocolGraphMode): { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] } {
  const files = workspace.files;
  const types = workspace.types;
  const fileRadius = 330;
  const typeRadius = Math.max(115, Math.min(240, 105 + types.length * 4));
  const emptyMetrics: GraphNodeMetrics = {
    inboundReferences: 0,
    outboundReferences: 0,
    impactScore: 1,
    diagnosticCount: 0,
    metadataMissingCount: 0,
    layoutRisk: "normal",
    layoutRiskLabel: "无明显风险",
    paddingRatio: 0
  };
  const nodes: ProtocolGraphNode[] = [
    ...(mode === "dependency" ? files.map((file, index) => {
      const point = radialPoint(index, Math.max(files.length, 1), fileRadius, 0, 0, -Math.PI / 2);
      return { id: `file:${file.path}`, kind: "file" as const, label: file.relativePath.split("/").at(-1) ?? file.relativePath, file, ...point, z: Math.sin(index * 1.9) * 90, metrics: { ...emptyMetrics } };
    }) : []),
    ...types.map((type, index) => {
      const point = radialPoint(index, Math.max(types.length, 1), typeRadius, 0, 0, -Math.PI / 2 + Math.PI / Math.max(types.length, 2));
      return { id: `type:${type.id}`, kind: type.kind, label: type.name, type, ...point, z: Math.cos(index * 1.35) * 70, metrics: { ...emptyMetrics } };
    })
  ];
  const edges: ProtocolGraphEdge[] = [];
  if (mode === "dependency") for (const type of types) {
    const sourceTypeId = `type:${type.id}`;
    const ownerFile = files.find((file) => file.path === type.file);
    if (ownerFile) {
      edges.push({ id: `contains:${ownerFile.path}:${type.id}`, from: `file:${ownerFile.path}`, to: sourceTypeId, label: "contains", kind: "contains" });
    }
    if (type.kind !== "struct") continue;
    for (const field of type.fields) {
      const normalized = normalizeFieldTypeValue(field.type);
      const target = normalized ? resolveWorkspaceTypeReference(types, normalized.coreType, type.id) : null;
      if (!target) continue;
      edges.push({ id: `ref:${field.id}:${target.id}`, from: sourceTypeId, to: `type:${target.id}`, label: field.name, kind: "references" });
    }
  }
  if (mode === "data-flow") {
    const actorNodes = new Map<string, ProtocolGraphNode>();
    function actorNode(label: string, kind: "producer" | "consumer", index: number): ProtocolGraphNode {
      const id = `${kind}:${label}`;
      const existing = actorNodes.get(id);
      if (existing) return existing;
      const point = radialPoint(index, Math.max(6, actorNodes.size + 6), kind === "producer" ? 355 : 420, 0, 0, kind === "producer" ? -Math.PI * 0.8 : Math.PI * 0.2);
      const node: ProtocolGraphNode = {
        id,
        kind,
        label,
        ...point,
        z: kind === "producer" ? -80 + actorNodes.size * 4 : 80 - actorNodes.size * 3,
        metrics: { ...emptyMetrics, impactScore: 2, layoutRiskLabel: kind === "producer" ? "生产节点" : "消费节点" }
      };
      actorNodes.set(id, node);
      return node;
    }
    let actorIndex = 0;
    for (const type of types) {
      const flow = type.dataFlow;
      if (!flow) continue;
      for (const producer of flow.producers) {
        const actor = actorNode(producer, "producer", actorIndex);
        actorIndex += 1;
        edges.push({ id: `flow:${actor.id}:type:${type.id}`, from: actor.id, to: `type:${type.id}`, label: "produces", kind: "flow" });
      }
      for (const consumer of flow.consumers) {
        const actor = actorNode(consumer, "consumer", actorIndex);
        actorIndex += 1;
        edges.push({ id: `flow:type:${type.id}:${actor.id}`, from: `type:${type.id}`, to: actor.id, label: "consumes", kind: "flow" });
      }
    }
    nodes.push(...actorNodes.values());
  }
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind === "contains") continue;
    inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
    outbound.set(edge.from, (outbound.get(edge.from) ?? 0) + 1);
  }
  for (const node of nodes) {
    if (node.kind === "file") {
      const containedTypes = types.filter((type) => type.file === node.file.path);
      const diagnosticCount = diagnosticsForFile(workspace, node.file.path).length;
      const childImpact = containedTypes.reduce((sum, type) => sum + (inbound.get(`type:${type.id}`) ?? 0) * 3 + (outbound.get(`type:${type.id}`) ?? 0), 0);
      node.metrics = {
        inboundReferences: 0,
        outboundReferences: containedTypes.length,
        impactScore: Math.max(1, childImpact + containedTypes.length + diagnosticCount * 2),
        diagnosticCount,
        metadataMissingCount: containedTypes.reduce((sum, type) => sum + countMissingMetadata(type), 0),
        layoutRisk: diagnosticCount > 0 ? "warning" : "normal",
        layoutRiskLabel: diagnosticCount > 0 ? `${diagnosticCount} 个扫描诊断` : "Header 分组",
        paddingRatio: 0
      };
      continue;
    }
    if (node.kind === "producer" || node.kind === "consumer") {
      const inboundReferences = inbound.get(node.id) ?? 0;
      const outboundReferences = outbound.get(node.id) ?? 0;
      node.metrics = {
        inboundReferences,
        outboundReferences,
        impactScore: Math.max(2, inboundReferences * 2 + outboundReferences * 2),
        diagnosticCount: 0,
        metadataMissingCount: 0,
        layoutRisk: "normal",
        layoutRiskLabel: node.kind === "producer" ? "生产节点" : "消费节点",
        paddingRatio: 0
      };
      continue;
    }
    if (!isProtocolTypeNode(node)) continue;
    const diagnosticCount = diagnosticsForFile(workspace, node.type.file).length;
    const layoutRisk = riskForType(node.type, diagnosticCount);
    const inboundReferences = inbound.get(node.id) ?? 0;
    const outboundReferences = outbound.get(node.id) ?? 0;
    const riskWeight = layoutRisk.level === "critical" ? 5 : layoutRisk.level === "warning" ? 2 : 0;
    const metadataMissingCount = countMissingMetadata(node.type);
    node.metrics = {
      inboundReferences,
      outboundReferences,
      impactScore: Math.max(1, inboundReferences * 3 + outboundReferences + diagnosticCount * 2 + riskWeight + Math.min(metadataMissingCount, 4)),
      diagnosticCount,
      metadataMissingCount,
      layoutRisk: layoutRisk.level,
      layoutRiskLabel: layoutRisk.label,
      paddingRatio: layoutRisk.paddingRatio
    };
  }
  return { nodes, edges };
}

function diagnosticsForFile(workspace: WorkspaceView, filePath: string): WorkspaceView["diagnostics"] {
  const normalized = filePath.replaceAll("\\", "/");
  return workspace.diagnostics.filter((diagnostic) => diagnostic.file?.replaceAll("\\", "/") === normalized);
}

function countMissingMetadata(type: WorkspaceTypeView): number {
  const own = type.note?.trim() ? 0 : 1;
  if (type.kind === "struct") return own + type.fields.filter((field) => !field.note?.trim()).length;
  return own + type.values.filter((value) => !value.note?.trim()).length;
}

function riskForType(type: WorkspaceTypeView, diagnosticCount: number): { level: GraphRiskLevel; label: string; paddingRatio: number } {
  if (diagnosticCount > 0) return { level: "critical", label: `${diagnosticCount} 个扫描诊断`, paddingRatio: 0 };
  const layout = type.layout;
  if (!layout) return { level: "normal", label: "无布局数据", paddingRatio: 0 };
  if (layout.partial) return { level: "warning", label: "布局部分解析", paddingRatio: layout.size ? layout.paddingBytes / layout.size : 0 };
  const paddingRatio = layout.size ? layout.paddingBytes / layout.size : 0;
  if (paddingRatio >= 0.35) return { level: "critical", label: `Padding ${Math.round(paddingRatio * 100)}%`, paddingRatio };
  if (paddingRatio >= 0.2 || layout.paddingBytes >= 16) return { level: "warning", label: `Padding ${formatBytes(layout.paddingBytes)}`, paddingRatio };
  return { level: "normal", label: "布局稳定", paddingRatio };
}

function graphNodeRadius(node: ProtocolGraphNode): number {
  const base = node.kind === "file" ? 4.8 : node.kind === "struct" ? 6.8 : node.kind === "enum" ? 6 : 6.4;
  return clamp(base + Math.sqrt(node.metrics.impactScore) * 1.7, base, node.kind === "file" ? 13 : 19);
}

function graphNodeSearchText(node: ProtocolGraphNode): string {
  if (node.kind === "file") return `${node.label} ${node.file.relativePath}`.toLowerCase();
  if (node.kind === "producer" || node.kind === "consumer") return `${node.label} ${node.kind === "producer" ? "生产节点 producer" : "消费节点 consumer"}`.toLowerCase();
  if (!isProtocolTypeNode(node)) return node.label.toLowerCase();
  const memberText = node.type.kind === "struct"
    ? node.type.fields.map((field) => `${field.name} ${field.type}`).join(" ")
    : node.type.values.map((value) => value.name).join(" ");
  return `${node.label} ${node.type.name} ${node.type.qualifiedName} ${node.type.file} ${memberText}`.toLowerCase();
}

function isProtocolTypeNode(node: ProtocolGraphNode): node is Extract<ProtocolGraphNode, { kind: "struct" | "enum" }> {
  return node.kind === "struct" || node.kind === "enum";
}

function buildGraphRelationDepth(edges: ProtocolGraphEdge[], focusNodeId: string | null): Map<string, number> {
  const depth = new Map<string, number>();
  if (!focusNodeId) return depth;
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind === "contains") continue;
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  depth.set(focusNodeId, 0);
  const queue = [focusNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentDepth = depth.get(current) ?? 0;
    if (currentDepth >= 2) continue;
    for (const neighbor of neighbors.get(current) ?? []) {
      if (depth.has(neighbor)) continue;
      depth.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }
  return depth;
}

function radialPoint(index: number, total: number, radius: number, centerX: number, centerY: number, offset = 0): { x: number; y: number } {
  const angle = offset + (Math.PI * 2 * index) / total;
  return {
    x: Math.round(centerX + Math.cos(angle) * radius),
    y: Math.round(centerY + Math.sin(angle) * radius)
  };
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function tickGraph(nodes: GraphSimNode[], edges: GraphSimEdge[], intensity: number): void {
  const repulsion = 4200;
  for (const node of nodes) {
    node.vx += -node.x * 0.0012 * intensity;
    node.vy += -node.y * 0.0012 * intensity;
    node.vz += -node.z * 0.0008 * intensity;
  }
  for (let index = 0; index < nodes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const a = nodes[index];
      const b = nodes[otherIndex];
      const dx = a.x - b.x || 0.01;
      const dy = a.y - b.y || 0.01;
      const dz = (a.z - b.z) * 0.35;
      const squared = Math.max(70, dx * dx + dy * dy + dz * dz);
      const force = (repulsion / squared) * intensity;
      const distanceValue = Math.sqrt(squared);
      const fx = (dx / distanceValue) * force;
      const fy = (dy / distanceValue) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }
  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    const distanceValue = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz * 0.25));
    const desired = edge.kind === "contains" ? 145 : 118;
    const strength = edge.kind === "contains" ? 0.004 : 0.012;
    const force = (distanceValue - desired) * strength * intensity;
    const fx = (dx / distanceValue) * force;
    const fy = (dy / distanceValue) * force;
    const fz = (dz / distanceValue) * force * 0.5;
    source.vx += fx;
    source.vy += fy;
    source.vz += fz;
    target.vx -= fx;
    target.vy -= fy;
    target.vz -= fz;
  }
  for (const node of nodes) {
    node.vx *= 0.88;
    node.vy *= 0.88;
    node.vz *= 0.9;
    node.x += node.vx * intensity;
    node.y += node.vy * intensity;
    node.z = clamp(node.z + node.vz * intensity, -240, 240);
  }
}

function drawGraph(canvas: HTMLCanvasElement, nodes: GraphSimNode[], edges: GraphSimEdge[], options: {
  panX: number;
  panY: number;
  zoom: number;
  selectedTypeId: string | null;
  selectedFilePath: string | null;
  focusNodeId: string | null;
  relationDepth: Map<string, number>;
  searchQuery: string;
  searchMatches: Set<string>;
  hoveredId: string | null;
  time: number;
}): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const gradient = context.createRadialGradient(width * 0.5, height * 0.38, 20, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
  gradient.addColorStop(0, "rgba(24, 34, 49, 0.78)");
  gradient.addColorStop(0.55, "rgba(8, 12, 18, 0.98)");
  gradient.addColorStop(1, "rgba(5, 8, 12, 1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGraphBackdrop(context, width, height, options.time);
  context.lineCap = "round";
  context.lineJoin = "round";

  const projected = nodes
    .map((node) => ({ node, ...projectNode(node, width, height, options.panX, options.panY, options.zoom, options.time) }))
    .sort((a, b) => a.depth - b.depth);
  for (const item of projected) {
    item.node.screenX = item.x;
    item.node.screenY = item.y;
    item.node.screenRadius = item.radius;
  }

  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    const sourceRelevance = graphNodeRelevance(source, options);
    const targetRelevance = graphNodeRelevance(target, options);
    const edgeRelevance = Math.min(sourceRelevance, targetRelevance);
    const edgeFocus = graphEdgeFocus(edge, options.focusNodeId);
    const alpha = edgeFocus === "none"
      ? edge.kind === "flow" ? 0.66 : edge.kind === "references" ? 0.5 : 0.18
      : 0.96;
    const stroke = graphEdgeStroke(edge, edgeFocus, alpha * edgeRelevance);
    const widthScale = edgeFocus === "none" ? 1 : 1.85;
    context.beginPath();
    context.moveTo(source.screenX, source.screenY);
    context.lineTo(target.screenX, target.screenY);
    context.strokeStyle = stroke;
    context.lineWidth = (edge.kind === "flow" ? 1.55 : edge.kind === "references" ? 1.1 : 0.7) * (edgeRelevance > 0.9 ? 1.25 : 1) * widthScale;
    context.stroke();
    if (edge.kind !== "contains" || edgeFocus !== "none") {
      drawGraphArrow(context, source.screenX, source.screenY, target.screenX, target.screenY, target.screenRadius + 3, stroke, 7 + context.lineWidth);
    }
  }

  for (const item of projected) {
    const node = item.node;
    const selected = node.kind === "file"
      ? node.file.path === options.selectedFilePath
      : isProtocolTypeNode(node) && node.type.id === options.selectedTypeId;
    const hovered = node.id === options.hoveredId;
    const relevance = graphNodeRelevance(node, options);
    context.globalAlpha = relevance;
    const focused = options.focusNodeId === node.id || selected || hovered;
    context.beginPath();
    context.arc(item.x, item.y, item.radius + (selected ? 4 : hovered ? 2 : 0), 0, Math.PI * 2);
    context.fillStyle = selected ? "rgba(229, 173, 85, 0.16)" : hovered ? "rgba(168, 196, 236, 0.12)" : "rgba(0, 0, 0, 0.22)";
    context.fill();
    if (node.metrics.layoutRisk !== "normal") {
      context.beginPath();
      context.arc(item.x, item.y, item.radius + 5, 0, Math.PI * 2);
      context.strokeStyle = node.metrics.layoutRisk === "critical" ? "rgba(230, 82, 75, 0.92)" : "rgba(229, 173, 85, 0.86)";
      context.lineWidth = selected ? 2.4 : 1.6;
      context.stroke();
    }
    context.beginPath();
    context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    context.fillStyle = graphNodeFill(node);
    context.shadowColor = selected ? "rgba(229, 173, 85, 0.55)" : "transparent";
    context.shadowBlur = selected ? 10 : 0;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = selected ? 2.1 : hovered ? 1.5 : 1;
    context.strokeStyle = selected ? "#e5ad55" : hovered ? "#a8c4ec" : "rgba(7, 10, 15, 0.92)";
    context.stroke();
    if (focused) {
      context.beginPath();
      context.arc(item.x, item.y, item.radius + 4.5, 0, Math.PI * 2);
      context.strokeStyle = selected ? "rgba(229, 173, 85, 0.58)" : "rgba(168, 196, 236, 0.42)";
      context.lineWidth = 1.2;
      context.stroke();
    }
    if (node.metrics.diagnosticCount > 0 || node.metrics.layoutRisk === "critical") {
      const badgeText = node.metrics.diagnosticCount > 0 ? String(node.metrics.diagnosticCount) : "!";
      context.beginPath();
      context.arc(item.x + item.radius * 0.72, item.y - item.radius * 0.72, Math.max(4, item.radius * 0.42), 0, Math.PI * 2);
      context.fillStyle = node.metrics.diagnosticCount > 0 ? "#e6524b" : "#d46a58";
      context.fill();
      context.fillStyle = "#071016";
      context.font = `${Math.max(7, item.radius * 0.55)}px Segoe UI, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(badgeText, item.x + item.radius * 0.72, item.y - item.radius * 0.72);
    }
    const labelVisible = hovered || selected || item.scale > 0.94 || (node.kind !== "file" && relevance > 0.85);
    if (labelVisible) {
      context.font = `${Math.max(10, Math.min(13, 10.5 * item.scale))}px Segoe UI, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineWidth = 2.25;
      context.strokeStyle = "rgba(5, 8, 12, 0.96)";
      context.fillStyle = hovered || selected ? "#f3f7ff" : "rgba(205, 214, 226, 0.88)";
      const label = node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label;
      context.strokeText(label, item.x, item.y + item.radius + 6);
      context.fillText(label, item.x, item.y + item.radius + 6);
    }
    context.globalAlpha = 1;
  }
}

function graphNodeRelevance(node: GraphSimNode, options: {
  focusNodeId: string | null;
  relationDepth: Map<string, number>;
  searchQuery: string;
  searchMatches: Set<string>;
}): number {
  if (options.searchQuery && !options.searchMatches.has(node.id)) return 0.16;
  if (!options.focusNodeId) return 1;
  const depth = options.relationDepth.get(node.id);
  if (node.id === options.focusNodeId) return 1;
  if (depth === 1) return 0.95;
  if (depth === 2) return 0.45;
  return 0.12;
}

function graphEdgeFocus(edge: GraphSimEdge, focusNodeId: string | null): "outgoing" | "incoming" | "none" {
  if (!focusNodeId) return "none";
  if (edge.from === focusNodeId) return "outgoing";
  if (edge.to === focusNodeId) return "incoming";
  return "none";
}

function graphEdgeStroke(edge: GraphSimEdge, focus: "outgoing" | "incoming" | "none", alpha: number): string {
  if (focus === "outgoing") return `rgba(86, 188, 170, ${alpha})`;
  if (focus === "incoming") return `rgba(229, 173, 85, ${alpha})`;
  if (edge.kind === "flow") return `rgba(86, 188, 170, ${alpha})`;
  if (edge.kind === "references") return `rgba(172, 78, 74, ${alpha})`;
  return `rgba(104, 122, 151, ${alpha})`;
}

function graphNodeFill(node: GraphSimNode): string {
  if (node.kind === "file") return "#8b99ab";
  if (node.kind === "struct") return "#d6dde8";
  if (node.kind === "enum") return "#d9ad58";
  if (node.kind === "producer") return "#42c6b0";
  return "#8b7cf6";
}

function drawGraphArrow(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  targetInset: number,
  color: string,
  size: number
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const tipX = toX - Math.cos(angle) * targetInset;
  const tipY = toY - Math.sin(angle) * targetInset;
  context.save();
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(tipX - Math.cos(angle - Math.PI / 6) * size, tipY - Math.sin(angle - Math.PI / 6) * size);
  context.lineTo(tipX - Math.cos(angle + Math.PI / 6) * size, tipY - Math.sin(angle + Math.PI / 6) * size);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function drawGraphBackdrop(context: CanvasRenderingContext2D, width: number, height: number, time: number): void {
  context.save();
  for (let index = 0; index < 48; index += 1) {
    const x = ((index * 97) % Math.max(1, width)) + Math.sin(time / 1800 + index) * 1.5;
    const y = ((index * 53) % Math.max(1, height)) + Math.cos(time / 2200 + index * 0.7) * 1.5;
    context.beginPath();
    context.arc(x, y, index % 9 === 0 ? 1 : 0.5, 0, Math.PI * 2);
    context.fillStyle = index % 9 === 0 ? "rgba(148, 166, 190, 0.14)" : "rgba(148, 166, 190, 0.06)";
    context.fill();
  }
  context.restore();
}

function projectNode(node: GraphSimNode, width: number, height: number, panX: number, panY: number, zoom: number, time: number): {
  x: number;
  y: number;
  radius: number;
  scale: number;
  depth: number;
} {
  const wave = Math.sin(time / 1300 + node.x * 0.006 + node.y * 0.004) * 12;
  const scale = perspectiveScale(node.z + wave);
  return {
    x: width / 2 + node.x * scale * zoom + panX,
    y: height / 2 + node.y * scale * zoom + panY,
    radius: Math.max(3.5, node.radius * scale * zoom),
    scale,
    depth: node.z + wave
  };
}

function perspectiveScale(z: number): number {
  return clamp(720 / (720 + z), 0.58, 1.52);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function relativeDisplayPath(root: string, file: string): string {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedFile = file.replaceAll("\\", "/");
  return normalizedFile.startsWith(`${normalizedRoot}/`) ? normalizedFile.slice(normalizedRoot.length + 1) : normalizedFile;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function SourceViewer({ file, content, diagnostics, loading, onContentChange, onSaveContent, onEditHeader, onOpenContextMenu }: {
  file: WorkspaceView["files"][number];
  content: string;
  diagnostics: WorkspaceView["diagnostics"];
  loading: boolean;
  onContentChange(content: string): void;
  onSaveContent(file: WorkspaceFileView, content: string): Promise<boolean>;
  onEditHeader(): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
}): React.JSX.Element {
  const dirty = content !== file.content;

  async function save(): Promise<void> {
    await onSaveContent(file, content);
  }

  return <div className="source-viewer" onContextMenu={(event) => onOpenContextMenu(event, { kind: "file", file })}>
    <div className="editor-title"><div><p className="eyebrow">Header Source</p><h2>{file.relativePath.split("/").at(-1)}</h2><p>{file.includes.length} 个 include 依赖 · {diagnostics.length} 个源码问题</p></div><div className="editor-actions"><span className={dirty ? "status dirty" : diagnostics.length > 0 ? "status error" : "status"}>{dirty ? "源码未保存" : diagnostics.length > 0 ? "源码需修复" : "源码已同步"}</span><button className="inline-action" disabled={loading || !dirty} onClick={() => void save()}>保存源码</button><button className="inline-action" onClick={onEditHeader}>Header 操作</button></div></div>
    <CppSourceEditor value={content} diagnostics={diagnostics} onChange={onContentChange} />
    {diagnostics.length > 0 && <div className="source-diagnostics" role="region" aria-label="源码诊断">
      {diagnostics.map((diagnostic, index) => <button key={index} type="button">
        <strong>{diagnostic.severity.toUpperCase()}</strong>
        <span>{diagnostic.line ? `${diagnostic.line}:${diagnostic.column ?? 1}` : "—"}</span>
        <small>{diagnostic.message.split(/\r?\n/).find((line) => /(?:error|warning):/.test(line)) ?? diagnostic.message}</small>
      </button>)}
    </div>}
  </div>;
}

function CppSourceEditor({ value, diagnostics, onChange }: {
  value: string;
  diagnostics: WorkspaceView["diagnostics"];
  onChange(value: string): void;
}): React.JSX.Element {
  const highlightRef = React.useRef<HTMLPreElement>(null);
  const diagnosticLines = React.useMemo(() => new Set(diagnostics.map((diagnostic) => diagnostic.line).filter((line): line is number => typeof line === "number")), [diagnostics]);

  function syncScroll(event: React.UIEvent<HTMLTextAreaElement>): void {
    const target = event.currentTarget;
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = target.scrollTop;
    highlightRef.current.scrollLeft = target.scrollLeft;
  }

  return <div className="source-editor-shell">
    <pre className="source-highlight" aria-hidden="true" ref={highlightRef}><code>{highlightCppLines(value, diagnosticLines)}</code></pre>
    <textarea
      className="source-editor source-editor-input"
      aria-label="Header 源码"
      value={value}
      spellCheck={false}
      onScroll={syncScroll}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>;
}

const CPP_KEYWORDS = new Set([
  "alignas", "alignof", "auto", "break", "case", "class", "const", "constexpr", "continue", "default",
  "delete", "do", "else", "enum", "explicit", "export", "extern", "false", "for", "friend", "if",
  "inline", "mutable", "namespace", "new", "noexcept", "nullptr", "operator", "private", "protected",
  "public", "return", "sizeof", "static", "struct", "switch", "template", "this", "throw", "true",
  "try", "typedef", "typename", "using", "virtual", "volatile", "while"
]);
const CPP_TYPES = new Set([
  "bool", "char", "char16_t", "char32_t", "double", "float", "int", "long", "short", "signed", "unsigned",
  "void", "wchar_t", "std", "int8_t", "uint8_t", "int16_t", "uint16_t", "int32_t", "uint32_t",
  "int64_t", "uint64_t"
]);

function highlightCpp(source: string): React.ReactNode[] {
  const tokenPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^\s*#\s*[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*|\b\d+(?:\.\d+)?(?:[uUlLfF]+)?\b/gm;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(source.slice(cursor, start));
    const className = cppTokenClass(token);
    nodes.push(className ? <span className={className} key={`tok-${index}`}>{token}</span> : token);
    cursor = start + token.length;
    index += 1;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

function highlightCppLines(source: string, diagnosticLines: Set<number>): React.ReactNode[] {
  const lines = source.split("\n");
  return lines.map((line, index) => {
    const lineNumber = index + 1;
    const className = diagnosticLines.has(lineNumber) ? "source-line source-line-error" : "source-line";
    return <span className={className} data-line={lineNumber} key={lineNumber}>
      {line ? highlightCpp(line) : "\u200B"}
    </span>;
  });
}

function cppTokenClass(token: string): string | null {
  if (token.startsWith("//") || token.startsWith("/*")) return "cpp-comment";
  if (token.startsWith("\"") || token.startsWith("'")) return "cpp-string";
  if (/^\s*#/.test(token)) return "cpp-preprocessor";
  if (/^\d/.test(token)) return "cpp-number";
  if (CPP_KEYWORDS.has(token)) return "cpp-keyword";
  if (CPP_TYPES.has(token) || token.endsWith("_t")) return "cpp-type";
  return null;
}

function ContextMenu({
  menu,
  onClose,
  onCreateHeader,
  onCreateStruct,
  onCreateEnum,
  onAddField,
  onAddEnumValue,
  onEditFile,
  onEditType,
  onEditField,
  onEditEnumValue,
  onDeleteType,
  onDeleteField,
  onDeleteEnumValue
}: {
  menu: ContextMenuState;
  onClose(): void;
  onCreateHeader(): void;
  onCreateStruct(file: WorkspaceFileView): void;
  onCreateEnum(file: WorkspaceFileView): void;
  onAddField(type: WorkspaceTypeView): void;
  onAddEnumValue(type: WorkspaceTypeView): void;
  onEditFile(file: WorkspaceFileView): void;
  onEditType(type: WorkspaceTypeView): void;
  onEditField(type: WorkspaceTypeView, field: WorkspaceFieldView): void;
  onEditEnumValue(type: WorkspaceTypeView, value: WorkspaceEnumValueView): void;
  onDeleteType(type: WorkspaceTypeView): void;
  onDeleteField(type: WorkspaceTypeView, field: WorkspaceFieldView): void;
  onDeleteEnumValue(type: WorkspaceTypeView, value: WorkspaceEnumValueView): void;
}): React.JSX.Element {
  const items: Array<{ label: string; action(): void; disabled?: boolean }> = [];
  if (menu.target.kind === "workspace") {
    items.push({ label: "新建 Header", action: onCreateHeader });
  }
  if (menu.target.kind === "file") {
    const { file } = menu.target;
    items.push(
      { label: "编辑 Header", action: () => onEditFile(file) },
      { label: "新增 Struct", action: () => onCreateStruct(file) },
      { label: "新增 Enum", action: () => onCreateEnum(file) }
    );
  }
  if (menu.target.kind === "type") {
    const { type } = menu.target;
    items.push(
      { label: type.kind === "struct" ? "编辑 Struct" : "编辑 Enum", action: () => onEditType(type) },
      { label: "添加字段", action: () => onAddField(type), disabled: type.kind !== "struct" },
      { label: "添加枚举项", action: () => onAddEnumValue(type), disabled: type.kind !== "enum" },
      { label: type.kind === "struct" ? "删除 Struct" : "删除 Enum", action: () => onDeleteType(type) }
    );
  }
  if (menu.target.kind === "field") {
    const { type, field } = menu.target;
    items.push(
      { label: "编辑字段", action: () => onEditField(type, field) },
      { label: "添加字段", action: () => onAddField(type) },
      { label: "删除字段", action: () => onDeleteField(type, field) }
    );
  }
  if (menu.target.kind === "enum-value") {
    const { type, value } = menu.target;
    items.push(
      { label: "编辑枚举项", action: () => onEditEnumValue(type, value) },
      { label: "添加枚举项", action: () => onAddEnumValue(type) },
      { label: "删除枚举项", action: () => onDeleteEnumValue(type, value) }
    );
  }

  return <div className="context-menu" role="menu" aria-label="上下文菜单" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    {items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.action(); onClose(); }}>{item.label}</button>)}
  </div>;
}

function GraphInspector({ workspace, graph, selectedNode, dirtyDataFlows, onOpenNode, onSelectNode, onDataFlowDraftChange, onUpdateDataFlow }: {
  workspace: WorkspaceView;
  graph: { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] };
  selectedNode: ProtocolGraphNode | null;
  dirtyDataFlows: Record<string, DirtyDataFlowEdit>;
  onOpenNode(node: ProtocolGraphNode): void;
  onSelectNode(node: ProtocolGraphNode): void;
  onDataFlowDraftChange(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
  onUpdateDataFlow(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
}): React.JSX.Element {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const referenceEdges = graph.edges.filter((edge) => edge.kind === "references");
  const riskNodes = graph.nodes.filter((node) => node.metrics.layoutRisk !== "normal");
  const diagnosticNodes = graph.nodes.filter((node) => node.metrics.diagnosticCount > 0);
  const topImpactNodes = [...graph.nodes]
    .filter((node) => isProtocolTypeNode(node))
    .sort((a, b) => b.metrics.impactScore - a.metrics.impactScore)
    .slice(0, 5);

  if (!selectedNode) {
    return <div className="inspector-stack">
      <dl>
        <dt>Types</dt><dd>{workspace.types.length}</dd>
        <dt>引用边</dt><dd>{referenceEdges.length}</dd>
        <dt>风险节点</dt><dd>{riskNodes.length}</dd>
        <dt>诊断节点</dt><dd>{diagnosticNodes.length}</dd>
      </dl>
      <section className="property-card">
        <h3>影响力 Top 5</h3>
        <div className="graph-inspector-list">
          {topImpactNodes.map((node) => <button key={node.id} onClick={() => onSelectNode(node)} onDoubleClick={() => onOpenNode(node)}>
            <span>{node.label}</span>
            <small>impact {node.metrics.impactScore} · in {node.metrics.inboundReferences} / out {node.metrics.outboundReferences}</small>
          </button>)}
        </div>
      </section>
      <section className="property-card">
        <h3>使用建议</h3>
        <p className="readonly-note">单击节点查看一跳/二跳影响范围；双击节点打开 tab。优先检查大节点和带黄/红外环的节点。</p>
      </section>
    </div>;
  }

  const outgoing = referenceEdges.filter((edge) => edge.from === selectedNode.id).map((edge) => nodeById.get(edge.to)).filter(Boolean) as ProtocolGraphNode[];
  const incoming = referenceEdges.filter((edge) => edge.to === selectedNode.id).map((edge) => nodeById.get(edge.from)).filter(Boolean) as ProtocolGraphNode[];
  const selectedTypeForLayout = isProtocolTypeNode(selectedNode) ? selectedNode.type : null;
  const layout = selectedTypeForLayout?.layout;
  const declaredTypes = selectedNode.kind === "file"
    ? graph.nodes.filter((node) => isProtocolTypeNode(node) && node.type.file === selectedNode.file.path)
    : [];
  const selectedNodeName = selectedNode.kind === "file"
    ? selectedNode.file.relativePath
    : isProtocolTypeNode(selectedNode) ? selectedNode.type.qualifiedName : selectedNode.label;

  return <div className="inspector-stack">
    <dl>
      <dt>名称</dt><dd>{selectedNodeName}</dd>
      <dt>类型</dt><dd>{selectedNode.kind === "file" ? "Header" : selectedNode.kind}</dd>
      <dt>影响力</dt><dd>{selectedNode.metrics.impactScore}</dd>
      <dt>被引用</dt><dd>{selectedNode.metrics.inboundReferences}</dd>
      <dt>引用</dt><dd>{selectedNode.metrics.outboundReferences}</dd>
      <dt>风险</dt><dd>{selectedNode.metrics.layoutRiskLabel}</dd>
      <dt>元数据</dt><dd>{selectedNode.metrics.metadataMissingCount === 0 ? "完整" : `缺 ${selectedNode.metrics.metadataMissingCount} 项`}</dd>
    </dl>
    {layout && <section className="property-card">
      <h3>布局摘要</h3>
      <dl>
        <dt>Size</dt><dd>{layout.size === undefined ? "未完全解析" : formatBytes(layout.size)}</dd>
        <dt>Align</dt><dd>{layout.alignment === undefined ? "—" : `${layout.alignment} B`}</dd>
        <dt>Padding</dt><dd>{formatBytes(layout.paddingBytes)}{layout.size ? ` · ${Math.round(layout.paddingBytes / layout.size * 100)}%` : ""}</dd>
        <dt>状态</dt><dd>{layout.partial ? "部分解析" : "已完成"}</dd>
      </dl>
    </section>}
    {selectedTypeForLayout && <DataFlowEditor
      type={selectedTypeForLayout}
      dirtyDataFlow={dirtyDataFlows[selectedTypeForLayout.id]}
      onDraftChange={onDataFlowDraftChange}
      onUpdateDataFlow={onUpdateDataFlow}
    />}
    <section className="property-card">
      <h3>{selectedNode.kind === "file" ? "声明类型" : "影响范围"}</h3>
      {selectedNode.kind === "file"
        ? <GraphNodeList nodes={declaredTypes} emptyText="该 Header 暂无协议类型" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
        : <>
            <p className="graph-inspector-caption">依赖我的</p>
            <GraphNodeList nodes={incoming} emptyText="暂无反向引用" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
            <p className="graph-inspector-caption">我依赖的</p>
            <GraphNodeList nodes={outgoing} emptyText="暂无外部类型引用" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
          </>}
    </section>
    <section className="property-card">
      <h3>快捷操作</h3>
      <div className="graph-inspector-actions">
        <button className="inline-action" onClick={() => onOpenNode(selectedNode)}>打开 tab</button>
        <button className="inline-action" onClick={() => onSelectNode(selectedNode)}>定位树图</button>
      </div>
    </section>
  </div>;
}

function GraphNodeList({ nodes, emptyText, onSelectNode, onOpenNode }: {
  nodes: ProtocolGraphNode[];
  emptyText: string;
  onSelectNode(node: ProtocolGraphNode): void;
  onOpenNode(node: ProtocolGraphNode): void;
}): React.JSX.Element {
  if (nodes.length === 0) return <p className="readonly-note">{emptyText}</p>;
  return <div className="graph-inspector-list">
    {nodes.slice(0, 12).map((node) => <button key={node.id} onClick={() => onSelectNode(node)} onDoubleClick={() => onOpenNode(node)}>
      <span>{node.label}</span>
      <small>{node.kind} · impact {node.metrics.impactScore}</small>
    </button>)}
  </div>;
}

function DataFlowEditor({ type, dirtyDataFlow, onDraftChange, onUpdateDataFlow }: {
  type: WorkspaceTypeView;
  dirtyDataFlow?: DirtyDataFlowEdit;
  onDraftChange(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
  onUpdateDataFlow(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
}): React.JSX.Element {
  const savedProducers = type.dataFlow?.producers ?? [];
  const savedConsumers = type.dataFlow?.consumers ?? [];
  const currentProducers = dirtyDataFlow?.producers ?? savedProducers;
  const currentConsumers = dirtyDataFlow?.consumers ?? savedConsumers;
  const [producerText, setProducerText] = React.useState(currentProducers.join(", "));
  const [consumerText, setConsumerText] = React.useState(currentConsumers.join(", "));

  React.useEffect(() => {
    setProducerText(currentProducers.join(", "));
    setConsumerText(currentConsumers.join(", "));
  }, [type.id, currentProducers.join("\u0000"), currentConsumers.join("\u0000")]);

  const producers = parseFlowTags(producerText);
  const consumers = parseFlowTags(consumerText);
  const dirty = dirtyDataFlow !== undefined;
  const isBaseData = producers.length === 0 && consumers.length === 0;

  function changeProducers(value: string): void {
    setProducerText(value);
    onDraftChange(type, parseFlowTags(value), parseFlowTags(consumerText));
  }

  function changeConsumers(value: string): void {
    setConsumerText(value);
    onDraftChange(type, parseFlowTags(producerText), parseFlowTags(value));
  }

  return <section className="property-card data-flow-editor">
    <h3>数据流标签</h3>
    <p className="readonly-note">{isBaseData ? "生产节点和消费节点均为空，当前按基础数据类型处理。" : "这些标签会在图谱的数据流模式中生成 Producer → Data → Consumer 关系。"}</p>
    <label>
      <span>生产节点</span>
      <textarea aria-label={`${type.name} 生产节点`} value={producerText} placeholder="例如：RadarDriver, ReplayTool" onChange={(event) => changeProducers(event.target.value)} />
    </label>
    <TagPreview tags={producers} emptyText="无生产节点" />
    <label>
      <span>消费节点</span>
      <textarea aria-label={`${type.name} 消费节点`} value={consumerText} placeholder="例如：Tracker, Telemetry" onChange={(event) => changeConsumers(event.target.value)} />
    </label>
    <TagPreview tags={consumers} emptyText="无消费节点" />
    <div className="graph-inspector-actions">
      <button className="inline-action" disabled={!dirty} onClick={() => onUpdateDataFlow(type, producers, consumers)}>保存数据流</button>
      <button className="inline-action ghost" disabled={!producerText && !consumerText} onClick={() => { setProducerText(""); setConsumerText(""); onDraftChange(type, [], []); }}>清空</button>
    </div>
  </section>;
}

function TagPreview({ tags, emptyText }: { tags: string[]; emptyText: string }): React.JSX.Element {
  return tags.length === 0
    ? <small className="tag-empty">{emptyText}</small>
    : <div className="tag-list">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

function parseFlowTags(value: string): string[] {
  return [...new Set(value.split(/[,，;\n\r]+/).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function stringArrayEquals(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function ProtocolInspector({ type, layout, selectedField, selectedEnumValue, dirtyDataFlows, onDataFlowDraftChange, onUpdateDataFlow }: {
  type: WorkspaceTypeView;
  layout: WorkspaceMemoryLayoutView | null;
  selectedField?: WorkspaceFieldView;
  selectedEnumValue?: WorkspaceEnumValueView;
  dirtyDataFlows: Record<string, DirtyDataFlowEdit>;
  onDataFlowDraftChange(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
  onUpdateDataFlow(type: WorkspaceTypeView, producers: string[], consumers: string[]): void;
}): React.JSX.Element {
  const selectedFieldLayout = selectedField && type.kind === "struct" && layout
    ? layout.fields.find((field) => field.fieldId === selectedField.id)
    : undefined;
  const readonlyNote = selectedField?.note ?? selectedEnumValue?.note ?? type.note;
  const readonlyNoteLabel = selectedField
    ? "当前字段注释"
    : selectedEnumValue
      ? "当前枚举项注释"
      : "类型注释";

  return <div className="inspector-stack">
    <dl>
      <dt>对象</dt><dd>{type.kind === "struct" ? "Struct" : "Enum"}</dd>
      <dt>名称</dt><dd>{type.name}</dd>
      <dt>限定名</dt><dd className="break">{type.qualifiedName}</dd>
    </dl>

    <section className="property-card">
      <h3>{readonlyNoteLabel}</h3>
      <p className="readonly-note">{readonlyNote || "暂无注释；请在中间 Editor 中编辑。"}</p>
    </section>

    <DataFlowEditor
      type={type}
      dirtyDataFlow={dirtyDataFlows[type.id]}
      onDraftChange={onDataFlowDraftChange}
      onUpdateDataFlow={onUpdateDataFlow}
    />

    {layout && <section className="property-card">
      <h3>内存布局</h3>
      {type.kind === "struct"
        ? <dl>
            <dt>大小</dt><dd>{layout.size === undefined ? "未完全解析" : formatBytes(layout.size)}</dd>
            <dt>对齐</dt><dd>{layout.alignment === undefined ? "—" : `${layout.alignment} B`}</dd>
            <dt>数据</dt><dd>{formatBytes(layout.dataSize)}</dd>
            <dt>Padding</dt><dd>{formatBytes(layout.paddingBytes)}</dd>
            <dt>Pack</dt><dd>{layout.pack ? `#pragma pack(${layout.pack})` : "默认 ABI"}</dd>
            <dt>状态</dt><dd>{layout.partial ? "部分类型未支持" : "已完成"}</dd>
          </dl>
        : <dl>
            <dt>大小</dt><dd>{layout.size === undefined ? "未完全解析" : formatBytes(layout.size)}</dd>
            <dt>对齐</dt><dd>{layout.alignment === undefined ? "—" : `${layout.alignment} B`}</dd>
            <dt>底层类型</dt><dd><code>{type.underlyingType ?? "int32_t"}</code></dd>
            <dt>状态</dt><dd>{layout.partial ? "部分类型未支持" : "已完成"}</dd>
          </dl>}
      <small>当前为本地协议 IR 的布局分析结果；P4 测试使用编译器 sizeof/offsetof 做交叉验证。</small>
    </section>}

    {selectedField && <section className="property-card">
      <h3>当前字段</h3>
      <dl>
        <dt>名称</dt><dd>{selectedField.name}</dd>
        <dt>类型</dt><dd><code>{selectedField.type}</code></dd>
        <dt>Offset</dt><dd>{selectedFieldLayout?.offset === undefined ? "—" : `${selectedFieldLayout.offset} B`}</dd>
        <dt>大小</dt><dd>{selectedFieldLayout?.size === undefined ? "未解析" : formatBytes(selectedFieldLayout.size)}</dd>
        <dt>对齐</dt><dd>{selectedFieldLayout?.alignment === undefined ? "—" : `${selectedFieldLayout.alignment} B`}</dd>
        <dt>前置空隙</dt><dd>{formatBytes(selectedFieldLayout?.paddingBefore ?? 0)}</dd>
        <dt>后置空隙</dt><dd>{formatBytes(selectedFieldLayout?.paddingAfter ?? 0)}</dd>
      </dl>
      {selectedFieldLayout && !selectedFieldLayout.supported && <p className="property-warning">{selectedFieldLayout.reason}</p>}
    </section>}

    {selectedEnumValue && <section className="property-card">
      <h3>当前枚举项</h3>
      <dl>
        <dt>名称</dt><dd>{selectedEnumValue.name}</dd>
        <dt>值</dt><dd>{selectedEnumValue.value ?? "自动"}</dd>
      </dl>
    </section>}

    {type.kind === "struct" && layout && layout.fields.length > 0 && <section className="property-card">
      <h3>字段布局</h3>
      <div className="field-layout-list">
        {layout.fields.map((field) => <div className={field.fieldId === selectedField?.id ? "field-layout-row active" : "field-layout-row"} key={field.fieldId}>
          <span>{field.name}</span>
          <small>{field.offset === undefined ? "?" : `${field.offset} B`} · {field.size === undefined ? "?" : `${field.size} B`}</small>
        </div>)}
      </div>
    </section>}
  </div>;
}

function formatBytes(value: number): string {
  return `${value} B`;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
