import React from "react";
import ReactDOM from "react-dom/client";
import type {
  GeneratedDocumentReport,
  GitBranchInfo,
  GitCommitGraphEntry,
  GitDiffSide,
  GitFileDiff,
  GitOperationResult,
  GitTagInfo,
  GitWorkspaceStatus,
  NetworkNodeKind,
  NetworkTransportKind,
  ProtocolBindingCriticality,
  ProtocolBaselineSummary,
  SemanticDiffReport,
  WorkspaceNetworkLinkView,
  WorkspaceNetworkNodeView,
  WorkspaceProtocolBindingView,
  WorkspaceFlowView,
  WorkspaceEnumValueView,
  WorkspaceExternalChange,
  WorkspaceFieldView,
  WorkspaceFileView,
  WorkspaceLintReport,
  WorkspaceMemoryLayoutView,
  WorkspaceScanProgress,
  WorkspaceTypeView,
  WorkspaceView
} from "../../shared/workspace";
import {
  PROTOVAULT_ASSISTANT_MODULES,
  type AssistantAskResponse,
  type AssistantModuleId,
  type AssistantRuntimeStatus
} from "../../shared/assistant";
import { APP_THEMES, graphThemeForAppTheme, type AppThemeId, type GraphThemePreset } from "./themes";
import { ProblemsPanel } from "./components/ProblemsPanel";
import "./styles.css";

type ProtocolTreeNode =
  | { id: string; kind: "folder"; name: string; children: ProtocolTreeNode[] }
  | { id: string; kind: "file"; name: string; file: WorkspaceFileView; children: ProtocolTreeNode[] }
  | { id: string; kind: "type"; name: string; type: WorkspaceTypeView; children: ProtocolTreeNode[] }
  | { id: string; kind: "field"; name: string; parent: WorkspaceTypeView; field?: WorkspaceFieldView; enumValue?: WorkspaceEnumValueView };

type WorkspaceAction = "create-header" | "create-struct" | "create-enum" | "edit-header" | "edit-struct" | "edit-enum" | "add-field" | "edit-field" | "add-enum-value" | "edit-enum-value";
type WorkspaceTab =
  | { id: string; kind: "file"; title: string; filePath: string }
  | { id: string; kind: "type"; title: string; typeId: string }
  | { id: string; kind: "git-diff"; title: string; path: string; side: GitDiffSide; commit?: string };
type TabContextMenuState = { x: number; y: number; tab: WorkspaceTab; orderedTabs: WorkspaceTab[] };
type FieldTypeOption = { group: "composite" | "base"; value: string; label: string; detail?: string };
type DirtyStructuralEdit =
  | { kind: "field"; typeId: string; fieldId: string; fieldName: string; fieldType: string; fieldInitializer: string; savedFieldName: string; savedFieldType: string; savedFieldInitializer: string }
  | { kind: "enum-value"; typeId: string; valueId: string; valueName: string; valueNumber: string; savedValueName: string; savedValueNumber: string };
type CenterViewMode = "workspace" | "graph" | "network" | "git" | "manual";
type NetworkTabMode = "nodes" | "links" | "bindings" | "flows" | "flow-canvas";
type NavigationSnapshot = {
  centerViewMode: CenterViewMode;
  activeTabId: string | null;
  selectedFilePath: string | null;
  selectedTypeId: string | null;
  selectedMemberId: string | null;
  networkMode: NetworkTabMode;
  networkSelectedFlowViewId: string;
  graphSelectedNodeId: string | null;
};
type WorkspaceReportState =
  | { kind: "lint"; report: WorkspaceLintReport }
  | { kind: "document"; report: GeneratedDocumentReport }
  | { kind: "baseline"; report: ProtocolBaselineSummary }
  | { kind: "diff"; report: SemanticDiffReport };
type ConfirmDialogState = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type PromptDialogState = ConfirmDialogState & {
  initialValue: string;
  placeholder?: string;
};
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
  | { id: string; kind: "network-node"; label: string; networkNode: WorkspaceNetworkNodeView; x: number; y: number; z: number; metrics: GraphNodeMetrics }
  | { id: string; kind: "protocol-binding"; label: string; binding: WorkspaceProtocolBindingView; x: number; y: number; z: number; metrics: GraphNodeMetrics }
  | { id: string; kind: "producer" | "consumer"; label: string; x: number; y: number; z: number; metrics: GraphNodeMetrics };
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
type WorkspaceLayoutPreferences = {
  navigatorWidth: number;
  inspectorWidth: number;
  navigatorCollapsed: boolean;
  inspectorCollapsed: boolean;
  toolbarCollapsed: boolean;
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
const MAX_NAVIGATION_HISTORY = 80;
const LAYOUT_STORAGE_KEY = "protovault:workspace-layout";

function readWorkspaceLayoutPreferences(): WorkspaceLayoutPreferences {
  const fallback: WorkspaceLayoutPreferences = {
    navigatorWidth: 340,
    inspectorWidth: 260,
    navigatorCollapsed: false,
    inspectorCollapsed: false,
    toolbarCollapsed: false
  };
  try {
    const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as Partial<WorkspaceLayoutPreferences>;
    return {
      navigatorWidth: typeof stored.navigatorWidth === "number" ? clamp(stored.navigatorWidth, 260, 680) : fallback.navigatorWidth,
      inspectorWidth: typeof stored.inspectorWidth === "number" ? clamp(stored.inspectorWidth, 220, 560) : fallback.inspectorWidth,
      navigatorCollapsed: stored.navigatorCollapsed === true,
      inspectorCollapsed: stored.inspectorCollapsed === true,
      toolbarCollapsed: stored.toolbarCollapsed === true
    };
  } catch {
    return fallback;
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function gitStatusLabel(status: GitWorkspaceStatus | null, tags: GitTagInfo[]): string {
  if (!status) return "Git 状态读取中…";
  if (!status.isRepository) return "非 Git 工作区";
  const branch = status.currentBranch ?? "detached";
  const dirty = status.isDirty ? ` · ${status.entries.length} 个改动` : " · clean";
  const tag = status.latestTag ?? tags[0]?.name;
  return `Git ${branch}${tag ? ` · ${tag}` : ""}${dirty}`;
}

function navigationSnapshotEquals(a: NavigationSnapshot | null, b: NavigationSnapshot | null): boolean {
  if (!a || !b) return a === b;
  return a.centerViewMode === b.centerViewMode
    && a.activeTabId === b.activeTabId
    && a.selectedFilePath === b.selectedFilePath
    && a.selectedTypeId === b.selectedTypeId
    && a.selectedMemberId === b.selectedMemberId
    && a.networkMode === b.networkMode
    && a.networkSelectedFlowViewId === b.networkSelectedFlowViewId
    && a.graphSelectedNodeId === b.graphSelectedNodeId;
}

function pushNavigationSnapshot(stack: NavigationSnapshot[], snapshot: NavigationSnapshot): NavigationSnapshot[] {
  const last = stack.at(-1);
  if (navigationSnapshotEquals(last ?? null, snapshot)) return stack;
  return [...stack, snapshot].slice(-MAX_NAVIGATION_HISTORY);
}

function useEventCallback<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
  const callbackRef = React.useRef(callback);
  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  return React.useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

function App(): React.JSX.Element {
  const initialLayoutPreferences = React.useRef(readWorkspaceLayoutPreferences()).current;
  const [health, setHealth] = React.useState("正在连接本地协议服务…");
  const [workspace, setWorkspace] = React.useState<WorkspaceView | null>(null);
  const [gitStatus, setGitStatus] = React.useState<GitWorkspaceStatus | null>(null);
  const [gitBranches, setGitBranches] = React.useState<GitBranchInfo[]>([]);
  const [gitTags, setGitTags] = React.useState<GitTagInfo[]>([]);
  const [gitCommitGraph, setGitCommitGraph] = React.useState<GitCommitGraphEntry[]>([]);
  const [gitDiffs, setGitDiffs] = React.useState<Record<string, GitFileDiff>>({});
  const [selectedGitCommitHash, setSelectedGitCommitHash] = React.useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = React.useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<Set<string>>(new Set());
  const [treeSearchOpen, setTreeSearchOpen] = React.useState(false);
  const [treeSearchQuery, setTreeSearchQuery] = React.useState("");
  const [navigatorWidth, setNavigatorWidth] = React.useState(initialLayoutPreferences.navigatorWidth);
  const [inspectorWidth, setInspectorWidth] = React.useState(initialLayoutPreferences.inspectorWidth);
  const [navigatorCollapsed, setNavigatorCollapsed] = React.useState(initialLayoutPreferences.navigatorCollapsed);
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(initialLayoutPreferences.inspectorCollapsed);
  const [toolbarCollapsed, setToolbarCollapsed] = React.useState(initialLayoutPreferences.toolbarCollapsed);
  const [uiNotice, setUiNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState | null>(null);
  const [promptDialog, setPromptDialog] = React.useState<PromptDialogState | null>(null);
  const [appThemeId, setAppThemeId] = React.useState<AppThemeId>(() => {
    const stored = window.localStorage.getItem("protovault:app-theme");
    return APP_THEMES.some((theme) => theme.id === stored) ? stored as AppThemeId : "tokyo";
  });
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
  const [fieldInitializer, setFieldInitializer] = React.useState("");
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [enumValueName, setEnumValueName] = React.useState("Unknown");
  const [enumValueNumber, setEnumValueNumber] = React.useState("0");
  const [editingEnumValueId, setEditingEnumValueId] = React.useState<string | null>(null);
  const [dirtyNotes, setDirtyNotes] = React.useState<Record<string, string>>({});
  const [dirtyStructuralEdits, setDirtyStructuralEdits] = React.useState<Record<string, DirtyStructuralEdit>>({});
  const [sourceDrafts, setSourceDrafts] = React.useState<Record<string, string>>({});
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([]);
  const [previewTab, setPreviewTab] = React.useState<WorkspaceTab | null>(null);
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [tabContextMenu, setTabContextMenu] = React.useState<TabContextMenuState | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [workspaceReport, setWorkspaceReport] = React.useState<WorkspaceReportState | null>(null);
  const [externalChange, setExternalChange] = React.useState<WorkspaceExternalChange | null>(null);
  const [centerViewMode, setCenterViewMode] = React.useState<CenterViewMode>("workspace");
  const [networkMode, setNetworkMode] = React.useState<NetworkTabMode>("nodes");
  const [networkSelectedFlowViewId, setNetworkSelectedFlowViewId] = React.useState("derived:all");
  const [navigationAvailability, setNavigationAvailability] = React.useState({ canGoBack: false, canGoForward: false });
  const navigationBackStackRef = React.useRef<NavigationSnapshot[]>([]);
  const navigationForwardStackRef = React.useRef<NavigationSnapshot[]>([]);
  const lastNavigationSnapshotRef = React.useRef<NavigationSnapshot | null>(null);
  const currentNavigationSnapshotRef = React.useRef<NavigationSnapshot | null>(null);
  const restoringNavigationRef = React.useRef(false);
  const confirmResolverRef = React.useRef<((value: boolean) => void) | null>(null);
  const promptResolverRef = React.useRef<((value: string | null) => void) | null>(null);
  const [graphInspectorState, setGraphInspectorState] = React.useState<{ graph: { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] }; selectedNodeId: string | null } | null>(null);
  const selectedType = workspace?.types.find((type) => type.id === selectedTypeId);
  const selectedFile = workspace?.files.find((file) => file.path === selectedFilePath);
  const activeWorkspaceTab = tabs.find((tab) => tab.id === activeTabId) ?? (previewTab?.id === activeTabId ? previewTab : null);
  const activeGitDiff = activeWorkspaceTab?.kind === "git-diff" ? gitDiffs[activeWorkspaceTab.id] ?? null : null;
  const selectedGitCommit = React.useMemo(() => {
    if (!gitCommitGraph.length) return null;
    return gitCommitGraph.find((commit) => commit.hash === selectedGitCommitHash) ?? gitCommitGraph[0] ?? null;
  }, [gitCommitGraph, selectedGitCommitHash]);
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
    () => workspace ? buildDirtyTabIds(workspace, dirtyNotes, dirtyStructuralEdits, sourceDrafts) : new Set<string>(),
    [workspace, dirtyNotes, dirtyStructuralEdits, sourceDrafts]
  );
  const selectedFieldTypeOptions = React.useMemo(
    () => workspace && selectedType ? buildFieldTypeOptions(workspace, selectedType) : buildBaseFieldTypeOptions(),
    [workspace, selectedType]
  );
  const selectedLayout = selectedType?.layout ?? null;
  const rawTree = React.useMemo(() => workspace ? buildProtocolTree(workspace) : [], [workspace]);
  const dependencyGraphContext = React.useMemo(() => workspace ? buildProtocolGraph(workspace) : null, [workspace]);
  const graphContext = centerViewMode === "graph" && graphInspectorState ? graphInspectorState.graph : dependencyGraphContext;
  const selectedGraphNode = React.useMemo(() => {
    if (!graphContext) return null;
    if (centerViewMode === "graph" && graphInspectorState?.selectedNodeId) {
      return graphContext.nodes.find((node) => node.id === graphInspectorState.selectedNodeId) ?? null;
    }
    const selectedId = selectedTypeId ? `type:${selectedTypeId}` : selectedFilePath ? `file:${selectedFilePath}` : null;
    return selectedId ? graphContext.nodes.find((node) => node.id === selectedId) ?? null : null;
  }, [centerViewMode, graphContext, graphInspectorState?.selectedNodeId, selectedFilePath, selectedTypeId]);
  const treeSearchResult = React.useMemo(() => filterProtocolTree(rawTree, treeSearchQuery), [rawTree, treeSearchQuery]);
  const tree = treeSearchResult.nodes;
  const effectiveExpandedNodeIds = React.useMemo(() => {
    if (!treeSearchQuery.trim()) return expandedNodeIds;
    return new Set([...expandedNodeIds, ...treeSearchResult.expandedNodeIds]);
  }, [expandedNodeIds, treeSearchQuery, treeSearchResult.expandedNodeIds]);
  const currentNavigationSnapshot = React.useMemo<NavigationSnapshot>(() => ({
    centerViewMode,
    activeTabId,
    selectedFilePath,
    selectedTypeId,
    selectedMemberId,
    networkMode,
    networkSelectedFlowViewId,
    graphSelectedNodeId: graphInspectorState?.selectedNodeId ?? null
  }), [activeTabId, centerViewMode, graphInspectorState?.selectedNodeId, networkMode, networkSelectedFlowViewId, selectedFilePath, selectedMemberId, selectedTypeId]);

  const applyWorkspaceResult = React.useCallback((result: WorkspaceView, options?: {
    selectFileRelativePath?: string;
    selectTypeName?: string;
    selectFieldName?: string;
    resetNavigationHistory?: boolean;
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
    setExternalChange(null);
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
    if (options?.resetNavigationHistory) {
      setCenterViewMode("workspace");
      setNetworkMode("nodes");
      setNetworkSelectedFlowViewId("derived:all");
      setWorkspaceReport(null);
      setActiveAction(null);
      navigationBackStackRef.current = [];
      navigationForwardStackRef.current = [];
      lastNavigationSnapshotRef.current = null;
      currentNavigationSnapshotRef.current = null;
      refreshNavigationAvailability();
    }
  }, []);

  const replaceWorkspaceResult = React.useCallback((result: WorkspaceView): void => {
    setWorkspace(result);
    setExternalChange(null);
    setTabs((current) => reconcileTabs(current, result));
  }, []);

  const handleGraphContextChange = React.useCallback((graph: { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] }, selectedNodeId: string | null): void => {
    setGraphInspectorState((current) => current?.graph === graph && current.selectedNodeId === selectedNodeId ? current : { graph, selectedNodeId });
  }, []);

  function refreshNavigationAvailability(): void {
    setNavigationAvailability((current) => {
      const next = {
        canGoBack: navigationBackStackRef.current.length > 0,
        canGoForward: navigationForwardStackRef.current.length > 0
      };
      return current.canGoBack === next.canGoBack && current.canGoForward === next.canGoForward ? current : next;
    });
  }

  function applyNavigationSnapshot(snapshot: NavigationSnapshot): void {
    setCenterViewMode(snapshot.centerViewMode);
    setNetworkMode(snapshot.networkMode);
    setNetworkSelectedFlowViewId(snapshot.networkSelectedFlowViewId);
    setActiveTabId(snapshot.activeTabId);
    setSelectedFilePath(snapshot.selectedFilePath);
    setSelectedTypeId(snapshot.selectedTypeId);
    setSelectedMemberId(snapshot.selectedMemberId);
    setActiveAction(null);
    setWorkspaceReport(null);
    if (snapshot.selectedTypeId) {
      setExpandedNodeIds((current) => new Set(current).add(`type:${snapshot.selectedTypeId}`));
    }
    if (snapshot.centerViewMode === "graph") {
      setGraphInspectorState((current) => current ? { ...current, selectedNodeId: snapshot.graphSelectedNodeId } : current);
    }
  }

  async function navigateHistory(direction: "back" | "forward"): Promise<void> {
    const sourceStack = direction === "back" ? navigationBackStackRef.current : navigationForwardStackRef.current;
    const target = sourceStack.at(-1);
    if (!target) {
      setUiNotice(direction === "back" ? "没有更早的操作界面" : "没有更后的操作界面");
      return;
    }
    if (!(await ensureCanNavigateToTab(target.activeTabId ?? ""))) return;
    const current = currentNavigationSnapshotRef.current ?? currentNavigationSnapshot;
    if (direction === "back") {
      navigationBackStackRef.current = sourceStack.slice(0, -1);
      navigationForwardStackRef.current = pushNavigationSnapshot(navigationForwardStackRef.current, current);
    } else {
      navigationForwardStackRef.current = sourceStack.slice(0, -1);
      navigationBackStackRef.current = pushNavigationSnapshot(navigationBackStackRef.current, current);
    }
    restoringNavigationRef.current = true;
    applyNavigationSnapshot(target);
    refreshNavigationAvailability();
    setUiNotice(direction === "back" ? "已返回上一步界面" : "已前进到下一步界面");
  }

  const handleGlobalClick = useEventCallback((): void => {
    setContextMenu(null);
    setTabContextMenu(null);
  });

  const handleGlobalKeyDown = useEventCallback((event: KeyboardEvent): void => {
    const textEntryActive = isTextEntryTarget(event.target);
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowLeft") {
      if (textEntryActive) return;
      event.preventDefault();
      void navigateHistory("back");
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowRight") {
      if (textEntryActive) return;
      event.preventDefault();
      void navigateHistory("forward");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActiveChanges();
      return;
    }
    if (event.key === "F2") {
      if (textEntryActive) return;
      event.preventDefault();
      triggerEditSelected();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (promptDialog) resolvePromptDialog(null);
      else if (confirmDialog) resolveConfirmDialog(false);
      else if (settingsOpen) setSettingsOpen(false);
      else handleGlobalClick();
    }
  });

  React.useEffect(() => {
    window.protoVault.health()
      .then((result) => setHealth(`服务就绪 · Contract ${result.contractVersion}`))
      .catch(() => setHealth("本地协议服务不可用"));
  }, []);

  React.useEffect(() => window.protoVault.onScanProgress((progress) => {
    setScanProgress(progress);
  }), []);

  React.useEffect(() => window.protoVault.onExternalChange((change) => {
    setExternalChange(change);
    setUiNotice(`检测到外部修改：${change.relativePath ?? "工作区 Header"}`);
  }), []);

  React.useEffect(() => {
    if (!workspace) {
      setGitStatus(null);
      setGitBranches([]);
      setGitTags([]);
      setGitCommitGraph([]);
      setGitDiffs({});
      setSelectedGitCommitHash(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      window.protoVault.gitStatus(workspace.rootPath),
      window.protoVault.gitBranches(workspace.rootPath),
      window.protoVault.gitTags(workspace.rootPath),
      window.protoVault.gitCommitGraph(workspace.rootPath)
    ])
      .then(([status, branches, tags, graph]) => {
        if (cancelled) return;
        setGitStatus(status);
        setGitBranches(branches);
        setGitTags(tags);
        setGitCommitGraph(graph);
        setSelectedGitCommitHash((current) => graph.some((commit) => commit.hash === current) ? current : graph[0]?.hash ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setGitStatus({
          isRepository: false,
          isDirty: false,
          hasConflicts: false,
          entries: []
        });
        setGitBranches([]);
        setGitTags([]);
        setGitCommitGraph([]);
        setSelectedGitCommitHash(null);
      });
    return () => { cancelled = true; };
  }, [workspace]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScanProgress({ phase: "discover", message: "正在尝试恢复上次工作区…", current: 0, total: 1 });
    window.protoVault.restoreLastWorkspace()
      .then((result) => {
        if (cancelled || !result) return;
        applyWorkspaceResult(result, { resetNavigationHistory: true });
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
    if (loading || scanProgress?.phase !== "done") return;
    const timer = window.setTimeout(() => setScanProgress(null), 1800);
    return () => window.clearTimeout(timer);
  }, [loading, scanProgress?.phase]);

  React.useEffect(() => {
    document.body.dataset.appTheme = appThemeId;
    const lightTheme = appThemeId === "ink" || appThemeId === "obsidian-light";
    document.body.classList.toggle("theme-light", lightTheme);
    document.body.classList.toggle("theme-dark", !lightTheme);
    window.localStorage.setItem("protovault:app-theme", appThemeId);
  }, [appThemeId]);

  React.useEffect(() => {
    const preferences: WorkspaceLayoutPreferences = {
      navigatorWidth,
      inspectorWidth,
      navigatorCollapsed,
      inspectorCollapsed,
      toolbarCollapsed
    };
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(preferences));
  }, [inspectorCollapsed, inspectorWidth, navigatorCollapsed, navigatorWidth, toolbarCollapsed]);

  React.useEffect(() => {
    currentNavigationSnapshotRef.current = currentNavigationSnapshot;
    const previous = lastNavigationSnapshotRef.current;
    if (!previous) {
      lastNavigationSnapshotRef.current = currentNavigationSnapshot;
      refreshNavigationAvailability();
      return;
    }
    if (navigationSnapshotEquals(previous, currentNavigationSnapshot)) {
      refreshNavigationAvailability();
      return;
    }
    if (restoringNavigationRef.current) {
      restoringNavigationRef.current = false;
      lastNavigationSnapshotRef.current = currentNavigationSnapshot;
      refreshNavigationAvailability();
      return;
    }
    navigationBackStackRef.current = pushNavigationSnapshot(navigationBackStackRef.current, previous);
    navigationForwardStackRef.current = [];
    lastNavigationSnapshotRef.current = currentNavigationSnapshot;
    refreshNavigationAvailability();
  }, [currentNavigationSnapshot]);

  React.useEffect(() => {
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleGlobalClick, handleGlobalKeyDown]);

  async function openWorkspace(sample: boolean): Promise<void> {
    setLoading(true);
    setScanProgress({ phase: "discover", message: sample ? "正在加载示例工作区…" : "正在打开本地工作区…", current: 0, total: 1 });
    try {
      const result = sample ? await window.protoVault.openSampleWorkspace() : await window.protoVault.openWorkspace();
      if (result) {
        applyWorkspaceResult(result, { resetNavigationHistory: true });
        setUiNotice(result.metadataPath ? "目录记录已更新：.protocol/workspace.json" : "工作区已扫描");
      }
    } finally {
      setLoading(false);
    }
  }

  async function rescanCurrentWorkspace(): Promise<void> {
    if (!workspace) return;
    setLoading(true);
    setScanProgress({ phase: "discover", message: "正在重新导入外部修改…", current: 0, total: 1 });
    try {
      const result = await window.protoVault.scanWorkspace(workspace.rootPath);
      applyWorkspaceResult(result);
      setUiNotice("已重新扫描并导入外部修改");
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

  function requestConfirm(dialog: ConfirmDialogState): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmDialog(dialog);
    });
  }

  function resolveConfirmDialog(value: boolean): void {
    confirmResolverRef.current?.(value);
    confirmResolverRef.current = null;
    setConfirmDialog(null);
  }

  function requestPrompt(dialog: PromptDialogState): Promise<string | null> {
    return new Promise((resolve) => {
      promptResolverRef.current?.(null);
      promptResolverRef.current = resolve;
      setPromptDialog(dialog);
    });
  }

  function resolvePromptDialog(value: string | null): void {
    promptResolverRef.current?.(value);
    promptResolverRef.current = null;
    setPromptDialog(null);
  }

  async function refreshGitState(): Promise<void> {
    if (!workspace) return;
    const [status, branches, tags, graph] = await Promise.all([
      window.protoVault.gitStatus(workspace.rootPath),
      window.protoVault.gitBranches(workspace.rootPath),
      window.protoVault.gitTags(workspace.rootPath),
      window.protoVault.gitCommitGraph(workspace.rootPath)
    ]);
    setGitStatus(status);
    setGitBranches(branches);
    setGitTags(tags);
    setGitCommitGraph(graph);
    setSelectedGitCommitHash((current) => graph.some((commit) => commit.hash === current) ? current : graph[0]?.hash ?? null);
  }

  function applyGitOperationResult(result: GitOperationResult): void {
    setGitStatus(result.status);
    if (result.branches) setGitBranches(result.branches);
    if (result.tags) setGitTags(result.tags);
    void refreshGitState();
    setUiNotice(result.message);
  }

  async function runGitAction(action: () => Promise<GitOperationResult | void>): Promise<boolean> {
    return runWorkspaceAction(async () => {
      const result = await action();
      if (result) applyGitOperationResult(result);
      else await refreshGitState();
    });
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
    else if (node.kind === "network-node") {
      setUiNotice(`网络节点：${node.networkNode.name}`);
    } else if (node.kind === "protocol-binding") {
      setUiNotice(`协议载荷：${node.binding.name} · ${node.binding.protocolName ?? node.binding.typeId}`);
    }
    else setUiNotice(`${node.kind === "producer" ? "生产节点" : "消费节点"}：${node.label}`);
  }

  async function openGraphNode(node: ProtocolGraphNode): Promise<void> {
    if (node.kind === "file") {
      if (await openFileTab(node.file)) setCenterViewMode("workspace");
    } else if (node.kind === "struct" || node.kind === "enum") {
      if (await openTypeTab(node.type)) setCenterViewMode("workspace");
    } else if (node.kind === "protocol-binding") {
      await openProtocolTypeById(node.binding.typeId);
    } else if (node.kind === "network-node") {
      setCenterViewMode("network");
      setUiNotice(`已切换到网络地图：${node.networkNode.name}`);
    } else {
      setCenterViewMode("graph");
    }
  }

  async function openProtocolTypeById(typeId: string): Promise<void> {
    const type = workspace?.types.find((item) => item.id === typeId);
    if (!type) {
      setUiNotice("协议绑定引用的类型暂未在当前工作区扫描结果中找到");
      return;
    }
    if (await openTypeTab(type)) setCenterViewMode("workspace");
  }

  async function openDiagnosticLocation(diagnostic: WorkspaceView["diagnostics"][number]): Promise<void> {
    if (!workspace || !diagnostic.file) {
      setUiNotice("该问题没有可跳转的源码位置");
      return;
    }
    const diagnosticPath = normalizePath(diagnostic.file);
    const file = workspace.files.find((item) => normalizePath(item.path) === diagnosticPath);
    if (!file) {
      setUiNotice("问题来自工作区外部依赖，当前无法直接打开");
      return;
    }
    if (await openFileTab(file)) {
      setCenterViewMode("workspace");
      setUiNotice(diagnostic.line ? `已定位到 ${file.relativePath}:${diagnostic.line}` : `已打开 ${file.relativePath}`);
    }
  }

  async function deleteFieldWithConfirm(type: WorkspaceTypeView, field: WorkspaceFieldView): Promise<void> {
    if (!await requestConfirm({
      title: "删除字段",
      message: `确认删除字段 ${type.name}.${field.name}？`,
      detail: "删除会直接改写 Header，保存前会执行受控写入和重新扫描。",
      confirmLabel: "删除字段",
      danger: true
    })) return;
    await deleteFieldInline(type, field);
  }

  async function deleteEnumValueWithConfirm(type: WorkspaceTypeView, value: WorkspaceEnumValueView): Promise<void> {
    if (!await requestConfirm({
      title: "删除枚举项",
      message: `确认删除枚举项 ${type.name}.${value.name}？`,
      detail: "删除后会重新扫描 Header 并刷新枚举表。",
      confirmLabel: "删除枚举项",
      danger: true
    })) return;
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
      setFieldInitializer(field.initializer ?? "");
      setEditingFieldId(field.id);
      setActiveAction("edit-field");
      return;
    }
    if (activeAction === "add-field") {
      setFieldType("std::uint32_t");
      setFieldName("value");
      setFieldInitializer("");
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
    if (!await requestConfirm({
      title: "删除 Header",
      message: `确认删除 ${selectedFile.relativePath}？`,
      detail: "该操作会删除源文件。建议先确认 Git Source Control 中没有误选文件。",
      confirmLabel: "删除 Header",
      danger: true
    })) return;
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

  async function generateNetworkReport(flowViewId?: string): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const report = await window.protoVault.generateNetworkReport({ workspaceRoot: workspace.rootPath, flowViewId });
      setWorkspaceReport({ kind: "document", report });
      setUiNotice(`网络数据流报告已生成：${report.relativePath}`);
    });
  }

  function defaultBaselineTagName(): string {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return `protovault/baseline/${stamp}`;
  }

  async function createBaselineReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const latestStatus = await window.protoVault.gitStatus(workspace.rootPath);
      if (!latestStatus.isRepository) {
        setUiNotice("当前工作区不在 Git 仓库中，无法创建基线 Tag");
        return;
      }
      if (latestStatus.isDirty) {
        setUiNotice("当前工作区存在未提交改动，请先提交或清理后再创建基线 Tag");
        return;
      }
      const suggested = defaultBaselineTagName();
      const tagName = (await requestPrompt({
        title: "创建协议基线 Git Tag",
        message: "为当前干净工作区创建一个可追溯协议基线。",
        detail: "建议使用 protovault/baseline/... 命名，后续版本 Diff 会默认使用最近基线。",
        initialValue: suggested,
        placeholder: "protovault/baseline/..."
      }))?.trim();
      if (!tagName) return;
      const report = await window.protoVault.createBaselineTag({
        workspaceRoot: workspace.rootPath,
        tagName,
        message: `ProtoVault protocol baseline ${tagName}`
      });
      setGitStatus(await window.protoVault.gitStatus(workspace.rootPath));
      setGitTags(await window.protoVault.gitTags(workspace.rootPath));
      setWorkspaceReport({ kind: "baseline", report });
      setUiNotice(`协议基线 Tag 已创建：${report.tagName}`);
    });
  }

  async function runSemanticDiffReport(): Promise<void> {
    if (!workspace) return;
    await runWorkspaceAction(async () => {
      const latestStatus = await window.protoVault.gitStatus(workspace.rootPath);
      const report = await window.protoVault.semanticDiff({
        workspaceRoot: workspace.rootPath,
        baseRef: latestStatus.latestTag
      });
      setWorkspaceReport({ kind: "diff", report });
      setGitStatus(latestStatus);
      setGitTags(await window.protoVault.gitTags(workspace.rootPath));
      setUiNotice(report.baseBaseline
        ? `版本 Diff 完成：${report.changeCount} 个变化`
        : "暂无可用协议基线 Tag；已生成当前工作树比较结果");
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
    if (!await requestConfirm({
      title: "删除 Struct",
      message: `确认删除 ${selectedType.qualifiedName}？`,
      detail: "删除结构体可能影响引用它的字段和协议绑定，请先查看关系图谱和 Git Diff。",
      confirmLabel: "删除 Struct",
      danger: true
    })) return;
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
    if (!await requestConfirm({
      title: "删除 Enum",
      message: `确认删除 ${selectedType.qualifiedName}？`,
      detail: "删除枚举可能影响引用它的字段，请先查看关系图谱和 Git Diff。",
      confirmLabel: "删除 Enum",
      danger: true
    })) return;
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
    if (!await requestConfirm({
      title: `删除 ${label}`,
      message: `确认删除 ${type.qualifiedName}？`,
      detail: "删除会改写 Header；如果该类型被其他结构引用，后续扫描会产生诊断。",
      confirmLabel: `删除 ${label}`,
      danger: true
    })) return;
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
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldType: nextFieldType, fieldName: nextFieldName, initializer: fieldInitializer });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已添加字段：${nextFieldName}`);
      setActiveAction(null);
    });
  }

  async function addFieldInline(type: WorkspaceTypeView, nextFieldType: string, nextFieldName: string, nextInitializer: string): Promise<boolean> {
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
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: type.id, fieldType: trimmedType, fieldName: trimmedName, initializer: nextInitializer });
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
      const result = await window.protoVault.updateField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldId: editingFieldId, fieldType: nextFieldType, fieldName: nextFieldName, initializer: fieldInitializer });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已更新字段：${nextFieldName}`);
      setActiveAction(null);
      setEditingFieldId(null);
    });
  }

  async function updateFieldInline(type: WorkspaceTypeView, field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string, nextInitializer: string): Promise<boolean> {
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
      const result = await window.protoVault.updateField({ workspaceRoot: workspace.rootPath, typeId: type.id, fieldId: field.id, fieldType: trimmedType, fieldName: trimmedName, initializer: nextInitializer });
      applyWorkspaceResult(result, { selectTypeName: type.name, selectFieldName: trimmedName });
      setUiNotice(`已更新字段：${trimmedName}`);
    });
  }

  function updateFieldDraft(type: WorkspaceTypeView, field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string, nextInitializer: string): void {
    setDirtyStructuralEdits((current) => {
      const next = { ...current };
      const savedInitializer = field.initializer ?? "";
      if (nextFieldType === field.type && nextFieldName === field.name && nextInitializer === savedInitializer) delete next[field.id];
      else next[field.id] = {
        kind: "field",
        typeId: type.id,
        fieldId: field.id,
        fieldName: nextFieldName,
        fieldType: nextFieldType,
        fieldInitializer: nextInitializer,
        savedFieldName: field.name,
        savedFieldType: field.type,
        savedFieldInitializer: savedInitializer
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
          fieldName: trimmedName,
          initializer: edit.fieldInitializer
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
      setCenterViewMode("workspace");
      setSelectedFilePath(tab.filePath);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
    } else if (tab.kind === "type") {
      setCenterViewMode("workspace");
      setSelectedTypeId(tab.typeId);
      setSelectedFilePath(null);
      setSelectedMemberId(null);
    } else {
      setCenterViewMode("git");
      setSelectedTypeId(null);
      setSelectedFilePath(null);
      setSelectedMemberId(null);
    }
  }

  async function ensureCanNavigateToTab(nextTabId: string): Promise<boolean> {
    if (!activeTabHasDirtyChanges(nextTabId)) return true;
    const shouldSave = await requestConfirm({
      title: "保存当前标签页？",
      message: "当前标签页存在未保存改动。",
      detail: "确认后会先保存当前改动再切换；取消会留在当前标签页。",
      confirmLabel: "保存并切换",
      cancelLabel: "留在当前"
    });
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

  async function openGitDiffTab(path: string, side: GitDiffSide, commit?: string): Promise<boolean> {
    if (!workspace) return false;
    const tab = tabForGitDiff(path, side, commit);
    if (!(await ensureCanNavigateToTab(tab.id))) return false;
    setLoading(true);
    try {
      const diff = await window.protoVault.gitFileDiff({ workspaceRoot: workspace.rootPath, path, side, commit });
      setGitDiffs((current) => ({ ...current, [tab.id]: diff }));
      setTabs((current) => upsertTab(current, tab));
      setPreviewTab((current) => current?.id === tab.id ? null : current);
      setActiveTabId(tab.id);
      setSelectedFilePath(null);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
      setActiveAction(null);
      setCenterViewMode("git");
      setUiNotice(side === "commit" && commit ? `已打开历史提交对比：${commit.slice(0, 7)} · ${path}` : `已打开 Git 对比：${path}`);
      return true;
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setLoading(false);
    }
  }

  function activeTabHasDirtyChanges(nextTabId?: string): boolean {
    return !!activeTabId && activeTabId !== nextTabId && dirtyTabIds.has(activeTabId);
  }

  async function activateTab(tab: WorkspaceTab): Promise<void> {
    if (!(await ensureCanNavigateToTab(tab.id))) return;
    activateDocumentTab(tab);
  }

  function visibleDocumentTabs(): WorkspaceTab[] {
    const visiblePreview = previewTab && !tabs.some((tab) => tab.id === previewTab.id) ? previewTab : null;
    return visiblePreview ? [...tabs, visiblePreview] : tabs;
  }

  function clearActiveDocumentSelection(): void {
    setActiveTabId(null);
    setSelectedFilePath(null);
    setSelectedTypeId(null);
    setSelectedMemberId(null);
    setActiveAction(null);
  }

  function fallbackAfterClosing(orderedTabs: WorkspaceTab[], closingIds: Set<string>, closingActiveId: string | null): WorkspaceTab | null {
    if (!closingActiveId) return null;
    const activeIndex = orderedTabs.findIndex((tab) => tab.id === closingActiveId);
    if (activeIndex < 0) return orderedTabs.find((tab) => !closingIds.has(tab.id)) ?? null;
    const left = [...orderedTabs.slice(0, activeIndex)].reverse().find((tab) => !closingIds.has(tab.id));
    const right = orderedTabs.slice(activeIndex + 1).find((tab) => !closingIds.has(tab.id));
    return left ?? right ?? null;
  }

  async function closeTabs(tabIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(tabIds)];
    if (uniqueIds.length === 0) return;
    const closingIds = new Set(uniqueIds);
    const dirtyCount = uniqueIds.filter((id) => dirtyTabIds.has(id)).length;
    if (dirtyCount > 0 && !await requestConfirm({
      title: "关闭未保存标签页？",
      message: `${dirtyCount} 个标签页存在未保存改动。`,
      detail: "关闭会丢弃这些标签页的草稿；如果需要写回源文件，请先 Ctrl+S 保存。",
      confirmLabel: "丢弃并关闭",
      cancelLabel: "取消",
      danger: true
    })) return;
    uniqueIds.forEach(discardDirtyForTab);

    const orderedBefore = visibleDocumentTabs();
    const closingActiveId = activeTabId && closingIds.has(activeTabId) ? activeTabId : null;
    const fallback = fallbackAfterClosing(orderedBefore, closingIds, closingActiveId);
    const nextTabs = tabs.filter((tab) => !closingIds.has(tab.id));
    const nextPreview = previewTab && !closingIds.has(previewTab.id) ? previewTab : null;

    setTabs(nextTabs);
    setPreviewTab(nextPreview);
    if (closingActiveId) {
      if (fallback) activateDocumentTab(fallback);
      else clearActiveDocumentSelection();
    }
  }

  function closeTab(tabId: string): void {
    void closeTabs([tabId]);
  }

  async function openFileLocationForTab(tab: WorkspaceTab): Promise<void> {
    if (!workspace || tab.kind !== "file") return;
    try {
      await window.protoVault.openFileLocation({ workspaceRoot: workspace.rootPath, filePath: tab.filePath });
      setUiNotice("已打开 Header 文件位置");
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function openGitEntryLocation(status: GitWorkspaceStatus | null, entry: GitWorkspaceStatus["entries"][number]): Promise<void> {
    if (!workspace || !status?.repositoryRoot) return;
    try {
      await window.protoVault.openFileLocation({ workspaceRoot: workspace.rootPath, filePath: `${status.repositoryRoot}\\${entry.path}` });
      setUiNotice(`已打开文件位置：${entry.path}`);
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : String(error));
    }
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
    }
  }

  async function openEditFieldAction(type: WorkspaceTypeView, field: WorkspaceFieldView): Promise<void> {
    if (!(await openTypeTab(type, field.id))) return;
    setFieldType(field.type);
    setFieldName(field.name);
    setFieldInitializer(field.initializer ?? "");
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
      className={[
        "shell",
        navigatorCollapsed ? "navigator-collapsed" : "",
        inspectorCollapsed ? "inspector-collapsed" : "",
        toolbarCollapsed ? "toolbar-collapsed" : ""
      ].filter(Boolean).join(" ")}
      style={{ gridTemplateColumns: `56px ${navigatorCollapsed ? 0 : navigatorWidth}px ${navigatorCollapsed ? 0 : 6}px minmax(420px, 1fr) ${inspectorCollapsed ? 0 : 6}px ${inspectorCollapsed ? 0 : inspectorWidth}px` }}
    >
      <button
        className="pane-toggle pane-toggle-left"
        style={{ left: navigatorCollapsed ? 56 : 56 + navigatorWidth + 6 }}
        aria-label={navigatorCollapsed ? "展开左侧树图" : "隐藏左侧树图"}
        title={navigatorCollapsed ? "展开左侧树图" : "隐藏左侧树图"}
        onClick={() => setNavigatorCollapsed((value) => !value)}
      >
        {navigatorCollapsed ? "›" : "‹"}
      </button>
      <button
        className="pane-toggle pane-toggle-right"
        style={{ right: inspectorCollapsed ? 0 : inspectorWidth + 6 }}
        aria-label={inspectorCollapsed ? "展开右侧属性栏" : "隐藏右侧属性栏"}
        title={inspectorCollapsed ? "展开右侧属性栏" : "隐藏右侧属性栏"}
        onClick={() => setInspectorCollapsed((value) => !value)}
      >
        {inspectorCollapsed ? "‹" : "›"}
      </button>
      <aside className="rail">
        <div className="mark">PV</div>
        <button className={centerViewMode === "workspace" ? "active" : ""} aria-label="协议工作区" title="协议工作区" onClick={() => setCenterViewMode("workspace")}>◇</button>
        <button className={centerViewMode === "graph" ? "active" : ""} aria-label="关系图谱" title="关系图谱" disabled={!workspace} onClick={() => { setActiveAction(null); setWorkspaceReport(null); setCenterViewMode("graph"); }}>⌬</button>
        <button className={centerViewMode === "network" ? "active" : ""} aria-label="网络地图" title="网络地图" disabled={!workspace} onClick={() => { setActiveAction(null); setWorkspaceReport(null); setCenterViewMode("network"); }}>⇄</button>
        <button className={centerViewMode === "git" ? "active" : ""} aria-label="源代码管理" title="源代码管理 / Git" disabled={!workspace} onClick={() => { setActiveAction(null); setWorkspaceReport(null); setCenterViewMode("git"); }}>⑂</button>
        <button className={centerViewMode === "manual" ? "active" : ""} aria-label="AI 使用助手" title="AI 使用助手 / 本地 Ollama" onClick={() => { setActiveAction(null); setWorkspaceReport(null); setCenterViewMode("manual"); }}>?</button>
        <button aria-label="问题面板 / 运行 Lint" title="问题面板 / 运行 Lint" disabled={!workspace || loading} onClick={() => { setActiveAction(null); setCenterViewMode("workspace"); void runLintReport(); }}>!</button>
      </aside>
      <aside className={centerViewMode === "git" ? "navigator source-control-sidebar" : "navigator"}>
        {centerViewMode === "git" && workspace ? <GitSourceControlNavigator
          workspace={workspace}
          status={gitStatus}
          branches={gitBranches}
          tags={gitTags}
          graph={gitCommitGraph}
          loading={loading}
          onRefresh={() => void runGitAction(() => refreshGitState())}
          onStagePath={(path) => void runGitAction(() => window.protoVault.stageGitPath({ workspaceRoot: workspace.rootPath, path }))}
          onUnstagePath={(path) => void runGitAction(() => window.protoVault.unstageGitPath({ workspaceRoot: workspace.rootPath, path }))}
          onStageAll={() => void runGitAction(() => window.protoVault.stageGitWorkspace({ workspaceRoot: workspace.rootPath }))}
          onUnstageAll={() => void runGitAction(() => window.protoVault.unstageGitWorkspace({ workspaceRoot: workspace.rootPath }))}
          onCommit={(message) => void runGitAction(() => window.protoVault.commitGit({ workspaceRoot: workspace.rootPath, message }))}
          onCheckoutBranch={(branchName) => void runGitAction(() => window.protoVault.checkoutGitBranch({ workspaceRoot: workspace.rootPath, branchName }))}
          onCreateBranch={(branchName) => void runGitAction(() => window.protoVault.createGitBranch({ workspaceRoot: workspace.rootPath, branchName, checkout: true }))}
          onOpenDiff={(entry, side) => void openGitDiffTab(entry.path, side)}
          onOpenCommitDiff={(path, commit) => void openGitDiffTab(path, "commit", commit)}
          selectedCommitHash={selectedGitCommit?.hash ?? null}
          onSelectCommit={setSelectedGitCommitHash}
          onOpenFileLocation={(entry) => void openGitEntryLocation(gitStatus, entry)}
          onCreateBaseline={() => void createBaselineReport()}
          onRunDiff={() => void runSemanticDiffReport()}
          onGenerateDocument={() => void generateDocumentReport()}
        /> : <>
          <div className="navigator-title">
            <div>
              <h1>ProtoVault</h1>
              <p className="eyebrow">协议资产库</p>
            </div>
          </div>
          <div className="tree-actions" aria-label="协议树操作">
            <button aria-label="新增数据结构" title="新增数据结构" disabled={!workspace || loading} onClick={() => openStructuredAction("create-struct")}><span className="tree-action-icon">✎</span><span>Struct</span></button>
            <button aria-label="新增枚举" title="新增枚举" disabled={!workspace || loading} onClick={() => openStructuredAction("create-enum")}><span className="tree-action-icon">E＋</span><span>Enum</span></button>
            <button aria-label="新建 Header 文件" title="新建 Header 文件" disabled={!workspace || loading} onClick={() => openStructuredAction("create-header")}><span className="tree-action-icon">▣＋</span><span>Header</span></button>
            <button aria-label="添加字段" title="添加字段" disabled={selectedType?.kind !== "struct" || loading} onClick={() => openStructuredAction("add-field")}><span className="tree-action-icon">＋f</span><span>字段</span></button>
            <button aria-label="添加枚举项" title="添加枚举项" disabled={selectedType?.kind !== "enum" || loading} onClick={() => openStructuredAction("add-enum-value")}><span className="tree-action-icon">＋#</span><span>枚举项</span></button>
            <button aria-label="排序协议树" title="排序协议树" disabled={!workspace} onClick={() => setUiNotice("协议树已按目录、Header、类型排序")}><span className="tree-action-icon">↥</span><span>排序</span></button>
            <button aria-label="搜索协议树" title="搜索协议树" disabled={!workspace} aria-pressed={treeSearchOpen} onClick={() => setTreeSearchOpen((open) => !open)}><span className="tree-action-icon">⌕</span><span>搜索</span></button>
            <button aria-label="折叠全部" title="折叠全部" disabled={!workspace} onClick={collapseAll}><span className="tree-action-icon">⌃⌄</span><span>折叠</span></button>
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
        </>}
        <div className="workspace-dock" aria-label="工作区管理">
          <div className="workspace-dock-summary">
            <span>{workspace?.name ?? "未打开工作区"}</span>
            <small>{workspace ? `${workspace.files.length} Headers · ${workspace.types.length} Types` : "选择目录或加载示例"}</small>
            {workspace && <small>{gitStatusLabel(gitStatus, gitTags)}</small>}
          </div>
          <div className="workspace-dock-actions">
            <button aria-label="打开本地目录" title="打开本地目录" disabled={loading} onClick={() => void openWorkspace(false)}>▣</button>
            <button aria-label={workspace ? "重新扫描当前工作区" : "加载示例项目"} title={workspace ? "重新扫描当前工作区" : "加载示例项目"} disabled={loading} onClick={() => { if (workspace) void rescanCurrentWorkspace(); else void openWorkspace(true); }}>{loading ? "…" : "↻"}</button>
            <button aria-label="工作区设置" title="工作区设置" onClick={() => setSettingsOpen((open) => !open)}>⚙</button>
          </div>
          {settingsOpen && <div className="workspace-settings-popover" role="dialog" aria-label="工作区设置">
            <div className="workspace-settings-title">
              <strong>全局主题</strong>
              <button aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="theme-options">
              {APP_THEMES.map((theme) => <button
                key={theme.id}
                className={theme.id === appThemeId ? "active" : ""}
                onClick={() => {
                  setAppThemeId(theme.id);
                  setUiNotice(`已切换主题：${theme.name}`);
                }}
              >
                <span>{theme.name}</span>
                <small>{theme.description}</small>
              </button>)}
            </div>
          </div>}
        </div>
      </aside>
      <div
        className={navigatorCollapsed ? "resize-handle collapsed" : "resize-handle"}
        role="separator"
        aria-label="调整左侧树栏宽度"
        onPointerDown={(event) => { if (!navigatorCollapsed) startResize("navigator", event); }}
      />
      <section className="workspace">
        {toolbarCollapsed && <button
          className="toolbar-restore"
          aria-label="展开顶部工作栏"
          title="展开顶部工作栏"
          onClick={() => setToolbarCollapsed(false)}
        >⌄</button>}
        {!toolbarCollapsed && <header className="workspace-toolbar">
          <div className="workspace-context">
            <span>{activeWorkspaceTab?.kind === "git-diff" ? activeWorkspaceTab.title : selectedFile?.relativePath ?? selectedType?.qualifiedName ?? "欢迎"}</span>
            <small>{workspace ? `${workspace.name} · ${workspace.files.length} Headers · ${workspace.types.length} Types` : "尚未打开协议工作区"}</small>
          </div>
          <div className="toolbar-actions">
            <button className="inline-action icon-only" aria-label="返回上一步界面" title="返回上一步界面 · Alt+←" disabled={!navigationAvailability.canGoBack} onClick={() => void navigateHistory("back")}>←</button>
            <button className="inline-action icon-only" aria-label="前进到下一步界面" title="前进到下一步界面 · Alt+→" disabled={!navigationAvailability.canGoForward} onClick={() => void navigateHistory("forward")}>→</button>
            {workspace && <>
              <button className="inline-action" disabled={loading} onClick={() => void runLintReport()}>Lint</button>
              <button className="inline-action" disabled={loading} onClick={() => void generateDocumentReport()}>文档</button>
              <button className="inline-action" disabled={loading} onClick={() => void createBaselineReport()}>基线 Tag</button>
              <button className="inline-action" disabled={loading} onClick={() => void runSemanticDiffReport()}>版本 Diff</button>
            </>}
            {uiNotice && <small className="notice" role="status">{uiNotice}</small>}
            <small className="health">{health}</small>
            <button className="inline-action icon-only" aria-label="隐藏顶部工作栏" title="隐藏顶部工作栏" onClick={() => setToolbarCollapsed(true)}>⌃</button>
          </div>
        </header>}
        {(loading || scanProgress?.phase === "done") && scanProgress && <ScanProgressBar progress={scanProgress} active={loading} />}
        {workspace && externalChange && <ExternalChangePanel
          change={externalChange}
          onRescan={() => void rescanCurrentWorkspace()}
          onDiff={() => {
            setExternalChange(null);
            void runSemanticDiffReport();
          }}
          onDismiss={() => setExternalChange(null)}
        />}
        {!workspace && <article className="welcome-panel">
          <p className="eyebrow">PROTO VAULT · MVP</p>
          <h2>让散落在 Header 中的协议<br />成为可管理的工程资产。</h2>
          <p className="lede">扫描 C++ 数据结构，理解字段布局，维护语义元数据，并用受控生成与语义差异守住协议演进。</p>
          <div className="flow"><span>扫描</span><b>→</b><span>IR</span><b>→</b><span>布局</span><b>→</b><span>生成</span><b>→</b><span>检查</span></div>
        </article>}
        {workspace && <TabStrip
          tabs={tabs}
          previewTab={previewTab}
          activeTabId={activeTabId}
          dirtyTabIds={dirtyTabIds}
          contextMenu={tabContextMenu}
          onActivate={activateTab}
          onClose={closeTab}
          onCloseMany={closeTabs}
          onOpenContextMenu={setTabContextMenu}
          onOpenFileLocation={(tab) => { void openFileLocationForTab(tab); }}
        />}
        {workspace && workspaceReport && <WorkspaceReportPanel report={workspaceReport} workspaceRoot={workspace.rootPath} onClose={() => setWorkspaceReport(null)} />}
        {workspace && centerViewMode === "graph" && <ProtocolGraphView
          workspace={workspace}
          selectedTypeId={selectedTypeId}
          selectedFilePath={selectedFilePath}
          appThemeId={appThemeId}
          onSelectNode={selectGraphNode}
          onOpenNode={openGraphNode}
          onGraphContextChange={handleGraphContextChange}
          onClose={() => setCenterViewMode("workspace")}
        />}
        {workspace && centerViewMode === "network" && <NetworkMapView
          workspace={workspace}
          loading={loading}
          mode={networkMode}
          selectedFlowViewId={networkSelectedFlowViewId}
          onModeChange={setNetworkMode}
          onSelectedFlowViewChange={setNetworkSelectedFlowViewId}
          onWorkspaceChange={replaceWorkspaceResult}
          onGenerateFlowReport={(flowViewId) => void generateNetworkReport(flowViewId)}
          onNotice={setUiNotice}
          onOpenProtocolType={(typeId) => void openProtocolTypeById(typeId)}
          onRequestConfirm={requestConfirm}
        />}
        {workspace && centerViewMode === "git" && <GitDiffWorkspace
          tab={activeWorkspaceTab?.kind === "git-diff" ? activeWorkspaceTab : null}
          diff={activeGitDiff}
          loading={loading}
        />}
        {centerViewMode === "manual" && <AssistantView workspace={workspace} onBack={() => setCenterViewMode("workspace")} />}
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
          fieldInitializer={fieldInitializer}
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
          onFieldInitializerChange={setFieldInitializer}
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
          onRequestConfirm={requestConfirm}
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
      <div
        className={inspectorCollapsed ? "resize-handle collapsed" : "resize-handle"}
        role="separator"
        aria-label="调整属性栏宽度"
        onPointerDown={(event) => { if (!inspectorCollapsed) startResize("inspector", event); }}
      />
      <aside className="inspector">
        <div className="inspector-header">
          <h2>{centerViewMode === "graph" ? "图谱上下文" : centerViewMode === "network" ? "网络摘要" : centerViewMode === "git" ? "Git 摘要" : "属性"}</h2>
        </div>
        {centerViewMode === "network" && workspace ? <NetworkInspector workspace={workspace} />
          : centerViewMode === "git" && workspace ? <GitInspector
          status={gitStatus}
          branches={gitBranches}
          tags={gitTags}
          selectedCommit={selectedGitCommit}
          onOpenCommitDiff={(path, commit) => void openGitDiffTab(path, "commit", commit)}
        />
          : centerViewMode === "graph" && workspace && graphContext ? <GraphInspector
          workspace={workspace}
          graph={graphContext}
          selectedNode={selectedGraphNode}
          onOpenNode={openGraphNode}
          onSelectNode={selectGraphNode}
        />
          : selectedType ? <ProtocolInspector
              type={selectedType}
              layout={selectedLayout}
              selectedField={selectedField}
              selectedEnumValue={selectedEnumValue}
            />
          : selectedFile ? <dl><dt>文件</dt><dd>{selectedFile.relativePath}</dd><dt>Include</dt><dd>{selectedFile.includes.length}</dd><dt>路径</dt><dd className="break">{selectedFile.path}</dd></dl>
            : <dl><dt>阶段</dt><dd>P2/P3</dd><dt>平台</dt><dd>Windows</dd><dt>解析器</dt><dd>{workspace?.scanner ?? "Clang AST"}</dd></dl>}
        {workspace && <ProblemsPanel
          diagnostics={workspace.diagnostics}
          workspaceRoot={workspace.rootPath}
          onOpenDiagnostic={(diagnostic) => { void openDiagnosticLocation(diagnostic); }}
        />}
      </aside>
      {confirmDialog && <ConfirmDialog
        dialog={confirmDialog}
        onCancel={() => resolveConfirmDialog(false)}
        onConfirm={() => resolveConfirmDialog(true)}
      />}
      {promptDialog && <PromptDialog
        dialog={promptDialog}
        onCancel={() => resolvePromptDialog(null)}
        onConfirm={(value) => resolvePromptDialog(value)}
      />}
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

function gitDiffTabId(path: string, side: GitDiffSide, commit?: string): string {
  return `git-diff:${side}:${commit ?? "current"}:${path}`;
}

function tabForGitDiff(path: string, side: GitDiffSide, commit?: string): WorkspaceTab {
  const suffix = side === "index" ? "Index" : side === "commit" ? `Commit ${commit?.slice(0, 7) ?? ""}` : "Working Tree";
  return { id: gitDiffTabId(path, side, commit), kind: "git-diff", title: `${path.split("/").at(-1) ?? path} (${suffix})`, path, side, commit };
}

function buildDirtyTabIds(
  workspace: WorkspaceView,
  dirtyNotes: Record<string, string>,
  dirtyStructuralEdits: Record<string, DirtyStructuralEdit>,
  sourceDrafts: Record<string, string>
): Set<string> {
  const dirtyIds = new Set([...Object.keys(dirtyNotes), ...Object.keys(dirtyStructuralEdits)]);
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
    if (tab.kind === "git-diff") return [tab];
    const type = types.get(tab.typeId);
    return type ? [tabForType(type)] : [];
  });
}

function ScanProgressBar({ progress, active }: { progress: WorkspaceScanProgress; active: boolean }): React.JSX.Element {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const boundedPercent = Math.min(percent, 100);
  return <div className={active ? "scan-progress active" : "scan-progress"} role="status" aria-label="扫描进度">
    <div className="scan-progress-copy">
      <span>{progress.message}</span>
      <small>{progress.phase === "done" ? "完成" : `${boundedPercent}% · ${progress.current}/${progress.total}`}</small>
    </div>
    {progress.file && <small className="scan-progress-file">{progress.file}</small>}
    <div className="scan-progress-track" aria-hidden="true">
      <div style={{ width: `${boundedPercent}%` }} />
    </div>
  </div>;
}

function ExternalChangePanel({ change, onRescan, onDiff, onDismiss }: {
  change: WorkspaceExternalChange;
  onRescan(): void;
  onDiff(): void;
  onDismiss(): void;
}): React.JSX.Element {
  return <section className="external-change-panel" aria-label="外部修改冲突">
    <div>
      <strong>检测到外部 Header 修改</strong>
      <p>{change.relativePath ?? "当前工作区"} 已在 ProtoVault 外部变化。为避免静默覆盖，请先重新导入或查看语义 Diff。</p>
    </div>
    <div className="external-change-actions">
      <button className="inline-action" onClick={onRescan}>重新扫描导入</button>
      <button className="inline-action" onClick={onDiff}>查看 Diff</button>
      <button className="inline-action ghost" onClick={onDismiss}>暂不处理</button>
    </div>
  </section>;
}

function ConfirmDialog({ dialog, onCancel, onConfirm }: {
  dialog: ConfirmDialogState;
  onCancel(): void;
  onConfirm(): void;
}): React.JSX.Element {
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className={dialog.danger ? "app-modal danger" : "app-modal"} role="dialog" aria-modal="true" aria-label={dialog.title} onMouseDown={(event) => event.stopPropagation()}>
      <div className="app-modal-icon" aria-hidden="true">{dialog.danger ? "!" : "✓"}</div>
      <div className="app-modal-body">
        <p className="eyebrow">ProtoVault</p>
        <h2>{dialog.title}</h2>
        <p>{dialog.message}</p>
        {dialog.detail && <small>{dialog.detail}</small>}
      </div>
      <div className="app-modal-actions">
        <button className="inline-action ghost" onClick={onCancel}>{dialog.cancelLabel ?? "取消"}</button>
        <button className={dialog.danger ? "inline-action danger" : "inline-action primary"} autoFocus onClick={onConfirm}>{dialog.confirmLabel ?? "确认"}</button>
      </div>
    </section>
  </div>;
}

function PromptDialog({ dialog, onCancel, onConfirm }: {
  dialog: PromptDialogState;
  onCancel(): void;
  onConfirm(value: string): void;
}): React.JSX.Element {
  const [value, setValue] = React.useState(dialog.initialValue);
  React.useEffect(() => setValue(dialog.initialValue), [dialog.initialValue]);
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="app-modal prompt" role="dialog" aria-modal="true" aria-label={dialog.title} onMouseDown={(event) => event.stopPropagation()}>
      <div className="app-modal-icon" aria-hidden="true">#</div>
      <form className="app-modal-body" onSubmit={(event) => {
        event.preventDefault();
        onConfirm(value);
      }}>
        <p className="eyebrow">ProtoVault</p>
        <h2>{dialog.title}</h2>
        <p>{dialog.message}</p>
        {dialog.detail && <small>{dialog.detail}</small>}
        <input autoFocus value={value} placeholder={dialog.placeholder} onChange={(event) => setValue(event.target.value)} />
        <div className="app-modal-actions">
          <button type="button" className="inline-action ghost" onClick={onCancel}>{dialog.cancelLabel ?? "取消"}</button>
          <button className="inline-action primary" disabled={!value.trim()}>{dialog.confirmLabel ?? "确认"}</button>
        </div>
      </form>
    </section>
  </div>;
}

function TabStrip({ tabs, previewTab, activeTabId, dirtyTabIds, contextMenu, onActivate, onClose, onCloseMany, onOpenContextMenu, onOpenFileLocation }: {
  tabs: WorkspaceTab[];
  previewTab: WorkspaceTab | null;
  activeTabId: string | null;
  dirtyTabIds: Set<string>;
  contextMenu: TabContextMenuState | null;
  onActivate(tab: WorkspaceTab): void | Promise<void>;
  onClose(tabId: string): void;
  onCloseMany(tabIds: string[]): void;
  onOpenContextMenu(menu: TabContextMenuState | null): void;
  onOpenFileLocation(tab: WorkspaceTab): void;
}): React.JSX.Element | null {
  const visiblePreview = previewTab && !tabs.some((tab) => tab.id === previewTab.id) ? previewTab : null;
  if (tabs.length === 0 && !visiblePreview) return null;
  const orderedTabs = visiblePreview ? [...tabs, visiblePreview] : tabs;
  function openTabMenu(event: React.MouseEvent, tab: WorkspaceTab): void {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu({ x: event.clientX, y: event.clientY, tab, orderedTabs });
  }

  return <nav className="tab-strip" aria-label="工作区标签页">
    {tabs.map((tab) => {
      const dirty = dirtyTabIds.has(tab.id);
      const tabKindLabel = tab.kind === "file" ? "H" : tab.kind === "type" ? "S" : "G";
      return <div className={`${tab.id === activeTabId ? "workspace-tab active" : "workspace-tab"}${dirty ? " dirty" : ""}`} key={tab.id} onContextMenu={(event) => openTabMenu(event, tab)}>
      <button className="workspace-tab-main" aria-label={`切换到 ${tab.title}${dirty ? " 未保存" : ""}`} onClick={() => { void onActivate(tab); }}>
        <span className={tab.kind === "file" ? "tab-kind file" : tab.kind === "type" ? "tab-kind type" : "tab-kind git"}>{tabKindLabel}</span>
        <span>{tab.title}</span>
        {dirty && <small>●</small>}
      </button>
      <button className="workspace-tab-close" aria-label={`关闭 ${tab.title}`} onClick={() => onClose(tab.id)}>×</button>
    </div>;
    })}
    {visiblePreview && (() => {
      const dirty = dirtyTabIds.has(visiblePreview.id);
      const tabKindLabel = visiblePreview.kind === "file" ? "H" : visiblePreview.kind === "type" ? "S" : "G";
      return <div className={`${visiblePreview.id === activeTabId ? "workspace-tab preview active" : "workspace-tab preview"}${dirty ? " dirty" : ""}`} key={`preview:${visiblePreview.id}`} onContextMenu={(event) => openTabMenu(event, visiblePreview)}>
      <button className="workspace-tab-main" aria-label={`预览 ${visiblePreview.title}${dirty ? " 未保存" : ""}`} onClick={() => { void onActivate(visiblePreview); }}>
        <span className={visiblePreview.kind === "file" ? "tab-kind file" : visiblePreview.kind === "type" ? "tab-kind type" : "tab-kind git"}>{tabKindLabel}</span>
        <span>{visiblePreview.title}</span>
        <small>{dirty ? "●" : "Preview"}</small>
      </button>
      <button className="workspace-tab-close" aria-label={`关闭预览 ${visiblePreview.title}`} onClick={() => onClose(visiblePreview.id)}>×</button>
    </div>;
    })()}
    {contextMenu && <TabContextMenu
      menu={contextMenu}
      onClose={() => onOpenContextMenu(null)}
      onOpenFileLocation={onOpenFileLocation}
      onCloseTab={(tab) => onClose(tab.id)}
      onCloseMany={onCloseMany}
    />}
  </nav>;
}

function TabContextMenu({ menu, onClose, onOpenFileLocation, onCloseTab, onCloseMany }: {
  menu: TabContextMenuState;
  onClose(): void;
  onOpenFileLocation(tab: WorkspaceTab): void;
  onCloseTab(tab: WorkspaceTab): void;
  onCloseMany(tabIds: string[]): void;
}): React.JSX.Element {
  const index = menu.orderedTabs.findIndex((tab) => tab.id === menu.tab.id);
  const leftTabs = index > 0 ? menu.orderedTabs.slice(0, index) : [];
  const rightTabs = index >= 0 ? menu.orderedTabs.slice(index + 1) : [];
  const otherTabs = menu.orderedTabs.filter((tab) => tab.id !== menu.tab.id);

  function run(action: () => void): void {
    action();
    onClose();
  }

  return <div
    className="context-menu tab-context-menu"
    role="menu"
    aria-label="标签页菜单"
    style={{ left: menu.x, top: menu.y }}
    onClick={(event) => event.stopPropagation()}
    onContextMenu={(event) => event.preventDefault()}
  >
    <button role="menuitem" disabled={menu.tab.kind !== "file"} onClick={() => run(() => onOpenFileLocation(menu.tab))}>打开文件位置</button>
    <hr />
    <button role="menuitem" onClick={() => run(() => onCloseTab(menu.tab))}>关闭</button>
    <button role="menuitem" disabled={otherTabs.length === 0} onClick={() => run(() => onCloseMany(otherTabs.map((tab) => tab.id)))}>关闭其他标签</button>
    <button role="menuitem" disabled={leftTabs.length === 0} onClick={() => run(() => onCloseMany(leftTabs.map((tab) => tab.id)))}>关闭左侧标签</button>
    <button role="menuitem" disabled={rightTabs.length === 0} onClick={() => run(() => onCloseMany(rightTabs.map((tab) => tab.id)))}>关闭右侧标签</button>
  </div>;
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
  fieldInitializer,
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
  onFieldInitializerChange,
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
  fieldInitializer: string;
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
  onFieldInitializerChange(value: string): void;
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
      <label>
        <span>初始值</span>
        <input value={fieldInitializer} onChange={(event) => onFieldInitializerChange(event.target.value)} placeholder="可空，例如 0 / false / {}" />
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
      <label>
        <span>初始值</span>
        <input value={fieldInitializer} onChange={(event) => onFieldInitializerChange(event.target.value)} placeholder="可空，例如 0 / false / {}" />
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
  onOpenContextMenu,
  onRequestConfirm
}: {
  type: WorkspaceTypeView;
  workspaceTypes: WorkspaceTypeView[];
  selectedMemberId: string | null;
  loading: boolean;
  fieldTypeOptions: FieldTypeOption[];
  dirtyNotes: Record<string, string>;
  dirtyStructuralEdits: Record<string, DirtyStructuralEdit>;
  onEditType(): void;
  onAddFieldInline(type: WorkspaceTypeView, fieldType: string, fieldName: string, initializer: string): Promise<boolean>;
  onAddEnumValueInline(type: WorkspaceTypeView, valueName: string, valueNumber: string): Promise<boolean>;
  onFieldDraftChange(type: WorkspaceTypeView, field: WorkspaceFieldView, fieldType: string, fieldName: string, initializer: string): void;
  onEnumValueDraftChange(type: WorkspaceTypeView, value: WorkspaceEnumValueView, valueName: string, valueNumber: string): void;
  onSaveStructuralEdit(targetId: string): Promise<boolean>;
  onJumpToType(type: WorkspaceTypeView): void;
  onSelectMember(memberId: string): void;
  onLocateMemberInTree(type: WorkspaceTypeView, memberId: string): void;
  onNoteChange(targetId: string, value: string, savedValue: string): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
  onRequestConfirm(dialog: ConfirmDialogState): Promise<boolean>;
}): React.JSX.Element {
  const [addingField, setAddingField] = React.useState(false);
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [draftFieldType, setDraftFieldType] = React.useState("std::uint32_t");
  const [draftFieldName, setDraftFieldName] = React.useState("value");
  const [draftFieldInitializer, setDraftFieldInitializer] = React.useState("");
  const [addingEnumValue, setAddingEnumValue] = React.useState(false);
  const [editingEnumValueId, setEditingEnumValueId] = React.useState<string | null>(null);
  const [draftEnumValueName, setDraftEnumValueName] = React.useState("NewValue");
  const [draftEnumValueNumber, setDraftEnumValueNumber] = React.useState("");

  React.useEffect(() => {
    setAddingField(false);
    setEditingFieldId(null);
    setDraftFieldType("std::uint32_t");
    setDraftFieldName("value");
    setDraftFieldInitializer("");
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
    setDraftFieldInitializer("");
  }

  function beginEditField(field: WorkspaceFieldView): void {
    const edit = dirtyStructuralEdits[field.id];
    setAddingField(false);
    setEditingFieldId(field.id);
    setDraftFieldType(edit?.kind === "field" ? edit.fieldType : field.type);
    setDraftFieldName(edit?.kind === "field" ? edit.fieldName : field.name);
    setDraftFieldInitializer(edit?.kind === "field" ? edit.fieldInitializer : field.initializer ?? "");
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
    const ok = await onAddFieldInline(type, draftFieldType, draftFieldName, draftFieldInitializer);
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

  function changeFieldDraft(field: WorkspaceFieldView, nextFieldType: string, nextFieldName: string, nextInitializer: string): void {
    setDraftFieldType(nextFieldType);
    setDraftFieldName(nextFieldName);
    setDraftFieldInitializer(nextInitializer);
    onFieldDraftChange(type, field, nextFieldType, nextFieldName, nextInitializer);
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
      const shouldSave = await onRequestConfirm({
        title: "保存当前行？",
        message: "当前行存在未保存的结构化更改。",
        detail: "确认后会保存字段或枚举项修改；取消会继续保留编辑状态。",
        confirmLabel: "保存当前行",
        cancelLabel: "继续编辑"
      });
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
        <p>类型注释同步到 Header 上方的 <code>/// @brief</code>；字段注释同步到字段声明同行的 <code>// 注释</code>。</p>
      </div>
      {noteEditor(type, `${type.name} 类型注释`)}
    </section>
    <div className="table-scroll">
    {type.kind === "struct" ? <table><thead><tr><th>字段</th><th>类型</th><th>初始值</th><th>注释</th></tr></thead><tbody>
      {type.fields.map((field) => {
        const editing = editingFieldId === field.id;
        const edit = dirtyStructuralEdits[field.id];
        const displayName = edit?.kind === "field" ? edit.fieldName : field.name;
        const displayInitializer = edit?.kind === "field" ? edit.fieldInitializer : field.initializer ?? "";
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
                <td><input className="table-input" aria-label="字段名称" value={draftFieldName} onChange={(event) => changeFieldDraft(field, draftFieldType, event.target.value, draftFieldInitializer)} onKeyDown={(event) => { if (event.key === "Escape") setEditingFieldId(null); }} autoFocus /></td>
                <td><FieldTypeInput compact label="字段类型" value={draftFieldType} options={fieldTypeOptions} onChange={(value) => changeFieldDraft(field, value, draftFieldName, draftFieldInitializer)} /></td>
                <td><input className="table-input mono" aria-label="字段初始值" value={draftFieldInitializer} onChange={(event) => changeFieldDraft(field, draftFieldType, draftFieldName, event.target.value)} placeholder="可空" /></td>
                <td>{noteEditor(field, `${field.name} 字段注释`, true)}</td>
              </>
            : <>
                <td>{displayName}</td>
                <td>{fieldTypeDisplay(field)}</td>
                <td>{displayInitializer ? <code>{displayInitializer}</code> : "—"}</td>
                <td>{noteEditor(field, `${field.name} 字段注释`, true)}</td>
              </>}
        </tr>;
      })}
      {addingField && <tr className="draft-row">
        <td><input className="table-input" aria-label="新增字段名称" value={draftFieldName} onChange={(event) => setDraftFieldName(event.target.value)} autoFocus /></td>
        <td><FieldTypeInput compact label="新增字段类型" value={draftFieldType} options={fieldTypeOptions} onChange={setDraftFieldType} /></td>
        <td><input className="table-input mono" aria-label="新增字段初始值" value={draftFieldInitializer} onChange={(event) => setDraftFieldInitializer(event.target.value)} placeholder="可空" /></td>
        <td><div className="row-actions"><span>新增</span><button className="inline-action" disabled={loading} onClick={() => void saveAddedField()}>保存</button><button className="inline-action" disabled={loading} onClick={() => setAddingField(false)}>取消</button></div></td>
      </tr>}
    </tbody></table> : <table><thead><tr><th>枚举项</th><th>值</th><th>注释</th></tr></thead><tbody>
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
              </>
            : <>
                <td>{displayName}</td>
                <td>{displayValue}</td>
                <td>{noteEditor(value, `${value.name} 枚举项注释`, true)}</td>
              </>}
        </tr>;
      })}
      {addingEnumValue && <tr className="draft-row">
        <td><input className="table-input" aria-label="新增枚举项名称" value={draftEnumValueName} onChange={(event) => setDraftEnumValueName(event.target.value)} autoFocus /></td>
        <td><input className="table-input mono" aria-label="新增枚举值" value={draftEnumValueNumber} onChange={(event) => setDraftEnumValueNumber(event.target.value)} placeholder="自动" /></td>
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
  const documentTitle = report.kind === "document" && report.report.relativePath.includes("network-flow-") ? "网络数据流报告" : "协议文档";
  return <section className="report-panel" aria-label="协议报告">
    <div className="report-panel-title">
      <div>
        <p className="eyebrow">REPORT</p>
        <h2>{report.kind === "lint" ? "协议 Lint"
          : report.kind === "document" ? documentTitle
            : report.kind === "baseline" ? "协议基线 Tag"
              : "版本 Diff"}</h2>
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
      <p>Markdown {documentTitle}已生成：</p>
      <code>{report.report.relativePath}</code>
      <pre className="report-preview">{report.report.content.slice(0, 4000)}</pre>
    </>}

    {report.kind === "baseline" && <>
      <div className="report-summary">
        <span>{report.report.typeCount} Types</span>
        <span>{report.report.fileCount} Headers</span>
        <span>{report.report.protocolBindingCount} Bindings</span>
      </div>
      <p>基线已写入，并创建 Git Tag：</p>
      <code>{report.report.tagName}</code>
      <code>{report.report.relativePath}</code>
      {report.report.shortCommit && <p>Commit：{report.report.shortCommit}</p>}
    </>}

    {report.kind === "diff" && <>
      <div className="report-summary">
        <span>变化 {report.report.changeCount}</span>
        <span>Breaking {report.report.breakingCount}</span>
        <span>Compatible {report.report.compatibleCount}</span>
        <span>Review {report.report.reviewCount}</span>
      </div>
      <p>{report.report.baseBaseline
        ? `基线：${report.report.baseBaseline.tagName} · ${report.report.baseBaseline.relativePath}`
        : "暂无历史基线；当前仅生成 working-tree 结果。"}</p>
      <p>目标：{report.report.targetRef}</p>
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

const NETWORK_NODE_KIND_OPTIONS: Array<{ value: NetworkNodeKind; label: string }> = [
  { value: "simulator", label: "仿真主控" },
  { value: "model", label: "模型节点" },
  { value: "service", label: "算法服务" },
  { value: "gateway", label: "网关" },
  { value: "storage", label: "记录/存储" },
  { value: "visualization", label: "可视化" },
  { value: "hardware", label: "硬件设备" },
  { value: "external", label: "外部系统" },
  { value: "other", label: "其他" }
];

const NETWORK_TRANSPORT_OPTIONS: Array<{ value: NetworkTransportKind; label: string }> = [
  { value: "udp", label: "UDP" },
  { value: "tcp", label: "TCP" },
  { value: "dds", label: "DDS" },
  { value: "shared-memory", label: "共享内存" },
  { value: "file", label: "文件" },
  { value: "mq", label: "MQ" },
  { value: "custom", label: "自定义总线" },
  { value: "manual", label: "抽象链路" }
];

const PROTOCOL_BINDING_CRITICALITY_OPTIONS: Array<{ value: ProtocolBindingCriticality; label: string }> = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
  { value: "critical", label: "关键" }
];

type NetworkNodeFormState = {
  name: string;
  kind: NetworkNodeKind;
  role: string;
  subsystem: string;
  host: string;
  process: string;
  hardwareProfile: string;
  softwareProfile: string;
  notes: string;
};
type NetworkLinkFormState = {
  name: string;
  fromNodeId: string;
  toNodeId: string;
  transport: NetworkTransportKind;
  endpoint: string;
  latencyBudgetMs: string;
  bandwidthLimitMbps: string;
  critical: boolean;
  notes: string;
};
type ProtocolBindingFormState = {
  name: string;
  linkId: string;
  typeId: string;
  dataName: string;
  frequencyHz: string;
  batchSize: string;
  peakMultiplier: string;
  criticality: ProtocolBindingCriticality;
  notes: string;
};
type FlowViewFormState = {
  name: string;
  description: string;
  filter: string;
};
type FlowViewAnalysis = {
  nodes: WorkspaceNetworkNodeView[];
  links: WorkspaceNetworkLinkView[];
  bindings: WorkspaceProtocolBindingView[];
  totalBandwidthBps: number;
  busiestNode?: WorkspaceNetworkNodeView;
  busiestLink?: WorkspaceNetworkLinkView;
  warnings: string[];
};

function emptyNodeForm(): NetworkNodeFormState {
  return {
    name: "",
    kind: "model",
    role: "",
    subsystem: "",
    host: "",
    process: "",
    hardwareProfile: "",
    softwareProfile: "",
    notes: ""
  };
}

function emptyLinkForm(workspace: WorkspaceView): NetworkLinkFormState {
  return {
    name: "",
    fromNodeId: workspace.network.nodes[0]?.id ?? "",
    toNodeId: workspace.network.nodes[1]?.id ?? workspace.network.nodes[0]?.id ?? "",
    transport: "udp",
    endpoint: "",
    latencyBudgetMs: "",
    bandwidthLimitMbps: "",
    critical: false,
    notes: ""
  };
}

function emptyBindingForm(workspace: WorkspaceView): ProtocolBindingFormState {
  return {
    name: "",
    linkId: workspace.network.links[0]?.id ?? "",
    typeId: workspace.types[0]?.id ?? "",
    dataName: "",
    frequencyHz: "1",
    batchSize: "1",
    peakMultiplier: "1",
    criticality: "normal",
    notes: ""
  };
}

function emptyFlowViewForm(): FlowViewFormState {
  return { name: "", description: "", filter: "" };
}

function networkFlowViewOptions(workspace: WorkspaceView): WorkspaceFlowView[] {
  return [
    { id: "derived:all", name: "全量网络", description: "展示当前网络地图的所有节点、链路和协议载荷。", filter: "", source: "derived" },
    { id: "derived:critical", name: "关键与高风险", description: "自动聚合关键链路、高关键等级绑定和超过带宽上限的链路。", filter: "critical", source: "derived" },
    ...workspace.network.views
  ];
}

function NetworkMapView({ workspace, loading, mode, selectedFlowViewId, onModeChange, onSelectedFlowViewChange, onWorkspaceChange, onGenerateFlowReport, onNotice, onOpenProtocolType, onRequestConfirm }: {
  workspace: WorkspaceView;
  loading: boolean;
  mode: NetworkTabMode;
  selectedFlowViewId: string;
  onModeChange: (mode: NetworkTabMode) => void;
  onSelectedFlowViewChange: (viewId: string) => void;
  onWorkspaceChange: (workspace: WorkspaceView) => void;
  onGenerateFlowReport: (flowViewId: string) => void;
  onNotice: (message: string) => void;
  onOpenProtocolType: (typeId: string) => void;
  onRequestConfirm(dialog: ConfirmDialogState): Promise<boolean>;
}): React.JSX.Element {
  const [pending, setPending] = React.useState(false);
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = React.useState<string | null>(null);
  const [editingBindingId, setEditingBindingId] = React.useState<string | null>(null);
  const [editingFlowViewId, setEditingFlowViewId] = React.useState<string | null>(null);
  const [nodeForm, setNodeForm] = React.useState<NetworkNodeFormState>(() => emptyNodeForm());
  const [linkForm, setLinkForm] = React.useState<NetworkLinkFormState>(() => emptyLinkForm(workspace));
  const [bindingForm, setBindingForm] = React.useState<ProtocolBindingFormState>(() => emptyBindingForm(workspace));
  const [flowViewForm, setFlowViewForm] = React.useState<FlowViewFormState>(() => emptyFlowViewForm());
  const busy = loading || pending;
  const flowViews = React.useMemo<WorkspaceFlowView[]>(() => networkFlowViewOptions(workspace), [workspace]);
  const selectedFlowView = flowViews.find((view) => view.id === selectedFlowViewId) ?? flowViews[0];
  const selectedFlowAnalysis = React.useMemo(() => deriveFlowViewAnalysis(workspace, selectedFlowView), [selectedFlowView, workspace]);

  React.useEffect(() => {
    if (!editingLinkId) {
      setLinkForm((current) => ({
        ...current,
        fromNodeId: current.fromNodeId || workspace.network.nodes[0]?.id || "",
        toNodeId: current.toNodeId || workspace.network.nodes[1]?.id || workspace.network.nodes[0]?.id || ""
      }));
    }
    if (!editingBindingId) {
      setBindingForm((current) => ({
        ...current,
        linkId: current.linkId || workspace.network.links[0]?.id || "",
        typeId: current.typeId || workspace.types[0]?.id || ""
      }));
    }
    if (!flowViews.some((view) => view.id === selectedFlowViewId)) {
      onSelectedFlowViewChange(flowViews[0]?.id ?? "derived:all");
    }
  }, [editingBindingId, editingLinkId, flowViews, onSelectedFlowViewChange, selectedFlowViewId, workspace.network.links, workspace.network.nodes, workspace.types]);

  async function run(action: () => Promise<WorkspaceView>, message: string): Promise<void> {
    setPending(true);
    try {
      const result = await action();
      onWorkspaceChange(result);
      onNotice(message);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function resetNodeForm(): void {
    setEditingNodeId(null);
    setNodeForm(emptyNodeForm());
  }

  function resetLinkForm(nextWorkspace = workspace): void {
    setEditingLinkId(null);
    setLinkForm(emptyLinkForm(nextWorkspace));
  }

  function resetBindingForm(nextWorkspace = workspace): void {
    setEditingBindingId(null);
    setBindingForm(emptyBindingForm(nextWorkspace));
  }

  function resetFlowViewForm(): void {
    setEditingFlowViewId(null);
    setFlowViewForm(emptyFlowViewForm());
  }

  function editNode(node: WorkspaceNetworkNodeView): void {
    onModeChange("nodes");
    setEditingNodeId(node.id);
    setNodeForm({
      name: node.name,
      kind: node.kind,
      role: node.role ?? "",
      subsystem: node.subsystem ?? "",
      host: node.host ?? "",
      process: node.process ?? "",
      hardwareProfile: node.hardwareProfile ?? "",
      softwareProfile: node.softwareProfile ?? "",
      notes: node.notes ?? ""
    });
  }

  function editLink(link: WorkspaceNetworkLinkView): void {
    onModeChange("links");
    setEditingLinkId(link.id);
    setLinkForm({
      name: link.name,
      fromNodeId: link.fromNodeId,
      toNodeId: link.toNodeId,
      transport: link.transport,
      endpoint: link.endpoint ?? "",
      latencyBudgetMs: link.latencyBudgetMs === undefined ? "" : String(link.latencyBudgetMs),
      bandwidthLimitMbps: link.bandwidthLimitMbps === undefined ? "" : String(link.bandwidthLimitMbps),
      critical: link.critical,
      notes: link.notes ?? ""
    });
  }

  function editBinding(binding: WorkspaceProtocolBindingView): void {
    onModeChange("bindings");
    setEditingBindingId(binding.id);
    setBindingForm({
      name: binding.name,
      linkId: binding.linkId,
      typeId: binding.typeId,
      dataName: binding.dataName ?? "",
      frequencyHz: String(binding.frequencyHz),
      batchSize: String(binding.batchSize),
      peakMultiplier: String(binding.peakMultiplier),
      criticality: binding.criticality,
      notes: binding.notes ?? ""
    });
  }

  function editFlowView(view: WorkspaceFlowView): void {
    if (view.source !== "manual" && !workspace.network.views.some((item) => item.id === view.id)) return;
    onModeChange("flows");
    onSelectedFlowViewChange(view.id);
    setEditingFlowViewId(view.id);
    setFlowViewForm({
      name: view.name,
      description: view.description ?? "",
      filter: view.filter ?? ""
    });
  }

  function optionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : undefined;
  }

  async function submitNode(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const payload = { workspaceRoot: workspace.rootPath, ...nodeForm };
    if (editingNodeId) {
      await run(() => window.protoVault.updateNetworkNode({ ...payload, nodeId: editingNodeId }), `已更新网络节点：${nodeForm.name}`);
    } else {
      await run(() => window.protoVault.createNetworkNode(payload), `已创建网络节点：${nodeForm.name}`);
    }
    resetNodeForm();
  }

  async function submitLink(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const payload = {
      workspaceRoot: workspace.rootPath,
      name: linkForm.name,
      fromNodeId: linkForm.fromNodeId,
      toNodeId: linkForm.toNodeId,
      transport: linkForm.transport,
      endpoint: linkForm.endpoint,
      latencyBudgetMs: optionalNumber(linkForm.latencyBudgetMs),
      bandwidthLimitMbps: optionalNumber(linkForm.bandwidthLimitMbps),
      critical: linkForm.critical,
      notes: linkForm.notes
    };
    if (editingLinkId) {
      await run(() => window.protoVault.updateNetworkLink({ ...payload, linkId: editingLinkId }), `已更新通信链路：${linkForm.name}`);
    } else {
      await run(() => window.protoVault.createNetworkLink(payload), `已创建通信链路：${linkForm.name}`);
    }
    resetLinkForm();
  }

  async function submitBinding(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const payload = {
      workspaceRoot: workspace.rootPath,
      name: bindingForm.name,
      linkId: bindingForm.linkId,
      typeId: bindingForm.typeId,
      dataName: bindingForm.dataName,
      frequencyHz: optionalNumber(bindingForm.frequencyHz),
      batchSize: optionalNumber(bindingForm.batchSize),
      peakMultiplier: optionalNumber(bindingForm.peakMultiplier),
      criticality: bindingForm.criticality,
      notes: bindingForm.notes
    };
    if (editingBindingId) {
      await run(() => window.protoVault.updateProtocolBinding({ ...payload, bindingId: editingBindingId }), `已更新协议绑定：${bindingForm.name}`);
    } else {
      await run(() => window.protoVault.createProtocolBinding(payload), `已创建协议绑定：${bindingForm.name}`);
    }
    resetBindingForm();
  }

  async function submitFlowView(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const payload = {
      workspaceRoot: workspace.rootPath,
      name: flowViewForm.name,
      description: flowViewForm.description,
      filter: flowViewForm.filter,
      source: "manual" as const
    };
    if (editingFlowViewId) {
      await run(() => window.protoVault.updateNetworkFlowView({ ...payload, viewId: editingFlowViewId }), `已更新数据流视图：${flowViewForm.name}`);
      onSelectedFlowViewChange(editingFlowViewId);
    } else {
      const beforeIds = new Set(workspace.network.views.map((view) => view.id));
      await run(async () => {
        const result = await window.protoVault.createNetworkFlowView(payload);
        const created = result.network.views.find((view) => !beforeIds.has(view.id));
        if (created) onSelectedFlowViewChange(created.id);
        return result;
      }, `已创建数据流视图：${flowViewForm.name}`);
    }
    resetFlowViewForm();
  }

  async function deleteNode(node: WorkspaceNetworkNodeView): Promise<void> {
    if (!await onRequestConfirm({
      title: "删除网络节点",
      message: `确认删除网络节点 ${node.name}？`,
      detail: "关联链路和协议绑定也会被删除。建议先确认数据流画布和报告影响。",
      confirmLabel: "删除节点",
      danger: true
    })) return;
    await run(() => window.protoVault.deleteNetworkNode({ workspaceRoot: workspace.rootPath, nodeId: node.id }), `已删除网络节点：${node.name}`);
  }

  async function deleteLink(link: WorkspaceNetworkLinkView): Promise<void> {
    if (!await onRequestConfirm({
      title: "删除通信链路",
      message: `确认删除通信链路 ${link.name}？`,
      detail: "链路上的协议绑定也会被删除，相关 FlowView 可能不再匹配。",
      confirmLabel: "删除链路",
      danger: true
    })) return;
    await run(() => window.protoVault.deleteNetworkLink({ workspaceRoot: workspace.rootPath, linkId: link.id }), `已删除通信链路：${link.name}`);
  }

  async function deleteBinding(binding: WorkspaceProtocolBindingView): Promise<void> {
    if (!await onRequestConfirm({
      title: "删除协议绑定",
      message: `确认删除协议绑定 ${binding.name}？`,
      detail: "删除后链路吞吐估算和数据流视角会立即更新。",
      confirmLabel: "删除绑定",
      danger: true
    })) return;
    await run(() => window.protoVault.deleteProtocolBinding({ workspaceRoot: workspace.rootPath, bindingId: binding.id }), `已删除协议绑定：${binding.name}`);
  }

  async function deleteFlowView(view: WorkspaceFlowView): Promise<void> {
    if (!workspace.network.views.some((item) => item.id === view.id)) return;
    if (!await onRequestConfirm({
      title: "删除数据流视图",
      message: `确认删除数据流视图 ${view.name}？`,
      detail: "这只会删除观察视角，不会删除节点、链路或协议绑定事实。",
      confirmLabel: "删除视图",
      danger: true
    })) return;
    await run(() => window.protoVault.deleteNetworkFlowView({ workspaceRoot: workspace.rootPath, viewId: view.id }), `已删除数据流视图：${view.name}`);
    onSelectedFlowViewChange("derived:all");
    resetFlowViewForm();
  }

  const totalBandwidth = workspace.network.links.reduce((sum, link) => sum + link.estimatedBandwidthBps, 0);

  return <section className="network-map-view" aria-label="协议网络地图">
    <div className="network-hero">
      <div>
        <p className="eyebrow">PROTOCOL NETWORK MAP</p>
        <h2>网络事实层</h2>
        <p>维护实体节点、通信链路和链路上的协议载荷；业务数据流和性能风险从这些事实中派生。</p>
      </div>
      <div className="network-kpis">
        <span><b>{workspace.network.nodes.length}</b><small>节点</small></span>
        <span><b>{workspace.network.links.length}</b><small>链路</small></span>
        <span><b>{workspace.network.bindings.length}</b><small>绑定</small></span>
        <span><b>{formatBandwidth(totalBandwidth)}</b><small>估算总量</small></span>
      </div>
    </div>

    <div className="network-tabs" role="tablist">
      <button className={mode === "nodes" ? "active" : ""} onClick={() => onModeChange("nodes")}>节点</button>
      <button className={mode === "links" ? "active" : ""} onClick={() => onModeChange("links")}>链路</button>
      <button className={mode === "bindings" ? "active" : ""} onClick={() => onModeChange("bindings")}>协议绑定</button>
      <button className={mode === "flows" ? "active" : ""} onClick={() => onModeChange("flows")}>数据流视角</button>
      <button className={mode === "flow-canvas" ? "active" : ""} onClick={() => onModeChange("flow-canvas")}>数据流画布</button>
    </div>

    {mode === "nodes" && <div className="network-grid">
      <form className="network-form" onSubmit={(event) => void submitNode(event)}>
        <h3>{editingNodeId ? "编辑节点" : "创建节点"}</h3>
        <label>名称<input value={nodeForm.name} onChange={(event) => setNodeForm({ ...nodeForm, name: event.target.value })} placeholder="RadarModel" /></label>
        <label>类型<select value={nodeForm.kind} onChange={(event) => setNodeForm({ ...nodeForm, kind: event.target.value as NetworkNodeKind })}>{NETWORK_NODE_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>角色<input value={nodeForm.role} onChange={(event) => setNodeForm({ ...nodeForm, role: event.target.value })} placeholder="生产雷达原始数据" /></label>
        <label>分系统<input value={nodeForm.subsystem} onChange={(event) => setNodeForm({ ...nodeForm, subsystem: event.target.value })} placeholder="Radar" /></label>
        <label>主机<input value={nodeForm.host} onChange={(event) => setNodeForm({ ...nodeForm, host: event.target.value })} placeholder="sim-host-01" /></label>
        <label>进程<input value={nodeForm.process} onChange={(event) => setNodeForm({ ...nodeForm, process: event.target.value })} placeholder="radar_model.exe" /></label>
        <label>硬件画像<textarea value={nodeForm.hardwareProfile} onChange={(event) => setNodeForm({ ...nodeForm, hardwareProfile: event.target.value })} placeholder="CPU/GPU/网卡/内存…" /></label>
        <label>软件画像<textarea value={nodeForm.softwareProfile} onChange={(event) => setNodeForm({ ...nodeForm, softwareProfile: event.target.value })} placeholder="运行时/线程/队列/容器…" /></label>
        <label>备注<textarea value={nodeForm.notes} onChange={(event) => setNodeForm({ ...nodeForm, notes: event.target.value })} /></label>
        <div className="network-form-actions">
          <button disabled={busy || !nodeForm.name.trim()}>{editingNodeId ? "保存节点" : "添加节点"}</button>
          {editingNodeId && <button type="button" onClick={resetNodeForm}>取消编辑</button>}
        </div>
      </form>
      <NetworkTable title="节点列表" emptyText="还没有网络节点。">
        {workspace.network.nodes.map((node) => <tr key={node.id}>
          <td><b>{node.name}</b><small>{NETWORK_NODE_KIND_OPTIONS.find((option) => option.value === node.kind)?.label ?? node.kind}</small></td>
          <td>{node.subsystem || "—"}</td>
          <td>{node.host || "—"}</td>
          <td>出 {node.outgoingLinkCount} / 入 {node.incomingLinkCount}</td>
          <td>{formatBandwidth(node.outgoingBandwidthBps)} / {formatBandwidth(node.incomingBandwidthBps)}</td>
          <td><button onClick={() => editNode(node)}>编辑</button><button className="danger" onClick={() => void deleteNode(node)}>删除</button></td>
        </tr>)}
      </NetworkTable>
    </div>}

    {mode === "links" && <div className="network-grid">
      <form className="network-form" onSubmit={(event) => void submitLink(event)}>
        <h3>{editingLinkId ? "编辑链路" : "创建链路"}</h3>
        <label>名称<input value={linkForm.name} onChange={(event) => setLinkForm({ ...linkForm, name: event.target.value })} placeholder="Radar DDS Stream" /></label>
        <label>源节点<select value={linkForm.fromNodeId} onChange={(event) => setLinkForm({ ...linkForm, fromNodeId: event.target.value })}>{workspace.network.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
        <label>目标节点<select value={linkForm.toNodeId} onChange={(event) => setLinkForm({ ...linkForm, toNodeId: event.target.value })}>{workspace.network.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
        <label>传输<select value={linkForm.transport} onChange={(event) => setLinkForm({ ...linkForm, transport: event.target.value as NetworkTransportKind })}>{NETWORK_TRANSPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Endpoint<input value={linkForm.endpoint} onChange={(event) => setLinkForm({ ...linkForm, endpoint: event.target.value })} placeholder="topic / port / queue / file" /></label>
        <label>延迟预算 ms<input value={linkForm.latencyBudgetMs} onChange={(event) => setLinkForm({ ...linkForm, latencyBudgetMs: event.target.value })} inputMode="decimal" /></label>
        <label>带宽上限 Mbps<input value={linkForm.bandwidthLimitMbps} onChange={(event) => setLinkForm({ ...linkForm, bandwidthLimitMbps: event.target.value })} inputMode="decimal" /></label>
        <label className="checkbox-row"><input type="checkbox" checked={linkForm.critical} onChange={(event) => setLinkForm({ ...linkForm, critical: event.target.checked })} /> 关键链路</label>
        <label>备注<textarea value={linkForm.notes} onChange={(event) => setLinkForm({ ...linkForm, notes: event.target.value })} /></label>
        <div className="network-form-actions">
          <button disabled={busy || workspace.network.nodes.length < 2 || !linkForm.name.trim()}>{editingLinkId ? "保存链路" : "添加链路"}</button>
          {editingLinkId && <button type="button" onClick={() => resetLinkForm()}>取消编辑</button>}
        </div>
      </form>
      <NetworkTable title="链路列表" emptyText="至少创建两个节点后再添加链路。">
        {workspace.network.links.map((link) => <tr key={link.id}>
          <td><b>{link.name}</b><small>{NETWORK_TRANSPORT_OPTIONS.find((option) => option.value === link.transport)?.label ?? link.transport}</small></td>
          <td>{link.fromNodeName ?? link.fromNodeId} → {link.toNodeName ?? link.toNodeId}</td>
          <td>{link.endpoint || "—"}</td>
          <td>{link.bindingCount} 个协议</td>
          <td>{formatBandwidth(link.estimatedBandwidthBps)}</td>
          <td><button onClick={() => editLink(link)}>编辑</button><button className="danger" onClick={() => void deleteLink(link)}>删除</button></td>
        </tr>)}
      </NetworkTable>
    </div>}

    {mode === "bindings" && <div className="network-grid">
      <form className="network-form" onSubmit={(event) => void submitBinding(event)}>
        <h3>{editingBindingId ? "编辑协议绑定" : "创建协议绑定"}</h3>
        <label>名称<input value={bindingForm.name} onChange={(event) => setBindingForm({ ...bindingForm, name: event.target.value })} placeholder="RadarFrame@50Hz" /></label>
        <label>链路<select value={bindingForm.linkId} onChange={(event) => setBindingForm({ ...bindingForm, linkId: event.target.value })}>{workspace.network.links.map((link) => <option key={link.id} value={link.id}>{link.name}</option>)}</select></label>
        <label>协议类型<select value={bindingForm.typeId} onChange={(event) => setBindingForm({ ...bindingForm, typeId: event.target.value })}>{workspace.types.map((type) => <option key={type.id} value={type.id}>{type.qualifiedName}</option>)}</select></label>
        <label>业务数据名<input value={bindingForm.dataName} onChange={(event) => setBindingForm({ ...bindingForm, dataName: event.target.value })} placeholder="detections" /></label>
        <label>频率 Hz<input value={bindingForm.frequencyHz} onChange={(event) => setBindingForm({ ...bindingForm, frequencyHz: event.target.value })} inputMode="decimal" /></label>
        <label>批量大小<input value={bindingForm.batchSize} onChange={(event) => setBindingForm({ ...bindingForm, batchSize: event.target.value })} inputMode="numeric" /></label>
        <label title="把平均吞吐放大为峰值吞吐，1.0 表示无突发；例如 1.8 表示按平均值的 1.8 倍预留链路压力。">峰值系数<input value={bindingForm.peakMultiplier} onChange={(event) => setBindingForm({ ...bindingForm, peakMultiplier: event.target.value })} inputMode="decimal" /><small>平均吞吐的放大倍率，1.0 表示不放大。</small></label>
        <label>关键等级<select value={bindingForm.criticality} onChange={(event) => setBindingForm({ ...bindingForm, criticality: event.target.value as ProtocolBindingCriticality })}>{PROTOCOL_BINDING_CRITICALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>备注<textarea value={bindingForm.notes} onChange={(event) => setBindingForm({ ...bindingForm, notes: event.target.value })} /></label>
        <div className="network-form-actions">
          <button disabled={busy || workspace.network.links.length === 0 || workspace.types.length === 0 || !bindingForm.name.trim()}>{editingBindingId ? "保存绑定" : "添加绑定"}</button>
          {editingBindingId && <button type="button" onClick={() => resetBindingForm()}>取消编辑</button>}
        </div>
      </form>
      <NetworkTable title="协议绑定列表" emptyText="创建链路后，把协议类型绑定到链路上。">
        {workspace.network.bindings.map((binding) => <tr key={binding.id}>
          <td><b>{binding.name}</b><small>{binding.dataName || "未命名业务数据"}</small></td>
          <td>{binding.linkName ?? binding.linkId}</td>
          <td><button className="link-button" onDoubleClick={() => onOpenProtocolType(binding.typeId)} onClick={() => onOpenProtocolType(binding.typeId)}>{binding.protocolName ?? binding.typeId}</button></td>
          <td>{binding.payloadSize === undefined ? "未知" : formatBytes(binding.payloadSize)} · {binding.frequencyHz} Hz</td>
          <td>{formatBandwidth(binding.estimatedBandwidthBps)}</td>
          <td><button onClick={() => editBinding(binding)}>编辑</button><button className="danger" onClick={() => void deleteBinding(binding)}>删除</button></td>
        </tr>)}
      </NetworkTable>
    </div>}

    {mode === "flows" && <div className="network-grid flow-grid">
      <div className="flow-sidebar">
        <form className="network-form" onSubmit={(event) => void submitFlowView(event)}>
          <h3>{editingFlowViewId ? "编辑视图" : "创建视图"}</h3>
          <label>名称<input value={flowViewForm.name} onChange={(event) => setFlowViewForm({ ...flowViewForm, name: event.target.value })} placeholder="目标跟踪闭环" /></label>
          <label>过滤条件<input value={flowViewForm.filter} onChange={(event) => setFlowViewForm({ ...flowViewForm, filter: event.target.value })} placeholder="radar track critical" /></label>
          <label>说明<textarea value={flowViewForm.description} onChange={(event) => setFlowViewForm({ ...flowViewForm, description: event.target.value })} placeholder="这个视角想回答什么问题？" /></label>
          <div className="network-form-actions">
            <button disabled={busy || !flowViewForm.name.trim()}>{editingFlowViewId ? "保存视图" : "添加视图"}</button>
            {editingFlowViewId && <button type="button" onClick={resetFlowViewForm}>取消编辑</button>}
          </div>
        </form>
        <div className="flow-view-list">
          {flowViews.map((view) => {
            const stored = workspace.network.views.some((item) => item.id === view.id);
            return <article className={view.id === selectedFlowView.id ? "active" : ""} key={view.id}>
              <button onClick={() => onSelectedFlowViewChange(view.id)}>
                <b>{view.name}</b>
                <small>{flowViewSourceLabel(view.source)}{view.filter ? ` · ${view.filter}` : ""}</small>
              </button>
              {stored && <div>
                <button onClick={() => editFlowView(view)}>编辑</button>
                <button className="danger" onClick={() => void deleteFlowView(view)}>删除</button>
              </div>}
            </article>;
          })}
        </div>
      </div>
      <FlowViewPanel view={selectedFlowView} analysis={selectedFlowAnalysis} onGenerateReport={() => onGenerateFlowReport(selectedFlowView.id)} onOpenProtocolType={onOpenProtocolType} />
    </div>}

    {mode === "flow-canvas" && <FlowCanvasView
      workspace={workspace}
      flowViews={flowViews}
      selectedFlowView={selectedFlowView}
      analysis={selectedFlowAnalysis}
      onSelectFlowView={onSelectedFlowViewChange}
      onEditLink={editLink}
      onEditBinding={editBinding}
      onGenerateReport={() => onGenerateFlowReport(selectedFlowView.id)}
      onOpenProtocolType={onOpenProtocolType}
    />}

  </section>;
}

type FlowCanvasRisk = "normal" | "warning" | "critical";
type FlowCanvasRow = {
  link: WorkspaceNetworkLinkView;
  source?: WorkspaceNetworkNodeView;
  target?: WorkspaceNetworkNodeView;
  bindings: WorkspaceProtocolBindingView[];
  risk: FlowCanvasRisk;
  y: number;
};

function FlowCanvasView({ workspace, flowViews, selectedFlowView, analysis, onSelectFlowView, onEditLink, onEditBinding, onGenerateReport, onOpenProtocolType }: {
  workspace: WorkspaceView;
  flowViews: WorkspaceFlowView[];
  selectedFlowView: WorkspaceFlowView;
  analysis: FlowViewAnalysis;
  onSelectFlowView(viewId: string): void;
  onEditLink(link: WorkspaceNetworkLinkView): void;
  onEditBinding(binding: WorkspaceProtocolBindingView): void;
  onGenerateReport(): void;
  onOpenProtocolType(typeId: string): void;
}): React.JSX.Element {
  const nodeById = React.useMemo(() => new Map(workspace.network.nodes.map((node) => [node.id, node])), [workspace.network.nodes]);
  const bindingsByLink = React.useMemo(() => {
    const result = new Map<string, WorkspaceProtocolBindingView[]>();
    for (const binding of analysis.bindings) {
      const current = result.get(binding.linkId) ?? [];
      current.push(binding);
      result.set(binding.linkId, current);
    }
    return result;
  }, [analysis.bindings]);
  const maxBandwidth = Math.max(1, ...analysis.links.map((link) => link.estimatedBandwidthBps));
  const rowHeight = 132;
  const topOffset = 112;
  const stageWidth = 760;
  const sourceX = 22;
  const nodeWidth = 170;
  const payloadX = 250;
  const payloadWidth = 260;
  const targetX = 574;
  const rows = React.useMemo<FlowCanvasRow[]>(() => analysis.links.map((link, index) => {
    const bindings = bindingsByLink.get(link.id) ?? [];
    return {
      link,
      source: nodeById.get(link.fromNodeId),
      target: nodeById.get(link.toNodeId),
      bindings,
      risk: flowCanvasRisk(link, bindings),
      y: topOffset + index * rowHeight
    };
  }), [analysis.links, bindingsByLink, nodeById]);
  const stageHeight = Math.max(420, topOffset + Math.max(rows.length, 1) * rowHeight + 70);
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(rows[0]?.link.id ?? null);
  React.useEffect(() => {
    if (!rows.some((row) => row.link.id === selectedLinkId)) {
      setSelectedLinkId(rows[0]?.link.id ?? null);
    }
  }, [rows, selectedLinkId]);
  const selectedRow = rows.find((row) => row.link.id === selectedLinkId) ?? rows[0];

  if (rows.length === 0) {
    return <section className="flow-canvas-empty" aria-label="数据流画布">
      <div>
        <p className="eyebrow">DATA FLOW CANVAS</p>
        <h3>{selectedFlowView.name}</h3>
        <p>当前视图没有匹配到通信链路。可以调整 FlowView 过滤条件，或先在“节点 / 链路 / 协议绑定”中补充网络事实。</p>
      </div>
      <div className="flow-canvas-toolbar">
        <select aria-label="数据流画布视图" value={selectedFlowView.id} onChange={(event) => onSelectFlowView(event.target.value)}>
          {flowViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
        <button className="inline-action" onClick={onGenerateReport}>生成视图报告</button>
      </div>
    </section>;
  }

  return <section className="flow-canvas-view" aria-label="数据流画布">
    <div className="flow-canvas-header">
      <div>
        <p className="eyebrow">DATA FLOW CANVAS</p>
        <h3>{selectedFlowView.name}</h3>
        <p>{selectedFlowView.description || "按生产节点 → 链路 / 协议载荷 → 消费节点的方向展示数据流，线宽表示估算带宽，流光表示方向。"}</p>
      </div>
      <div className="flow-canvas-toolbar">
        <select aria-label="数据流画布视图" value={selectedFlowView.id} onChange={(event) => onSelectFlowView(event.target.value)}>
          {flowViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
        <button className="inline-action" onClick={onGenerateReport}>生成视图报告</button>
      </div>
    </div>

    <div className="flow-canvas-kpis">
      <span><b>{analysis.nodes.length}</b><small>实体节点</small></span>
      <span><b>{analysis.links.length}</b><small>通信链路</small></span>
      <span><b>{analysis.bindings.length}</b><small>协议载荷</small></span>
      <span><b>{formatBandwidth(analysis.totalBandwidthBps)}</b><small>估算总量</small></span>
    </div>

    <div className="flow-canvas-shell">
      <div className="flow-canvas-stage-wrap">
        <div className="flow-canvas-stage" style={{ width: `${stageWidth}px`, height: `${stageHeight}px` }}>
          <div className="flow-canvas-column-label source">生产节点</div>
          <div className="flow-canvas-column-label payload">链路 / 协议载荷</div>
          <div className="flow-canvas-column-label target">消费节点</div>
          <svg className="flow-canvas-svg" viewBox={`0 0 ${stageWidth} ${stageHeight}`} role="img" aria-label={`${selectedFlowView.name} 数据流连线`}>
            <defs>
              <marker id="flow-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                <path d="M2,2 L10,6 L2,10 Z" />
              </marker>
            </defs>
            {rows.map((row) => {
              const strokeWidth = flowCanvasStrokeWidth(row.link.estimatedBandwidthBps, maxBandwidth);
              const selected = row.link.id === selectedRow?.link.id;
              return <g key={row.link.id} className={`flow-canvas-edge ${row.risk}${selected ? " selected" : ""}`}>
                <path
                  d={`M ${sourceX + nodeWidth} ${row.y} C ${sourceX + nodeWidth + 110} ${row.y - 34}, ${targetX - 130} ${row.y + 34}, ${targetX} ${row.y}`}
                  strokeWidth={strokeWidth}
                  onClick={() => setSelectedLinkId(row.link.id)}
                />
                <path
                  className="pulse"
                  d={`M ${sourceX + nodeWidth} ${row.y} C ${sourceX + nodeWidth + 110} ${row.y - 34}, ${targetX - 130} ${row.y + 34}, ${targetX} ${row.y}`}
                  strokeWidth={Math.max(2, strokeWidth * 0.32)}
                  onClick={() => setSelectedLinkId(row.link.id)}
                />
              </g>;
            })}
          </svg>
          {rows.map((row) => <React.Fragment key={row.link.id}>
            <button
              className={`flow-node-card source ${row.risk}${row.link.id === selectedRow?.link.id ? " selected" : ""}`}
              style={{ left: sourceX, top: row.y - 42, width: nodeWidth }}
              onClick={() => setSelectedLinkId(row.link.id)}
              onDoubleClick={() => row.source && onEditLink(row.link)}
            >
              <b>{row.source?.name ?? row.link.fromNodeName ?? row.link.fromNodeId}</b>
              <small>{row.source ? `${networkNodeKindLabel(row.source.kind)} · ${row.source.subsystem || "未分系统"}` : "未知源节点"}</small>
              <span>出 {formatBandwidth(row.source?.outgoingBandwidthBps ?? row.link.estimatedBandwidthBps)}</span>
            </button>
            <div
              className={`flow-payload-stack ${row.risk}${row.link.id === selectedRow?.link.id ? " selected" : ""}`}
              style={{ left: payloadX, top: row.y - 50, width: payloadWidth }}
              onClick={() => setSelectedLinkId(row.link.id)}
            >
              <button className="flow-link-chip" onDoubleClick={() => onEditLink(row.link)}>
                <b>{row.link.name}</b>
                <small>{networkTransportLabel(row.link.transport)} · {formatBandwidth(row.link.estimatedBandwidthBps)}{row.link.bandwidthLimitMbps ? ` / ${row.link.bandwidthLimitMbps} Mbps` : ""}</small>
              </button>
              <div className="flow-payload-chips">
                {row.bindings.length === 0
                  ? <span className="empty">暂无协议载荷</span>
                  : row.bindings.slice(0, 4).map((binding) => <button key={binding.id} title="点击打开协议，双击编辑协议绑定" onClick={(event) => { event.stopPropagation(); onOpenProtocolType(binding.typeId); }} onDoubleClick={(event) => { event.stopPropagation(); onEditBinding(binding); }}>
                    {binding.protocolName ?? binding.name}
                    <small>{binding.frequencyHz} Hz · {formatBandwidth(binding.estimatedBandwidthBps)}</small>
                  </button>)}
                {row.bindings.length > 4 && <span className="more">+{row.bindings.length - 4}</span>}
              </div>
            </div>
            <button
              className={`flow-node-card target ${row.risk}${row.link.id === selectedRow?.link.id ? " selected" : ""}`}
              style={{ left: targetX, top: row.y - 42, width: nodeWidth }}
              onClick={() => setSelectedLinkId(row.link.id)}
              onDoubleClick={() => row.target && onEditLink(row.link)}
            >
              <b>{row.target?.name ?? row.link.toNodeName ?? row.link.toNodeId}</b>
              <small>{row.target ? `${networkNodeKindLabel(row.target.kind)} · ${row.target.subsystem || "未分系统"}` : "未知目标节点"}</small>
              <span>入 {formatBandwidth(row.target?.incomingBandwidthBps ?? row.link.estimatedBandwidthBps)}</span>
            </button>
          </React.Fragment>)}
        </div>
      </div>

      <aside className="flow-canvas-detail" aria-label="数据流详情">
        {selectedRow ? <>
          <p className="eyebrow">SELECTED LINK</p>
          <h3>{selectedRow.link.name}</h3>
          <dl>
            <dt>方向</dt><dd>{selectedRow.source?.name ?? selectedRow.link.fromNodeName ?? selectedRow.link.fromNodeId} → {selectedRow.target?.name ?? selectedRow.link.toNodeName ?? selectedRow.link.toNodeId}</dd>
            <dt>传输</dt><dd>{networkTransportLabel(selectedRow.link.transport)}</dd>
            <dt>Endpoint</dt><dd>{selectedRow.link.endpoint || "—"}</dd>
            <dt>延迟预算</dt><dd>{selectedRow.link.latencyBudgetMs === undefined ? "—" : `${selectedRow.link.latencyBudgetMs} ms`}</dd>
            <dt>估算带宽</dt><dd>{formatBandwidth(selectedRow.link.estimatedBandwidthBps)}</dd>
            <dt>上限</dt><dd>{selectedRow.link.bandwidthLimitMbps === undefined ? "—" : `${selectedRow.link.bandwidthLimitMbps} Mbps`}</dd>
            <dt>风险</dt><dd>{flowCanvasRiskLabel(selectedRow)}</dd>
          </dl>
          <div className="flow-canvas-actions">
            <button className="inline-action" onClick={() => onEditLink(selectedRow.link)}>编辑链路</button>
          </div>
          <section>
            <h4>协议载荷</h4>
            {selectedRow.bindings.length === 0 ? <p className="readonly-note">当前链路还没有协议绑定。</p> : <div className="flow-canvas-binding-list">
              {selectedRow.bindings.map((binding) => <article key={binding.id}>
                <button className="link-button" onClick={() => onOpenProtocolType(binding.typeId)}>{binding.protocolName ?? binding.name}</button>
                <small>{binding.payloadSize === undefined ? "未知大小" : formatBytes(binding.payloadSize)} · {binding.frequencyHz} Hz · 批量 x{binding.batchSize} · 峰值 x{binding.peakMultiplier}</small>
                <b>{formatBandwidth(binding.estimatedBandwidthBps)} · {protocolBindingCriticalityLabel(binding.criticality)}</b>
                <button className="inline-action ghost" onClick={() => onEditBinding(binding)}>编辑绑定</button>
              </article>)}
            </div>}
          </section>
        </> : <p className="readonly-note">请选择一条数据流链路。</p>}
      </aside>
    </div>

    <div className="flow-canvas-legend">
      <span><i className="normal" /> 正常链路</span>
      <span><i className="warning" /> 高优先级 / 信息缺失</span>
      <span><i className="critical" /> 关键链路 / 超限</span>
      <span><i className="motion" /> 流光方向表示数据流向</span>
    </div>
  </section>;
}

function flowCanvasRisk(link: WorkspaceNetworkLinkView, bindings: WorkspaceProtocolBindingView[]): FlowCanvasRisk {
  if (link.critical || isLinkOverBandwidthLimit(link) || bindings.some((binding) => binding.criticality === "critical")) return "critical";
  if (bindings.some((binding) => binding.criticality === "high" || binding.payloadSize === undefined || binding.peakMultiplier > 2)) return "warning";
  return "normal";
}

function flowCanvasRiskLabel(row: FlowCanvasRow): string {
  if (isLinkOverBandwidthLimit(row.link)) return "链路带宽超限";
  if (row.link.critical) return "关键链路";
  if (row.bindings.some((binding) => binding.criticality === "critical")) return "关键协议载荷";
  if (row.bindings.some((binding) => binding.criticality === "high")) return "高优先级协议";
  if (row.bindings.some((binding) => binding.payloadSize === undefined)) return "存在未知载荷大小";
  if (row.bindings.some((binding) => binding.peakMultiplier > 2)) return "存在高峰值系数";
  return "正常";
}

function flowCanvasStrokeWidth(value: number, maxValue: number): number {
  const ratio = Math.sqrt(Math.max(0, value) / Math.max(1, maxValue));
  return Math.round((3 + ratio * 13) * 10) / 10;
}

function FlowViewPanel({ view, analysis, onGenerateReport, onOpenProtocolType }: {
  view: WorkspaceFlowView;
  analysis: FlowViewAnalysis;
  onGenerateReport: () => void;
  onOpenProtocolType: (typeId: string) => void;
}): React.JSX.Element {
  return <div className="flow-analysis-panel">
    <div className="flow-analysis-hero">
      <div>
        <p className="eyebrow">FLOW VIEW</p>
        <h3>{view.name}</h3>
        <p>{view.description || "从网络事实中派生的业务数据流观察视角。"}</p>
      </div>
      <div className="network-kpis flow-kpis">
        <span><b>{analysis.nodes.length}</b><small>节点</small></span>
        <span><b>{analysis.links.length}</b><small>链路</small></span>
        <span><b>{analysis.bindings.length}</b><small>协议</small></span>
        <span><b>{formatBandwidth(analysis.totalBandwidthBps)}</b><small>估算总量</small></span>
      </div>
    </div>

    <div className="flow-analysis-actions">
      <button className="inline-action" onClick={onGenerateReport}>生成视图报告</button>
    </div>

    {view.filter && <p className="flow-filter-chip">过滤：{view.filter}</p>}

    <div className="flow-risk-grid">
      <section className="property-card">
        <h3>最高链路</h3>
        {analysis.busiestLink ? <p>{analysis.busiestLink.name}<br /><small>{formatBandwidth(analysis.busiestLink.estimatedBandwidthBps)}</small></p> : <p className="ok">暂无匹配链路</p>}
      </section>
      <section className="property-card">
        <h3>最高节点</h3>
        {analysis.busiestNode ? <p>{analysis.busiestNode.name}<br /><small>出 {formatBandwidth(analysis.busiestNode.outgoingBandwidthBps)} / 入 {formatBandwidth(analysis.busiestNode.incomingBandwidthBps)}</small></p> : <p className="ok">暂无匹配节点</p>}
      </section>
      <section className="property-card flow-warnings">
        <h3>风险提示</h3>
        {analysis.warnings.length === 0 ? <p className="ok">当前视图未发现关键风险。</p> : <ul>{analysis.warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </section>
    </div>

    <NetworkTable title="视图内协议载荷" emptyText="当前过滤条件没有匹配协议绑定。">
      {analysis.bindings.map((binding) => <tr key={binding.id}>
        <td><b>{binding.name}</b><small>{binding.dataName || "未命名业务数据"}</small></td>
        <td>{binding.linkName ?? binding.linkId}</td>
        <td><button className="link-button" onClick={() => onOpenProtocolType(binding.typeId)}>{binding.protocolName ?? binding.typeId}</button></td>
        <td>{binding.payloadSize === undefined ? "未知" : formatBytes(binding.payloadSize)} · {binding.frequencyHz} Hz · 批量 x{binding.batchSize} · 峰值 x{binding.peakMultiplier}</td>
        <td>{formatBandwidth(binding.estimatedBandwidthBps)}</td>
      </tr>)}
    </NetworkTable>

    <NetworkTable title="视图内链路" emptyText="当前过滤条件没有匹配链路。">
      {analysis.links.map((link) => <tr key={link.id}>
        <td><b>{link.name}</b><small>{NETWORK_TRANSPORT_OPTIONS.find((option) => option.value === link.transport)?.label ?? link.transport}</small></td>
        <td>{link.fromNodeName ?? link.fromNodeId} → {link.toNodeName ?? link.toNodeId}</td>
        <td>{link.endpoint || "—"}</td>
        <td>{link.bindingCount} 个协议</td>
        <td>{formatBandwidth(link.estimatedBandwidthBps)}</td>
      </tr>)}
    </NetworkTable>

    <div className="flow-node-grid">
      {analysis.nodes.map((node) => <article key={node.id}>
        <b>{node.name}</b>
        <small>{NETWORK_NODE_KIND_OPTIONS.find((option) => option.value === node.kind)?.label ?? node.kind} · {node.subsystem || "未分系统"}</small>
        <span>出 {formatBandwidth(node.outgoingBandwidthBps)} / 入 {formatBandwidth(node.incomingBandwidthBps)}</span>
      </article>)}
    </div>
  </div>;
}

function flowViewSourceLabel(source: WorkspaceFlowView["source"]): string {
  if (source === "derived") return "派生";
  if (source === "ai") return "AI";
  return "手动";
}

function deriveFlowViewAnalysis(workspace: WorkspaceView, view: WorkspaceFlowView): FlowViewAnalysis {
  const terms = flowFilterTerms(view.filter);
  const linkById = new Map(workspace.network.links.map((link) => [link.id, link]));

  const matchedBindings = workspace.network.bindings.filter((binding) => {
    const link = linkById.get(binding.linkId);
    return terms.length === 0 || flowEntityMatches(terms, { binding, link, workspace });
  });
  const matchedLinkIds = new Set(matchedBindings.map((binding) => binding.linkId));
  const matchedLinks = workspace.network.links.filter((link) => {
    return terms.length === 0 || matchedLinkIds.has(link.id) || flowEntityMatches(terms, { link, workspace });
  });
  for (const link of matchedLinks) matchedLinkIds.add(link.id);

  const bindings = terms.length === 0
    ? workspace.network.bindings
    : workspace.network.bindings.filter((binding) => matchedLinkIds.has(binding.linkId) || matchedBindings.some((item) => item.id === binding.id));
  const links = terms.length === 0 ? workspace.network.links : matchedLinks;

  const matchedNodeIds = new Set<string>();
  for (const link of links) {
    matchedNodeIds.add(link.fromNodeId);
    matchedNodeIds.add(link.toNodeId);
  }
  if (terms.length > 0) {
    for (const node of workspace.network.nodes) {
      if (flowEntityMatches(terms, { node, workspace })) matchedNodeIds.add(node.id);
    }
  }

  const nodes = workspace.network.nodes
    .filter((node) => terms.length === 0 || matchedNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      outgoingLinkCount: 0,
      incomingLinkCount: 0,
      outgoingBandwidthBps: 0,
      incomingBandwidthBps: 0
    }));
  const analysisNodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const link of links) {
    const source = analysisNodeById.get(link.fromNodeId);
    const target = analysisNodeById.get(link.toNodeId);
    if (source) {
      source.outgoingLinkCount += 1;
      source.outgoingBandwidthBps += link.estimatedBandwidthBps;
    }
    if (target) {
      target.incomingLinkCount += 1;
      target.incomingBandwidthBps += link.estimatedBandwidthBps;
    }
  }

  const totalBandwidthBps = links.reduce((sum, link) => sum + link.estimatedBandwidthBps, 0);
  const busiestLink = [...links].sort((left, right) => right.estimatedBandwidthBps - left.estimatedBandwidthBps)[0];
  const busiestNode = [...nodes].sort((left, right) => (right.incomingBandwidthBps + right.outgoingBandwidthBps) - (left.incomingBandwidthBps + left.outgoingBandwidthBps))[0];
  const warnings = flowWarnings(links, bindings, analysisNodeById);

  return { nodes, links, bindings, totalBandwidthBps, busiestLink, busiestNode, warnings };
}

function flowFilterTerms(filter: string | undefined): string[] {
  return [...new Set((filter ?? "").toLowerCase().split(/[\s,;，；]+/).map((term) => term.trim()).filter(Boolean))];
}

function flowEntityMatches(terms: string[], context: {
  workspace: WorkspaceView;
  node?: WorkspaceNetworkNodeView;
  link?: WorkspaceNetworkLinkView;
  binding?: WorkspaceProtocolBindingView;
}): boolean {
  const link = context.link ?? (context.binding ? context.workspace.network.links.find((item) => item.id === context.binding?.linkId) : undefined);
  const fromNode = link ? context.workspace.network.nodes.find((node) => node.id === link.fromNodeId) : undefined;
  const toNode = link ? context.workspace.network.nodes.find((node) => node.id === link.toNodeId) : undefined;
  const overLimit = link ? isLinkOverBandwidthLimit(link) : false;
  const critical = Boolean(link?.critical)
    || context.binding?.criticality === "high"
    || context.binding?.criticality === "critical"
    || overLimit;
  const highRate = (context.binding?.frequencyHz ?? 0) >= 30 || (context.binding?.estimatedBandwidthBps ?? link?.estimatedBandwidthBps ?? 0) >= 1024 * 64;
  const blob = [
    context.node?.name,
    context.node?.kind,
    context.node?.role,
    context.node?.subsystem,
    context.node?.host,
    context.node?.process,
    context.node?.hardwareProfile,
    context.node?.softwareProfile,
    context.node?.notes,
    link?.name,
    link?.transport,
    link?.endpoint,
    link?.notes,
    fromNode?.name,
    fromNode?.kind,
    fromNode?.subsystem,
    toNode?.name,
    toNode?.kind,
    toNode?.subsystem,
    context.binding?.name,
    context.binding?.protocolName,
    context.binding?.dataName,
    context.binding?.criticality,
    context.binding?.notes
  ].filter(Boolean).join(" ").toLowerCase();

  return terms.some((term) => {
    if (["critical", "关键", "risk", "风险"].includes(term)) return critical;
    if (["high", "高频", "大流量", "hot"].includes(term)) return highRate || critical;
    if (["over", "over-limit", "超限", "瓶颈"].includes(term)) return overLimit;
    return blob.includes(term);
  });
}

function flowWarnings(links: WorkspaceNetworkLinkView[], bindings: WorkspaceProtocolBindingView[], nodeById: Map<string, WorkspaceNetworkNodeView>): string[] {
  const warnings: string[] = [];
  const linkById = new Map(links.map((link) => [link.id, link]));
  for (const link of links) {
    if (link.critical) warnings.push(`关键链路：${link.name}`);
    if (isLinkOverBandwidthLimit(link)) warnings.push(`带宽超限：${link.name} 估算 ${formatBandwidth(link.estimatedBandwidthBps)} / 上限 ${link.bandwidthLimitMbps} Mbps`);
  }
  for (const binding of bindings) {
    if (binding.criticality === "critical") warnings.push(`关键协议：${binding.name}`);
    else if (binding.criticality === "high") warnings.push(`高优先级协议：${binding.name}`);
    for (const hint of protocolBindingBottleneckHints(binding, linkById.get(binding.linkId))) warnings.push(hint);
  }
  for (const node of nodeById.values()) {
    for (const hint of networkNodeBottleneckHints(node)) warnings.push(hint);
  }
  return [...new Set(warnings)];
}

function networkNodeBottleneckHints(node: WorkspaceNetworkNodeView): string[] {
  const hints: string[] = [];
  const total = node.incomingBandwidthBps + node.outgoingBandwidthBps;
  if (total >= 1024 * 1024) hints.push(`高吞吐节点：${node.name} ${formatBandwidth(total)}`);
  if (total >= 1024 * 1024 && !node.hardwareProfile?.trim()) hints.push(`建议补充硬件画像：${node.name}`);
  if (total >= 1024 * 1024 && !node.softwareProfile?.trim()) hints.push(`建议补充软件画像：${node.name}`);
  if (node.outgoingLinkCount + node.incomingLinkCount >= 4) hints.push(`高连接度节点：${node.name} 出 ${node.outgoingLinkCount} / 入 ${node.incomingLinkCount}`);
  if (node.kind === "gateway" && total >= 512 * 1024) hints.push(`网关汇聚压力：${node.name}，建议检查队列、背压和转发策略`);
  if (node.kind === "storage" && node.incomingBandwidthBps >= 512 * 1024) hints.push(`存储写入压力：${node.name}，建议检查落盘频率和 IO 上限`);
  return hints;
}

function protocolBindingBottleneckHints(binding: WorkspaceProtocolBindingView, link?: WorkspaceNetworkLinkView): string[] {
  const hints: string[] = [];
  if (binding.payloadSize === undefined) hints.push(`未知载荷大小：${binding.name}`);
  if (binding.peakMultiplier > 2) hints.push(`高峰值系数：${binding.name} x${binding.peakMultiplier}`);
  if (binding.estimatedBandwidthBps >= 1024 * 1024) hints.push(`高吞吐协议：${binding.name} ${formatBandwidth(binding.estimatedBandwidthBps)}`);
  if (link && isLinkOverBandwidthLimit(link)) hints.push(`可能参与链路超限：${binding.name} → ${link.name}`);
  return hints;
}

function isLinkOverBandwidthLimit(link: WorkspaceNetworkLinkView): boolean {
  if (!link.bandwidthLimitMbps || link.bandwidthLimitMbps <= 0) return false;
  return link.estimatedBandwidthBps > link.bandwidthLimitMbps * 125_000;
}

function NetworkTable({ title, emptyText, children }: { title: string; emptyText: string; children: React.ReactNode }): React.JSX.Element {
  const rows = React.Children.toArray(children);
  return <div className="network-table-card">
    <h3>{title}</h3>
    {rows.length === 0 ? <p className="scan-empty">{emptyText}</p> : <table className="network-table"><tbody>{children}</tbody></table>}
  </div>;
}

function GitInspector({ status, branches, tags, selectedCommit, onOpenCommitDiff }: {
  status: GitWorkspaceStatus | null;
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  selectedCommit: GitCommitGraphEntry | null;
  onOpenCommitDiff(path: string, commit: string): void;
}): React.JSX.Element {
  if (!status) return <p className="empty">正在读取 Git 状态…</p>;
  if (!status.isRepository) return <p className="empty">{status.message ?? "当前工作区不是 Git 仓库。"}</p>;
  const stagedCount = status.entries.filter(isGitEntryStaged).length;
  const unstagedCount = status.entries.filter(isGitEntryUnstaged).length;
  return <div>
    <dl>
      <dt>分支</dt><dd>{status.currentBranch ?? "detached"}</dd>
      <dt>HEAD</dt><dd>{status.headShortCommit ?? "—"}</dd>
      <dt>最近 Tag</dt><dd>{status.latestTag ?? tags[0]?.name ?? "—"}</dd>
      <dt>暂存</dt><dd>{stagedCount}</dd>
      <dt>未暂存</dt><dd>{unstagedCount}</dd>
      <dt>本地分支</dt><dd>{branches.length}</dd>
      <dt>状态</dt><dd>{status.hasConflicts ? "存在冲突" : status.isDirty ? "有改动" : "clean"}</dd>
    </dl>
    <div className="inspector-card">
      <h3>操作习惯</h3>
      <p>在左侧 Git 工作栏中暂存文件、填写提交信息并提交；协议基线 Tag 建议在提交后创建。</p>
    </div>
    <div className="inspector-card git-inspector-commit">
      <h3>选中提交</h3>
      {selectedCommit ? <>
        <p><strong>{selectedCommit.subject}</strong></p>
        <dl>
          <dt>Commit</dt><dd>{selectedCommit.shortHash}</dd>
          <dt>作者</dt><dd>{selectedCommit.author ?? "—"}</dd>
          <dt>时间</dt><dd>{selectedCommit.relativeDate ?? "—"}</dd>
          <dt>文件</dt><dd>{selectedCommit.changeCount}</dd>
        </dl>
        {selectedCommit.refs.length > 0 && <div className="git-ref-row">{selectedCommit.refs.slice(0, 5).map((ref) => <b key={ref}>{ref.replace(/^HEAD -> /, "")}</b>)}</div>}
        <ul className="git-inspector-files" aria-label="选中提交文件">
          {selectedCommit.changes.slice(0, 12).map((change) => <li key={`${selectedCommit.hash}:${change.oldPath ?? ""}:${change.path}`}>
            <button onClick={() => onOpenCommitDiff(change.path, selectedCommit.hash)} title={`${selectedCommit.shortHash} · ${change.path}`}>
              <b className={`git-badge git-badge-${change.status}`}>{gitCommitChangeStatusLabel(change.status)}</b>
              <span>{change.path.split("/").at(-1) ?? change.path}</span>
            </button>
          </li>)}
        </ul>
        {selectedCommit.changes.length > 12 && <p className="git-hint">还有 {selectedCommit.changes.length - 12} 个文件，可在左侧 Graph 展开查看。</p>}
      </> : <p className="empty">在左侧 Graph 选择一个提交查看历史文件。</p>}
    </div>
  </div>;
}

function NetworkInspector({ workspace }: { workspace: WorkspaceView }): React.JSX.Element {
  const totalBandwidth = workspace.network.links.reduce((sum, link) => sum + link.estimatedBandwidthBps, 0);
  const busiestLink = [...workspace.network.links].sort((a, b) => b.estimatedBandwidthBps - a.estimatedBandwidthBps)[0];
  const busiestNode = [...workspace.network.nodes].sort((a, b) => (b.incomingBandwidthBps + b.outgoingBandwidthBps) - (a.incomingBandwidthBps + a.outgoingBandwidthBps))[0];
  return <div>
    <dl>
      <dt>网络节点</dt><dd>{workspace.network.nodes.length}</dd>
      <dt>通信链路</dt><dd>{workspace.network.links.length}</dd>
      <dt>协议绑定</dt><dd>{workspace.network.bindings.length}</dd>
      <dt>估算总量</dt><dd>{formatBandwidth(totalBandwidth)}</dd>
    </dl>
    <section className="property-card">
      <h3>当前建模原则</h3>
      <p>节点和链路是事实，协议绑定是载荷，业务数据流是派生视图。</p>
    </section>
    <section className="property-card">
      <h3>最高链路</h3>
      {busiestLink ? <p>{busiestLink.name}<br /><small>{formatBandwidth(busiestLink.estimatedBandwidthBps)}</small></p> : <p className="ok">暂无链路</p>}
    </section>
    <section className="property-card">
      <h3>最高节点</h3>
      {busiestNode ? <p>{busiestNode.name}<br /><small>出 {formatBandwidth(busiestNode.outgoingBandwidthBps)} / 入 {formatBandwidth(busiestNode.incomingBandwidthBps)}</small></p> : <p className="ok">暂无节点</p>}
    </section>
  </div>;
}

function workspaceSummaryForAssistant(workspace: WorkspaceView | null): string {
  if (!workspace) return "尚未打开工作区。";
  const structCount = workspace.types.filter((type) => type.kind === "struct").length;
  const enumCount = workspace.types.filter((type) => type.kind === "enum").length;
  const diagnostics = workspace.diagnostics.slice(0, 6).map((diagnostic) => `- ${diagnostic.severity}: ${diagnostic.message}`).join("\n");
  const topBindings = workspace.network.bindings.slice(0, 6).map((binding) => `- ${binding.name}: ${binding.protocolName ?? binding.typeId} @ ${binding.frequencyHz}Hz`).join("\n");
  return [
    `工作区：${workspace.name}`,
    `Header：${workspace.files.length}`,
    `Struct：${structCount}`,
    `Enum：${enumCount}`,
    `网络节点：${workspace.network.nodes.length}`,
    `通信链路：${workspace.network.links.length}`,
    `协议绑定：${workspace.network.bindings.length}`,
    diagnostics ? `诊断摘要：\n${diagnostics}` : "诊断摘要：无",
    topBindings ? `协议绑定摘要：\n${topBindings}` : "协议绑定摘要：无"
  ].join("\n");
}

function isGitEntryStaged(entry: GitWorkspaceStatus["entries"][number]): boolean {
  return entry.indexStatus.trim() !== "" && entry.indexStatus !== "?";
}

function isGitEntryUnstaged(entry: GitWorkspaceStatus["entries"][number]): boolean {
  return entry.indexStatus === "?" || entry.workingTreeStatus.trim() !== "";
}

function gitStatusBadge(entry: GitWorkspaceStatus["entries"][number], area: "staged" | "unstaged"): string {
  const value = area === "staged" ? entry.indexStatus : entry.workingTreeStatus;
  if (entry.indexStatus === "?" && entry.workingTreeStatus === "?") return "U";
  if (value === "M") return "M";
  if (value === "A") return "A";
  if (value === "D") return "D";
  if (value === "R") return "R";
  if (value === "C") return "C";
  if (value === "U") return "conflict";
  return value.trim() || "•";
}

function gitStatusBadgeLabel(badge: string): string {
  return badge === "conflict" ? "!" : badge;
}

function GitChangeList({
  title,
  entries,
  area,
  loading,
  onStagePath,
  onUnstagePath,
  onOpenDiff,
  onOpenFileLocation
}: {
  title: string;
  entries: GitWorkspaceStatus["entries"];
  area: "staged" | "unstaged";
  loading: boolean;
  onStagePath(path: string): void;
  onUnstagePath(path: string): void;
  onOpenDiff(entry: GitWorkspaceStatus["entries"][number], side: GitDiffSide): void;
  onOpenFileLocation(entry: GitWorkspaceStatus["entries"][number]): void;
}): React.JSX.Element {
  const side: GitDiffSide = area === "staged" ? "index" : "working-tree";
  return <section className="git-change-section">
    <header>
      <h3>▾ {title}</h3>
      <span>{entries.length}</span>
    </header>
    {entries.length === 0
      ? <p className="git-empty">没有文件</p>
      : <ul className="git-change-list">
        {entries.map((entry) => <li key={`${area}:${entry.path}`}>
          {(() => {
            const badge = gitStatusBadge(entry, area);
            return <>
              <button className="git-file" onClick={() => onOpenDiff(entry, side)} title={`${entry.path} · 打开对比`}>
                <b className={`git-badge git-badge-${badge}`}>{gitStatusBadgeLabel(badge)}</b>
                <span>{entry.path.split("/").at(-1) ?? entry.path}</span>
                <small>{entry.path}</small>
              </button>
              <button className="git-row-action" disabled={loading} aria-label={`打开文件位置 ${entry.path}`} title="打开文件位置" onClick={() => onOpenFileLocation(entry)}>⌕</button>
              {area === "unstaged"
                ? <button className="git-row-action" disabled={loading} aria-label={`暂存 ${entry.path}`} title="暂存" onClick={() => onStagePath(entry.path)}>＋</button>
                : <button className="git-row-action" disabled={loading} aria-label={`取消暂存 ${entry.path}`} title="取消暂存" onClick={() => onUnstagePath(entry.path)}>−</button>}
            </>;
          })()}
        </li>)}
      </ul>}
  </section>;
}

function gitCommitChangeStatusLabel(status: string): string {
  if (status === "A") return "A";
  if (status === "D") return "D";
  if (status === "R") return "R";
  if (status === "C") return "C";
  if (status === "M") return "M";
  return status || "•";
}

function GitCommitGraphPanel({ graph, currentBranch, selectedCommitHash, onSelectCommit, onOpenCommitDiff }: {
  graph: GitCommitGraphEntry[];
  currentBranch: string;
  selectedCommitHash: string | null;
  onSelectCommit(hash: string): void;
  onOpenCommitDiff(path: string, commit: string): void;
}): React.JSX.Element {
  const [expandedCommits, setExpandedCommits] = React.useState<Set<string>>(() => new Set(graph[0]?.hash ? [graph[0].hash] : []));
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGraph = React.useMemo(() => {
    if (!normalizedQuery) return graph;
    return graph.filter((commit) => [
      commit.hash,
      commit.shortHash,
      commit.subject,
      commit.author ?? "",
      commit.relativeDate ?? "",
      ...commit.refs,
      ...commit.changes.flatMap((change) => [change.path, change.oldPath ?? "", change.status])
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [graph, normalizedQuery]);

  React.useEffect(() => {
    setExpandedCommits((current) => {
      const knownHashes = new Set(graph.map((commit) => commit.hash));
      const next = new Set([...current].filter((hash) => knownHashes.has(hash)));
      if (next.size === 0 && graph[0]?.hash) next.add(graph[0].hash);
      return next;
    });
  }, [graph]);

  React.useEffect(() => {
    if (!normalizedQuery) return;
    setExpandedCommits((current) => {
      const next = new Set(current);
      filteredGraph.forEach((commit) => next.add(commit.hash));
      return next;
    });
  }, [filteredGraph, normalizedQuery]);

  function toggleCommit(hash: string): void {
    setExpandedCommits((current) => {
      const next = new Set(current);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }

  return <section className="git-graph-panel" aria-label="Git 版本流程图">
    <header>
      <div>
        <h3>▾ GRAPH</h3>
        <span>{currentBranch} · {filteredGraph.length}/{graph.length}</span>
      </div>
      <div className="git-graph-tools">
        <input aria-label="搜索 Git 历史" value={query} placeholder="搜索历史 / 文件…" onChange={(event) => setQuery(event.target.value)} />
        <button aria-label="展开全部 Git 提交" title="展开全部" onClick={() => setExpandedCommits(new Set(filteredGraph.map((commit) => commit.hash)))}>＋</button>
        <button aria-label="收起全部 Git 提交" title="收起全部" onClick={() => setExpandedCommits(new Set())}>−</button>
      </div>
    </header>
    {graph.length === 0 ? <p className="git-empty">暂无提交历史</p> : filteredGraph.length === 0 ? <p className="git-empty">没有匹配的历史提交</p> : <ol>
      {filteredGraph.map((commit) => {
        const expanded = expandedCommits.has(commit.hash);
        const selected = selectedCommitHash === commit.hash;
        return <li className={`${commit.current ? "current" : ""}${selected ? " selected" : ""}`} key={commit.hash}>
        <span className="git-graph-line" aria-hidden="true" />
        <span className="git-graph-dot" aria-hidden="true" />
        <div className="git-graph-entry">
          <button className="git-graph-commit" aria-expanded={expanded} aria-label={`${expanded ? "折叠" : "展开"}提交 ${commit.shortHash} ${commit.subject}`} onClick={() => {
            onSelectCommit(commit.hash);
            toggleCommit(commit.hash);
          }}>
            <span className="git-graph-caret">{expanded ? "▾" : "▸"}</span>
            <span className="git-graph-message">{commit.subject}</span>
            <small>{commit.shortHash} · {commit.relativeDate ?? "—"} · {commit.changeCount} files</small>
          </button>
          {commit.refs.length > 0 && <span className="git-ref-row">{commit.refs.slice(0, 3).map((ref) => <b key={ref}>{ref.replace(/^HEAD -> /, "")}</b>)}</span>}
          {expanded && <ul className="git-graph-changes" aria-label={`${commit.shortHash} 文件修改记录`}>
            {commit.changes.length === 0 ? <li className="git-graph-empty-file">当前工作区范围内无文件变化</li> : commit.changes.map((change) => <li key={`${commit.hash}:${change.oldPath ?? ""}:${change.path}`}>
              <button className="git-graph-file" aria-label={`打开历史对比 ${change.path} ${commit.shortHash}`} title={`${commit.shortHash} · ${change.oldPath ? `${change.oldPath} → ` : ""}${change.path}`} onClick={() => onOpenCommitDiff(change.path, commit.hash)}>
                <b className={`git-badge git-badge-${change.status}`}>{gitCommitChangeStatusLabel(change.status)}</b>
                <span>{change.path.split("/").at(-1) ?? change.path}</span>
                <small>{change.oldPath ? `${change.oldPath} → ${change.path}` : change.path}</small>
              </button>
            </li>)}
          </ul>}
        </div>
      </li>;
      })}
    </ol>}
  </section>;
}

function formatGitTagDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function GitVersionAssetPanel({
  workspace,
  status,
  branches,
  tags,
  currentBranch,
  loading,
  newBranchName,
  onNewBranchNameChange,
  onCheckoutBranch,
  onCreateBranch,
  onCreateBaseline,
  onRunDiff,
  onGenerateDocument
}: {
  workspace: WorkspaceView;
  status: GitWorkspaceStatus;
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  currentBranch: string;
  loading: boolean;
  newBranchName: string;
  onNewBranchNameChange(value: string): void;
  onCheckoutBranch(branchName: string): void;
  onCreateBranch(branchName: string): void;
  onCreateBaseline(): void;
  onRunDiff(): void;
  onGenerateDocument(): void;
}): React.JSX.Element {
  const currentCommit = status.headShortCommit ?? status.headCommit?.slice(0, 8) ?? "no HEAD";
  const latestTag = status.latestTag ?? tags[0]?.name ?? "暂无基线";
  const protocolPackageLabel = `${workspace.files.length} Headers · ${workspace.types.length} Types`;
  const changedCount = status.entries.length;
  const branchPreview = branches.slice(0, 6);
  const tagPreview = tags.slice(0, 5);

  return <section className="git-version-vault" aria-label="协议版本资产">
    <header>
      <div>
        <p className="eyebrow">VERSION VAULT</p>
        <h3>协议版本资产</h3>
      </div>
      <span className={status.isDirty ? "version-state dirty" : "version-state clean"}>{status.isDirty ? `${changedCount} changes` : "clean"}</span>
    </header>

    <div className="version-snapshot-grid" aria-label="当前版本快照">
      <span><small>当前线</small><b>{currentBranch}</b></span>
      <span><small>提交点</small><b>{currentCommit}</b></span>
      <span><small>最近基线</small><b>{latestTag}</b></span>
      <span><small>协议包</small><b>{protocolPackageLabel}</b></span>
    </div>

    <div className="version-primary-actions" aria-label="版本快捷操作">
      <button disabled={loading} onClick={onCreateBaseline} title="将当前干净提交固定为协议基线 Tag">🏷 创建基线 Tag</button>
      <button disabled={loading} onClick={onRunDiff} title="比较当前协议 IR 与历史基线">△ 版本 Diff</button>
      <button disabled={loading} onClick={onGenerateDocument} title="导出当前工作区协议文档">⇩ 导出文档</button>
    </div>

    <details className="version-branch-card" open>
      <summary>分支：实验线 / 发布线</summary>
      <label className="git-select-label">
        <span>切换分支</span>
        <select aria-label="Git 分支" value={currentBranch} disabled={loading} onChange={(event) => onCheckoutBranch(event.target.value)}>
          {branches.length > 0 ? branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.current ? "● " : ""}{branch.name}</option>) : <option value={currentBranch}>{currentBranch}</option>}
        </select>
      </label>
      <div className="version-ref-list" aria-label="分支列表">
        {branchPreview.map((branch) => <button key={branch.name} disabled={loading || branch.current} className={branch.current ? "active" : ""} onClick={() => onCheckoutBranch(branch.name)} title={branch.commit ? `${branch.name} · ${branch.commit.slice(0, 8)}` : branch.name}>
          <b>{branch.current ? "●" : "⑂"}</b><span>{branch.name}</span>
        </button>)}
        {branches.length > branchPreview.length && <em>+{branches.length - branchPreview.length}</em>}
      </div>
      <div className="git-branch-create">
        <input aria-label="新建 Git 分支名称" value={newBranchName} placeholder="feature/radar-protocol-v2" onChange={(event) => onNewBranchNameChange(event.target.value)} />
        <button className="inline-action" disabled={loading || !newBranchName.trim()} onClick={() => {
          onCreateBranch(newBranchName.trim());
          onNewBranchNameChange("");
        }}>新建并切换</button>
      </div>
      <p className="git-hint">建议：分支用于协议实验、客户版本、仿真场景；合入前用版本 Diff 检查字段、布局和兼容性变化。</p>
    </details>

    <details className="version-branch-card">
      <summary>Tag：可交付协议基线</summary>
      {tagPreview.length === 0 ? <p className="git-empty">暂无 Tag。创建基线后，Tag 会成为可回溯的协议版本点。</p> : <ul className="version-tag-list">
        {tagPreview.map((tag) => <li key={tag.name}>
          <b>🏷 {tag.name}</b>
          <small>{tag.commit?.slice(0, 8) ?? "—"} · {formatGitTagDate(tag.createdAt)}{tag.subject ? ` · ${tag.subject}` : ""}</small>
        </li>)}
      </ul>}
    </details>

    <details className="version-merge-card">
      <summary>多文件夹合并 / 导出设计</summary>
      <ol>
        <li>挂载多个协议文件夹为独立“协议包”，保留各自分支、Tag、Header 范围。</li>
        <li>按稳定 ID / namespace / 文件来源合成 IR，冲突进入合并报告，不直接覆盖源文件。</li>
        <li>导出为文档、语义 Diff 报告、协议包快照；后续再接入生成 Header 包和 Git archive。</li>
      </ol>
      <div className="version-package-row">
        <span><b>{workspace.name}</b><small>{workspace.rootPath}</small></span>
        <em>{protocolPackageLabel}</em>
      </div>
      <div className="version-primary-actions">
        <button disabled title="下一阶段接入多工作区挂载">＋ 挂载文件夹</button>
        <button disabled title="下一阶段接入协议包合并引擎">合并预览</button>
        <button disabled title="下一阶段接入版本包导出">导出版本包</button>
      </div>
      <p className="version-coming-soon">设计态入口：当前不会执行真实合并或写盘；下一阶段会接入多协议包挂载、冲突报告和版本包导出。</p>
    </details>
  </section>;
}

function GitSourceControlNavigator({
  workspace,
  status,
  branches,
  tags,
  graph,
  loading,
  onRefresh,
  onStagePath,
  onUnstagePath,
  onStageAll,
  onUnstageAll,
  onCommit,
  onCheckoutBranch,
  onCreateBranch,
  onOpenDiff,
  onOpenCommitDiff,
  selectedCommitHash,
  onSelectCommit,
  onOpenFileLocation,
  onCreateBaseline,
  onRunDiff,
  onGenerateDocument
}: {
  workspace: WorkspaceView;
  status: GitWorkspaceStatus | null;
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  graph: GitCommitGraphEntry[];
  loading: boolean;
  onRefresh(): void;
  onStagePath(path: string): void;
  onUnstagePath(path: string): void;
  onStageAll(): void;
  onUnstageAll(): void;
  onCommit(message: string): void;
  onCheckoutBranch(branchName: string): void;
  onCreateBranch(branchName: string): void;
  onOpenDiff(entry: GitWorkspaceStatus["entries"][number], side: GitDiffSide): void;
  onOpenCommitDiff(path: string, commit: string): void;
  selectedCommitHash: string | null;
  onSelectCommit(hash: string): void;
  onOpenFileLocation(entry: GitWorkspaceStatus["entries"][number]): void;
  onCreateBaseline(): void;
  onRunDiff(): void;
  onGenerateDocument(): void;
}): React.JSX.Element {
  const [commitMessage, setCommitMessage] = React.useState("");
  const [newBranchName, setNewBranchName] = React.useState("");
  const stagedEntries = React.useMemo(() => status?.entries.filter(isGitEntryStaged) ?? [], [status]);
  const unstagedEntries = React.useMemo(() => status?.entries.filter(isGitEntryUnstaged) ?? [], [status]);
  const currentBranch = status?.currentBranch ?? branches.find((branch) => branch.current)?.name ?? "detached";
  const canCommit = Boolean(status?.isRepository) && stagedEntries.length > 0 && commitMessage.trim().length > 0 && !loading;

  if (!status) {
    return <section className="source-control-panel" aria-label="源代码管理">
      <div className="source-control-title"><p className="eyebrow">SOURCE CONTROL</p><h2>源代码管理</h2></div>
      <p className="git-empty">Git 状态读取中…</p>
    </section>;
  }

  if (!status.isRepository) {
    return <section className="source-control-panel" aria-label="源代码管理">
      <div className="source-control-title"><p className="eyebrow">SOURCE CONTROL</p><h2>源代码管理</h2></div>
      <p className="git-empty">{status.message ?? "请先在外部执行 git init，或打开已有 Git 仓库目录。"}</p>
    </section>;
  }

  return <section className="source-control-panel" aria-label="源代码管理">
    <div className="source-control-title">
      <div>
        <p className="eyebrow">SOURCE CONTROL</p>
        <h2>源代码管理</h2>
      </div>
      <button aria-label="刷新 Git 状态" title="刷新" disabled={loading} onClick={onRefresh}>↻</button>
    </div>
    <div className="source-control-summary">
      <span>{workspace.name}</span>
      <small>{currentBranch} · {status.headShortCommit ?? "no HEAD"} · {status.isDirty ? `${status.entries.length} changes` : "clean"}</small>
    </div>

    <section className="source-control-actions" aria-label="Git 操作">
      <div className="source-control-toolbar">
        <button disabled={loading || unstagedEntries.length === 0} onClick={onStageAll} title="全部暂存">＋</button>
        <button disabled={loading || stagedEntries.length === 0} onClick={onUnstageAll} title="全部取消暂存">−</button>
      </div>
      <div className="source-control-commit">
        <textarea
          aria-label="Git 提交信息"
          value={commitMessage}
          placeholder="Message (Ctrl+Enter to commit)"
          onChange={(event) => setCommitMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === "Enter" && canCommit) {
              const message = commitMessage.trim();
              onCommit(message);
              setCommitMessage("");
            }
          }}
        />
        <button
          className="primary-action"
          disabled={!canCommit}
          onClick={() => {
            const message = commitMessage.trim();
            onCommit(message);
            setCommitMessage("");
          }}
        >提交暂存更改</button>
        {status.hasConflicts && <p className="git-warning">检测到冲突，请先解决冲突再提交。</p>}
      </div>
      <GitVersionAssetPanel
        workspace={workspace}
        status={status}
        branches={branches}
        tags={tags}
        currentBranch={currentBranch}
        loading={loading}
        newBranchName={newBranchName}
        onNewBranchNameChange={setNewBranchName}
        onCheckoutBranch={onCheckoutBranch}
        onCreateBranch={onCreateBranch}
        onCreateBaseline={onCreateBaseline}
        onRunDiff={onRunDiff}
        onGenerateDocument={onGenerateDocument}
      />
    </section>

    <nav className="source-control-changes" aria-label="Git 文件变化">
      <GitChangeList title="Staged Changes" entries={stagedEntries} area="staged" loading={loading} onStagePath={onStagePath} onUnstagePath={onUnstagePath} onOpenDiff={onOpenDiff} onOpenFileLocation={onOpenFileLocation} />
      <GitChangeList title="Changes" entries={unstagedEntries} area="unstaged" loading={loading} onStagePath={onStagePath} onUnstagePath={onUnstagePath} onOpenDiff={onOpenDiff} onOpenFileLocation={onOpenFileLocation} />
    </nav>

    <GitCommitGraphPanel graph={graph} currentBranch={currentBranch} selectedCommitHash={selectedCommitHash} onSelectCommit={onSelectCommit} onOpenCommitDiff={onOpenCommitDiff} />
  </section>;
}

type DiffLine =
  | { kind: "same"; oldLine: number; newLine: number; oldText: string; newText: string }
  | { kind: "remove"; oldLine: number; newLine: null; oldText: string; newText: "" }
  | { kind: "add"; oldLine: null; newLine: number; oldText: ""; newText: string };

function splitDiffLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

function buildLineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = splitDiffLines(oldContent);
  const newLines = splitDiffLines(newContent);
  const dp: number[][] = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      rows.push({ kind: "same", oldLine: i + 1, newLine: j + 1, oldText: oldLines[i], newText: newLines[j] });
      i += 1;
      j += 1;
    } else if (j < newLines.length && (i >= oldLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      rows.push({ kind: "add", oldLine: null, newLine: j + 1, oldText: "", newText: newLines[j] });
      j += 1;
    } else if (i < oldLines.length) {
      rows.push({ kind: "remove", oldLine: i + 1, newLine: null, oldText: oldLines[i], newText: "" });
      i += 1;
    }
  }
  return rows;
}

function GitDiffWorkspace({ tab, diff, loading }: { tab: Extract<WorkspaceTab, { kind: "git-diff" }> | null; diff: GitFileDiff | null; loading: boolean }): React.JSX.Element {
  if (!tab) {
    return <section className="git-diff-empty" aria-label="Git 对比">
      <p className="eyebrow">VERSION WORKSPACE</p>
      <h2>从左侧管理分支、Tag、协议包和文件 Diff</h2>
      <p>分支用于协议实验线或发布线，Tag 用于固定可交付基线；单击 Changes 文件打开 Working Tree / Index 对比，展开 GRAPH 的提交节点后可查看历史 Commit 对比。</p>
    </section>;
  }
  if (!diff) {
    return <section className="git-diff-empty" aria-label="Git 对比">
      <p className="eyebrow">DIFF EDITOR</p>
      <h2>{loading ? "正在加载对比…" : "尚未加载对比"}</h2>
      <p>{tab.path}</p>
    </section>;
  }
  return <GitDiffViewer diff={diff} />;
}

function GitDiffViewer({ diff }: { diff: GitFileDiff }): React.JSX.Element {
  const rows = React.useMemo(() => buildLineDiff(diff.oldContent, diff.newContent), [diff.oldContent, diff.newContent]);
  const diffLabel = diff.side === "index" ? "INDEX DIFF" : diff.side === "commit" ? "COMMIT DIFF" : "WORKING TREE DIFF";
  return <section className="git-diff-view" aria-label="Git 文件对比">
    <header>
      <div>
        <p className="eyebrow">{diffLabel}</p>
        <h2>{diff.path}</h2>
      </div>
      <span className="git-diff-status">{gitStatusBadgeLabel(gitStatusBadge(diff.status, diff.side === "working-tree" ? "unstaged" : "staged"))}</span>
    </header>
    <div className="git-diff-columns" role="table" aria-label={`对比 ${diff.path}`}>
      <div className="git-diff-column-title">{diff.oldLabel}</div>
      <div className="git-diff-column-title">{diff.newLabel}</div>
      {rows.map((row, index) => <React.Fragment key={`${row.kind}:${index}:${row.oldLine ?? ""}:${row.newLine ?? ""}`}>
        <div className={`git-diff-line old ${row.kind}`}>
          <span className="line-number">{row.oldLine ?? ""}</span>
          <code>{row.oldText || " "}</code>
        </div>
        <div className={`git-diff-line new ${row.kind}`}>
          <span className="line-number">{row.newLine ?? ""}</span>
          <code>{row.newText || " "}</code>
        </div>
      </React.Fragment>)}
    </div>
  </section>;
}

function AssistantView({ workspace, onBack }: { workspace: WorkspaceView | null; onBack: () => void }): React.JSX.Element {
  const [runtimeStatus, setRuntimeStatus] = React.useState<AssistantRuntimeStatus | null>(null);
  const [selectedModel, setSelectedModel] = React.useState("");
  const [selectedModuleId, setSelectedModuleId] = React.useState<AssistantModuleId>("overview");
  const [question, setQuestion] = React.useState("如何完成一次协议字段修改并保存到 Header？");
  const [answer, setAnswer] = React.useState<AssistantAskResponse | null>(null);
  const [asking, setAsking] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    window.protoVault.assistantStatus()
      .then((status) => {
        if (!cancelled) {
          setRuntimeStatus(status);
          setSelectedModel((current) => current && status.models.includes(current) ? current : status.selectedModel ?? status.models[0] ?? "");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeStatus({
            available: false,
            endpoint: "http://127.0.0.1:11434",
            models: [],
            message: error instanceof Error ? error.message : String(error)
          });
          setSelectedModel("");
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function ask(): Promise<void> {
    const nextQuestion = question.trim();
    if (!nextQuestion) return;
    setAsking(true);
    try {
      const response = await window.protoVault.askAssistant({
        question: nextQuestion,
        moduleId: selectedModuleId,
        model: selectedModel || undefined,
        workspaceSummary: workspaceSummaryForAssistant(workspace)
      });
      setAnswer(response);
      if (response.model) setSelectedModel(response.model);
      setRuntimeStatus((current) => current ? { ...current, selectedModel: response.model ?? current.selectedModel } : current);
    } finally {
      setAsking(false);
    }
  }

  const selectedModule = PROTOVAULT_ASSISTANT_MODULES.find((module) => module.id === selectedModuleId) ?? PROTOVAULT_ASSISTANT_MODULES[0];
  const modelOptions = runtimeStatus?.models ?? [];
  const modelSelectValue = modelOptions.includes(selectedModel) ? selectedModel : "";
  return <section className="manual-view assistant-view" aria-label="AI 使用助手">
    <div className="manual-hero assistant-hero">
      <div>
        <p className="eyebrow">PROTO VAULT LOCAL AI</p>
        <h2>AI 使用助手</h2>
        <p>这是替代静态帮助文档的本地问答模块。系统会按问题选择少量功能模块和当前工作区摘要注入 prompt，避免把整份手册塞给模型。</p>
      </div>
      <button className="inline-action" onClick={onBack}>返回工作台</button>
    </div>

    <div className="assistant-layout">
      <aside className="assistant-modules" aria-label="助手知识模块">
        <div className="assistant-status">
          <strong>{runtimeStatus?.available ? "Ollama 已连接" : "Ollama 未连接"}</strong>
          <label className="assistant-model-select">
            <span>Ollama 模型</span>
            <select
              aria-label="Ollama 模型"
              value={modelSelectValue}
              disabled={modelOptions.length === 0 || asking}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {modelOptions.length > 0
                ? <>
                  {!modelSelectValue && <option value="">请选择模型</option>}
                  {modelOptions.map((model) => <option key={model} value={model}>{model}{model === "qwen2.5:3b" ? " · 轻量推荐" : ""}</option>)}
                </>
                : <option value="">未发现模型</option>}
            </select>
          </label>
          <small>{runtimeStatus?.selectedModel ? `默认：${runtimeStatus.selectedModel}` : runtimeStatus?.message ?? "正在检测 127.0.0.1:11434"}</small>
          <small>端点：{runtimeStatus?.endpoint ?? "http://127.0.0.1:11434"}</small>
        </div>
        {PROTOVAULT_ASSISTANT_MODULES.map((module) => <button
          key={module.id}
          className={module.id === selectedModuleId ? "active" : ""}
          onClick={() => {
            setSelectedModuleId(module.id);
            setQuestion(module.summary);
          }}
        >
          <span>{module.title}</span>
          <small>{module.summary}</small>
        </button>)}
      </aside>

      <div className="assistant-chat">
        <article className="manual-card assistant-card">
          <h3>{selectedModule.title}</h3>
          <p>{selectedModule.summary}</p>
          <details>
            <summary>查看该模块的 AI 知识片段</summary>
            <pre>{selectedModule.content.trim()}</pre>
          </details>
        </article>

        <article className="manual-card assistant-card">
          <h3>向 ProtoVault 助手提问</h3>
          <label>
            <span>问题</span>
            <textarea
              aria-label="向 ProtoVault 助手提问"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：如何添加字段并同步注释到 Header？"
            />
          </label>
          <div className="assistant-actions">
            <select aria-label="问答模块" value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value as AssistantModuleId)}>
              {PROTOVAULT_ASSISTANT_MODULES.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
            </select>
            <button className="inline-action" disabled={asking || !question.trim()} onClick={() => void ask()}>{asking ? "思考中…" : "提问"}</button>
          </div>
          <p className="assistant-hint">提示：如果 Ollama 未启动，助手会返回离线知识库摘要和启动指引；启动后会自动使用可用模型。</p>
          <p className="assistant-hint">轻量模型建议使用 qwen2.5:3b；首次加载模型可能较慢，生成回答默认最多等待约 120 秒。</p>
        </article>

        {answer && <article className="manual-card assistant-answer" aria-label="AI 回答">
          <h3>{answer.fallback ? "离线知识库回答" : "本地模型回答"}</h3>
          <pre>{answer.answer}</pre>
          <footer>
            <span>模块：{answer.moduleIds.join(", ")}</span>
            <span>Prompt：{answer.promptSize} 字符</span>
            <span>{answer.elapsedMs} ms</span>
            {answer.model && <span>模型：{answer.model}</span>}
          </footer>
        </article>}

        <div className="manual-grid assistant-quickref">
          <article className="manual-card">
            <h3>全局操作习惯</h3>
            <ul>
              <li><kbd>Ctrl</kbd> + <kbd>S</kbd>：保存当前 tab 的源码、结构化编辑或注释改动。</li>
              <li><kbd>F2</kbd>：编辑当前选中的 Header、类型、字段或枚举项。</li>
              <li><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>Alt</kbd> + <kbd>→</kbd>：在上一步 / 下一步界面之间导航。</li>
            </ul>
          </article>
          <article className="manual-card">
            <h3>链路字段速查</h3>
            <dl>
              <dt>延迟预算</dt><dd>用户录入的设计上限，不是当前实测值。</dd>
              <dt>峰值系数</dt><dd>把平均吞吐放大为突发吞吐估计。</dd>
            </dl>
          </article>
          <article className="manual-card">
            <h3>当前工作区摘要</h3>
            <pre>{workspaceSummaryForAssistant(workspace)}</pre>
          </article>
        </div>
      </div>
    </div>
  </section>;
}

function formatBandwidth(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function ProtocolGraphView({ workspace, selectedTypeId, selectedFilePath, appThemeId, onSelectNode, onOpenNode, onGraphContextChange, onClose }: {
  workspace: WorkspaceView;
  selectedTypeId: string | null;
  selectedFilePath: string | null;
  appThemeId: AppThemeId;
  onSelectNode(node: ProtocolGraphNode): void;
  onOpenNode(node: ProtocolGraphNode): void;
  onGraphContextChange(graph: { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] }, selectedNodeId: string | null): void;
  onClose(): void;
}): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderOptionsRef = React.useRef({
    selectedTypeId: null as string | null,
    selectedFilePath: null as string | null,
    focusNodeId: null as string | null,
    relationDepth: new Map<string, number>(),
    searchQuery: "",
    searchMatches: new Set<string>(),
    theme: graphThemeForAppTheme("obsidian")
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
    targetPanX: number;
    targetPanY: number;
    targetZoom: number;
  } | null>(null);
  const [hoveredLabel, setHoveredLabel] = React.useState<string | null>(null);
  const [graphSearchQuery, setGraphSearchQuery] = React.useState("");
  const [selectedGraphNodeId, setSelectedGraphNodeId] = React.useState<string | null>(null);
  const graphTheme = graphThemeForAppTheme(appThemeId);
  const graph = React.useMemo(() => buildProtocolGraph(workspace), [workspace]);
  const focusedNodeId = selectedGraphNodeId ?? (selectedTypeId ? `type:${selectedTypeId}` : selectedFilePath ? `file:${selectedFilePath}` : null);
  const relationDepth = React.useMemo(() => buildGraphRelationDepth(graph.edges, focusedNodeId), [graph.edges, focusedNodeId]);
  const normalizedGraphSearch = graphSearchQuery.trim().toLowerCase();
  const graphSearchMatches = React.useMemo(() => normalizedGraphSearch
    ? new Set(graph.nodes.filter((node) => graphNodeSearchText(node).includes(normalizedGraphSearch)).map((node) => node.id))
    : new Set<string>(), [graph.nodes, normalizedGraphSearch]);
  React.useEffect(() => {
    if (selectedGraphNodeId && !graph.nodes.some((node) => node.id === selectedGraphNodeId)) {
      setSelectedGraphNodeId(null);
      return;
    }
    onGraphContextChange(graph, selectedGraphNodeId);
  }, [graph, onGraphContextChange, selectedGraphNodeId]);
  React.useEffect(() => {
    renderOptionsRef.current = {
      selectedTypeId,
      selectedFilePath,
      focusNodeId: focusedNodeId,
      relationDepth,
      searchQuery: normalizedGraphSearch,
      searchMatches: graphSearchMatches,
      theme: graphTheme
    };
  }, [focusedNodeId, graphSearchMatches, graphTheme, normalizedGraphSearch, relationDepth, selectedFilePath, selectedTypeId]);

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
    simulationRef.current = { nodes, edges, hovered: null, draggingNode: null, panning: false, lastX: 0, lastY: 0, moved: false, panX: 0, panY: 0, zoom: 1, targetPanX: 0, targetPanY: 0, targetZoom: 1 };
    let animationId = 0;
    let lastTime = performance.now();

    function frame(now: number): void {
      const sim = simulationRef.current;
      if (!sim || !canvas) return;
      const delta = Math.min(32, now - lastTime);
      lastTime = now;
      resizeCanvas(canvas);
      const smoothing = 1 - Math.pow(0.001, delta / 180);
      sim.zoom += (sim.targetZoom - sim.zoom) * smoothing;
      sim.panX += (sim.targetPanX - sim.panX) * smoothing;
      sim.panY += (sim.targetPanY - sim.panY) * smoothing;
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
        theme: renderOptions.theme,
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
    const next = node ? `${graphNodeKindLabel(node)} · ${node.label}` : null;
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

  function selectNode(node: ProtocolGraphNode): void {
    setSelectedGraphNodeId(node.id);
    onSelectNode(node);
  }

  function openNode(node: ProtocolGraphNode): void {
    setSelectedGraphNodeId(node.id);
    onOpenNode(node);
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
      sim.targetPanX += dx;
      sim.targetPanY += dy;
      sim.panX = sim.targetPanX;
      sim.panY = sim.targetPanY;
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
    if (node && !sim.moved) selectNode(node);
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const node = hitTest(event.clientX, event.clientY);
    if (node) openNode(node);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const sim = simulationRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - rect.width / 2;
    const pointerY = event.clientY - rect.top - rect.height / 2;
    const beforeX = (pointerX - sim.targetPanX) / sim.targetZoom;
    const beforeY = (pointerY - sim.targetPanY) / sim.targetZoom;
    const factor = Math.exp(-event.deltaY * 0.0014);
    const nextZoom = clamp(sim.targetZoom * factor, 0.38, 3.2);
    sim.targetZoom = nextZoom;
    sim.targetPanX = pointerX - beforeX * nextZoom;
    sim.targetPanY = pointerY - beforeY * nextZoom;
  }

  return <section className={`graph-view graph-theme-${appThemeId}`} aria-label="协议关系图谱">
    <div className="graph-title">
      <div>
        <p className="eyebrow">GRAPH VIEW</p>
        <h2>协议关系图谱</h2>
        <p>专注展示 Header、Struct、Enum 的包含与字段引用关系；数据链路传导请在“网络地图 / 数据流画布”中查看。</p>
      </div>
      <div className="graph-title-actions">
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
        onClick={() => selectNode(node)}
        onDoubleClick={() => openNode(node)}
      >{graphNodeShortKind(node)} · {node.label} · {node.metrics.impactScore}</button>)}
    </div>
  </section>;
}

function graphNodeShortKind(node: ProtocolGraphNode): string {
  if (node.kind === "file") return "H";
  if (node.kind === "struct") return "S";
  if (node.kind === "enum") return "E";
  if (node.kind === "network-node") return "N";
  if (node.kind === "protocol-binding") return "B";
  return node.kind === "producer" ? "P" : "C";
}

function graphNodeKindLabel(node: ProtocolGraphNode): string {
  if (node.kind === "file") return "Header";
  if (node.kind === "struct") return "Struct";
  if (node.kind === "enum") return "Enum";
  if (node.kind === "network-node") return "网络节点";
  if (node.kind === "protocol-binding") return "协议载荷";
  return node.kind === "producer" ? "生产节点" : "消费节点";
}

function buildProtocolGraph(workspace: WorkspaceView): { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] } {
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
    ...files.map((file, index) => {
      const point = radialPoint(index, Math.max(files.length, 1), fileRadius, 0, 0, -Math.PI / 2);
      return { id: `file:${file.path}`, kind: "file" as const, label: file.relativePath.split("/").at(-1) ?? file.relativePath, file, ...point, z: Math.sin(index * 1.9) * 90, metrics: { ...emptyMetrics } };
    }),
    ...types.map((type, index) => {
      const point = radialPoint(index, Math.max(types.length, 1), typeRadius, 0, 0, -Math.PI / 2 + Math.PI / Math.max(types.length, 2));
      return { id: `type:${type.id}`, kind: type.kind, label: type.name, type, ...point, z: Math.cos(index * 1.35) * 70, metrics: { ...emptyMetrics } };
    })
  ];
  const edges: ProtocolGraphEdge[] = [];
  for (const type of types) {
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
    if (node.kind === "network-node" || node.kind === "protocol-binding") {
      node.metrics = {
        ...node.metrics,
        inboundReferences: inbound.get(node.id) ?? node.metrics.inboundReferences,
        outboundReferences: outbound.get(node.id) ?? node.metrics.outboundReferences
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
  const base = node.kind === "file" ? 4.8 : node.kind === "struct" ? 6.8 : node.kind === "enum" ? 6 : node.kind === "network-node" ? 7.2 : node.kind === "protocol-binding" ? 5.8 : 6.4;
  return clamp(base + Math.sqrt(node.metrics.impactScore) * 1.7, base, node.kind === "file" ? 13 : 19);
}

function graphNodeSearchText(node: ProtocolGraphNode): string {
  if (node.kind === "file") return `${node.label} ${node.file.relativePath}`.toLowerCase();
  if (node.kind === "network-node") return `${node.label} ${node.networkNode.kind} ${node.networkNode.role ?? ""} ${node.networkNode.subsystem ?? ""} ${node.networkNode.host ?? ""} ${node.networkNode.process ?? ""} 网络节点 entity node`.toLowerCase();
  if (node.kind === "protocol-binding") return `${node.label} ${node.binding.protocolName ?? ""} ${node.binding.dataName ?? ""} ${node.binding.linkName ?? ""} ${node.binding.criticality} 协议载荷 binding payload`.toLowerCase();
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
  theme: GraphThemePreset;
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
  gradient.addColorStop(0, options.theme.background[0]);
  gradient.addColorStop(0.55, options.theme.background[1]);
  gradient.addColorStop(1, options.theme.background[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGraphBackdrop(context, width, height, options.time, options.theme);
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
    const stroke = graphEdgeStroke(edge, edgeFocus, alpha * edgeRelevance, options.theme);
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
    context.fillStyle = selected ? options.theme.selected.replace(/,\s*0\.\d+\)$/, ", 0.16)") : hovered ? options.theme.hovered.replace(/,\s*0\.\d+\)$/, ", 0.12)") : "rgba(0, 0, 0, 0.22)";
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
    context.fillStyle = graphNodeFill(node, options.theme);
    context.shadowColor = selected ? options.theme.selected : "transparent";
    context.shadowBlur = selected ? 10 : 0;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = selected ? 2.1 : hovered ? 1.5 : 1;
    context.strokeStyle = selected ? options.theme.selected : hovered ? options.theme.hovered : "rgba(7, 10, 15, 0.92)";
    context.stroke();
    if (focused) {
      context.beginPath();
      context.arc(item.x, item.y, item.radius + 4.5, 0, Math.PI * 2);
      context.strokeStyle = selected ? options.theme.selected : options.theme.hovered;
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
      const lightGraph = options.theme.id === "ink" || options.theme.id === "obsidian-light";
      context.lineWidth = lightGraph ? 1.1 : 2.25;
      context.strokeStyle = lightGraph ? "rgba(255, 255, 255, 0.82)" : "rgba(5, 8, 12, 0.96)";
      context.fillStyle = hovered || selected ? options.theme.labelActive : options.theme.labelText;
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

function graphEdgeStroke(edge: GraphSimEdge, focus: "outgoing" | "incoming" | "none", alpha: number, theme: GraphThemePreset): string {
  if (focus === "outgoing") return `rgba(${theme.outgoing}, ${alpha})`;
  if (focus === "incoming") return `rgba(${theme.incoming}, ${alpha})`;
  if (edge.kind === "flow") return `rgba(${theme.flow}, ${alpha})`;
  if (edge.kind === "references") return `rgba(${theme.reference}, ${alpha})`;
  return `rgba(${theme.contains}, ${alpha})`;
}

function graphNodeFill(node: GraphSimNode, theme: GraphThemePreset): string {
  if (node.kind === "file") return theme.file;
  if (node.kind === "struct") return theme.struct;
  if (node.kind === "enum") return theme.enum;
  if (node.kind === "network-node") return theme.producer;
  if (node.kind === "protocol-binding") return theme.consumer;
  if (node.kind === "producer") return theme.producer;
  return theme.consumer;
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

function drawGraphBackdrop(context: CanvasRenderingContext2D, width: number, height: number, time: number, theme: GraphThemePreset): void {
  context.save();
  for (let index = 0; index < 48; index += 1) {
    const x = ((index * 97) % Math.max(1, width)) + Math.sin(time / 1800 + index) * 1.5;
    const y = ((index * 53) % Math.max(1, height)) + Math.cos(time / 2200 + index * 0.7) * 1.5;
    context.beginPath();
    context.arc(x, y, index % 9 === 0 ? 1 : 0.5, 0, Math.PI * 2);
    context.fillStyle = index % 9 === 0 ? theme.starBright : theme.star;
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

function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function networkNodeKindLabel(kind: NetworkNodeKind): string {
  return optionLabel(NETWORK_NODE_KIND_OPTIONS, kind);
}

function networkTransportLabel(transport: NetworkTransportKind): string {
  return optionLabel(NETWORK_TRANSPORT_OPTIONS, transport);
}

function protocolBindingCriticalityLabel(criticality: ProtocolBindingCriticality): string {
  return optionLabel(PROTOCOL_BINDING_CRITICALITY_OPTIONS, criticality);
}

function GraphInspector({ workspace, graph, selectedNode, onOpenNode, onSelectNode }: {
  workspace: WorkspaceView;
  graph: { nodes: ProtocolGraphNode[]; edges: ProtocolGraphEdge[] };
  selectedNode: ProtocolGraphNode | null;
  onOpenNode(node: ProtocolGraphNode): void;
  onSelectNode(node: ProtocolGraphNode): void;
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

  if (selectedNode.kind === "network-node") {
    const node = selectedNode.networkNode;
    const relatedLinks = workspace.network.links.filter((link) => link.fromNodeId === node.id || link.toNodeId === node.id);
    const relatedBindings = workspace.network.bindings.filter((binding) => relatedLinks.some((link) => link.id === binding.linkId));
    const outgoingFlowNodes = graph.edges
      .filter((edge) => edge.kind === "flow" && edge.from === selectedNode.id)
      .map((edge) => nodeById.get(edge.to))
      .filter(Boolean) as ProtocolGraphNode[];
    const incomingFlowNodes = graph.edges
      .filter((edge) => edge.kind === "flow" && edge.to === selectedNode.id)
      .map((edge) => nodeById.get(edge.from))
      .filter(Boolean) as ProtocolGraphNode[];
    const hints = networkNodeBottleneckHints(node);
    return <div className="inspector-stack">
      <dl>
        <dt>名称</dt><dd>{node.name}</dd>
        <dt>类型</dt><dd>{networkNodeKindLabel(node.kind)}</dd>
        <dt>角色</dt><dd>{node.role || "—"}</dd>
        <dt>分系统</dt><dd>{node.subsystem || "—"}</dd>
        <dt>主机</dt><dd>{node.host || "—"}</dd>
        <dt>进程</dt><dd>{node.process || "—"}</dd>
        <dt>出/入链路</dt><dd>{node.outgoingLinkCount} / {node.incomingLinkCount}</dd>
        <dt>出/入带宽</dt><dd>{formatBandwidth(node.outgoingBandwidthBps)} / {formatBandwidth(node.incomingBandwidthBps)}</dd>
      </dl>
      <section className="property-card">
        <h3>节点画像</h3>
        <p className="graph-inspector-caption">硬件</p>
        <p className="readonly-note">{node.hardwareProfile || "尚未记录硬件画像。"}</p>
        <p className="graph-inspector-caption">软件</p>
        <p className="readonly-note">{node.softwareProfile || "尚未记录软件画像。"}</p>
        {node.notes && <p className="readonly-note">{node.notes}</p>}
      </section>
      <section className="property-card flow-warnings">
        <h3>瓶颈提示</h3>
        {hints.length === 0 ? <p className="ok">暂无明显瓶颈线索。</p> : <ul>{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>}
      </section>
      <section className="property-card">
        <h3>链路与协议</h3>
        {relatedLinks.length === 0 ? <p className="readonly-note">暂无关联链路。</p> : <div className="graph-inspector-list">
          {relatedLinks.map((link) => <button key={link.id}>
            <span>{link.fromNodeName ?? link.fromNodeId} → {link.toNodeName ?? link.toNodeId}</span>
            <small>{link.name} · {networkTransportLabel(link.transport)} · {formatBandwidth(link.estimatedBandwidthBps)}</small>
          </button>)}
        </div>}
        {relatedBindings.length > 0 && <div className="tag-list">{relatedBindings.map((binding) => <span key={binding.id}>{binding.name}</span>)}</div>}
      </section>
      <section className="property-card">
        <h3>图谱方向</h3>
        <p className="graph-inspector-caption">我流向的</p>
        <GraphNodeList nodes={outgoingFlowNodes} emptyText="暂无向外数据流" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
        <p className="graph-inspector-caption">流向我的</p>
        <GraphNodeList nodes={incomingFlowNodes} emptyText="暂无输入数据流" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
      </section>
      <section className="property-card">
        <h3>快捷操作</h3>
        <div className="graph-inspector-actions">
          <button className="inline-action" onClick={() => onOpenNode(selectedNode)}>打开网络地图</button>
          <button className="inline-action" onClick={() => onSelectNode(selectedNode)}>保持选中</button>
        </div>
      </section>
    </div>;
  }

  if (selectedNode.kind === "protocol-binding") {
    const binding = selectedNode.binding;
    const link = workspace.network.links.find((item) => item.id === binding.linkId);
    const sourceNode = link ? workspace.network.nodes.find((node) => node.id === link.fromNodeId) : undefined;
    const targetNode = link ? workspace.network.nodes.find((node) => node.id === link.toNodeId) : undefined;
    const typeNode = graph.nodes.find((node) => isProtocolTypeNode(node) && node.type.id === binding.typeId);
    const hints = protocolBindingBottleneckHints(binding, link);
    return <div className="inspector-stack">
      <dl>
        <dt>名称</dt><dd>{binding.name}</dd>
        <dt>协议</dt><dd>{binding.protocolName ?? binding.typeId}</dd>
        <dt>业务数据</dt><dd>{binding.dataName || "—"}</dd>
        <dt>链路</dt><dd>{link?.name ?? binding.linkName ?? binding.linkId}</dd>
        <dt>方向</dt><dd>{sourceNode?.name ?? link?.fromNodeName ?? "—"} → {targetNode?.name ?? link?.toNodeName ?? "—"}</dd>
        <dt>频率</dt><dd>{binding.frequencyHz} Hz</dd>
        <dt>批量/峰值</dt><dd>x{binding.batchSize} / x{binding.peakMultiplier}</dd>
        <dt>载荷</dt><dd>{binding.payloadSize === undefined ? "未知" : formatBytes(binding.payloadSize)}</dd>
        <dt>估算带宽</dt><dd>{formatBandwidth(binding.estimatedBandwidthBps)}</dd>
        <dt>关键等级</dt><dd>{protocolBindingCriticalityLabel(binding.criticality)}</dd>
      </dl>
      <section className="property-card">
        <h3>链路约束</h3>
        {link ? <dl>
          <dt>传输</dt><dd>{networkTransportLabel(link.transport)}</dd>
          <dt>Endpoint</dt><dd>{link.endpoint || "—"}</dd>
          <dt>延迟预算</dt><dd>{link.latencyBudgetMs === undefined ? "—" : `${link.latencyBudgetMs} ms`}</dd>
          <dt>带宽上限</dt><dd>{link.bandwidthLimitMbps === undefined ? "—" : `${link.bandwidthLimitMbps} Mbps`}</dd>
          <dt>状态</dt><dd>{isLinkOverBandwidthLimit(link) ? "超过上限" : "未超限"}</dd>
        </dl> : <p className="readonly-note">没有找到关联链路。</p>}
      </section>
      <section className="property-card flow-warnings">
        <h3>瓶颈提示</h3>
        {hints.length === 0 ? <p className="ok">暂无明显瓶颈线索。</p> : <ul>{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>}
      </section>
      <section className="property-card">
        <h3>备注</h3>
        <p className="readonly-note">{binding.notes || "暂无备注。"}</p>
      </section>
      {typeNode && <section className="property-card">
        <h3>协议类型</h3>
        <GraphNodeList nodes={[typeNode]} emptyText="没有关联协议节点" onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
      </section>}
      <section className="property-card">
        <h3>快捷操作</h3>
        <div className="graph-inspector-actions">
          <button className="inline-action" onClick={() => onOpenNode(selectedNode)}>打开协议 tab</button>
          <button className="inline-action" onClick={() => onSelectNode(selectedNode)}>保持选中</button>
        </div>
      </section>
    </div>;
  }

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

function ProtocolInspector({ type, layout, selectedField, selectedEnumValue }: {
  type: WorkspaceTypeView;
  layout: WorkspaceMemoryLayoutView | null;
  selectedField?: WorkspaceFieldView;
  selectedEnumValue?: WorkspaceEnumValueView;
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
