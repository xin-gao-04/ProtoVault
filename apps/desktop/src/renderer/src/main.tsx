import React from "react";
import ReactDOM from "react-dom/client";
import type { WorkspaceFieldView, WorkspaceFileView, WorkspaceTypeView, WorkspaceView } from "../../shared/workspace";
import "./styles.css";

type ProtocolTreeNode =
  | { id: string; kind: "folder"; name: string; children: ProtocolTreeNode[] }
  | { id: string; kind: "file"; name: string; file: WorkspaceFileView; children: ProtocolTreeNode[] }
  | { id: string; kind: "type"; name: string; type: WorkspaceTypeView; children: ProtocolTreeNode[] }
  | { id: string; kind: "field"; name: string; parent: WorkspaceTypeView; field?: WorkspaceFieldView; enumValue?: WorkspaceTypeView["values"][number] };

type WorkspaceAction = "create-header" | "create-struct" | "edit-header" | "edit-struct" | "add-field" | "edit-field";
type WorkspaceTab = { id: string; kind: "file"; title: string; filePath: string } | { id: string; kind: "type"; title: string; typeId: string };
type ContextMenuState = {
  x: number;
  y: number;
  target:
    | { kind: "workspace" }
    | { kind: "file"; file: WorkspaceFileView }
    | { kind: "type"; type: WorkspaceTypeView }
    | { kind: "field"; type: WorkspaceTypeView; field: WorkspaceFieldView };
};

function App(): React.JSX.Element {
  const [health, setHealth] = React.useState("正在连接本地协议服务…");
  const [workspace, setWorkspace] = React.useState<WorkspaceView | null>(null);
  const [selectedTypeId, setSelectedTypeId] = React.useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<Set<string>>(new Set());
  const [navigatorWidth, setNavigatorWidth] = React.useState(340);
  const [inspectorWidth, setInspectorWidth] = React.useState(260);
  const [uiNotice, setUiNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [activeAction, setActiveAction] = React.useState<WorkspaceAction | null>(null);
  const [headerRelativePath, setHeaderRelativePath] = React.useState("");
  const [structName, setStructName] = React.useState("NewProtocol");
  const [structHeaderPath, setStructHeaderPath] = React.useState("");
  const [headerEditRelativePath, setHeaderEditRelativePath] = React.useState("");
  const [structEditName, setStructEditName] = React.useState("");
  const [fieldType, setFieldType] = React.useState("std::uint32_t");
  const [fieldName, setFieldName] = React.useState("value");
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const selectedType = workspace?.types.find((type) => type.id === selectedTypeId);
  const selectedFile = workspace?.files.find((file) => file.path === selectedFilePath);
  const selectedMemberName = selectedType?.fields.find((field) => field.id === selectedMemberId)?.name
    ?? selectedType?.values.find((value) => `enum-value:${selectedType.id}:${value.name}` === selectedMemberId)?.name;
  const tree = React.useMemo(() => workspace ? buildProtocolTree(workspace) : [], [workspace]);

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
    setSelectedTypeId(nextFile ? null : nextType?.id ?? null);
    setSelectedFilePath(nextFile?.path ?? null);
    setSelectedMemberId(nextMemberId);
    setExpandedNodeIds(initialExpandedNodeIds(nextTree, nextType?.id ?? null));
    const nextActiveTab = nextFile ? tabForFile(nextFile) : nextType ? tabForType(nextType) : null;
    setTabs((current) => reconcileTabs(current, result, nextActiveTab));
    setActiveTabId(nextActiveTab?.id ?? null);
  }, []);

  React.useEffect(() => {
    window.protoVault.health()
      .then((result) => setHealth(`服务就绪 · Contract ${result.contractVersion}`))
      .catch(() => setHealth("本地协议服务不可用"));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
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

  async function runWorkspaceAction(action: () => Promise<void>): Promise<void> {
    setLoading(true);
    try {
      await action();
    } catch (error) {
      setUiNotice(error instanceof Error ? error.message : String(error));
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
    if (action === "edit-header") {
      const file = selectedFile ?? workspace.files.find((item) => item.path === selectedType?.file) ?? workspace.files[0];
      if (!file) return;
      setSelectedFilePath(file.path);
      setSelectedTypeId(null);
      setSelectedMemberId(null);
      setHeaderEditRelativePath(file.relativePath);
    }
    if (action === "edit-struct") {
      if (!selectedType || selectedType.kind !== "struct") return;
      setStructEditName(selectedType.name);
    }
    if (action === "add-field") {
      setFieldType("std::uint32_t");
      setFieldName("value");
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
    if (selectedType?.kind === "struct") {
      openStructuredAction("edit-struct");
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

  function editFile(file: WorkspaceFileView): void {
    openFileTab(file);
    setHeaderEditRelativePath(file.relativePath);
    setActiveAction("edit-header");
  }

  function editType(type: WorkspaceTypeView): void {
    openTypeTab(type);
    if (type.kind !== "struct") {
      setUiNotice("当前仅支持编辑 struct");
      return;
    }
    setStructEditName(type.name);
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

  async function addFieldFromForm(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct") return;
    const nextFieldType = fieldType.trim();
    const nextFieldName = fieldName.trim();
    if (!nextFieldType || !nextFieldName) {
      setUiNotice("字段类型和字段名称不能为空");
      return;
    }
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldType: nextFieldType, fieldName: nextFieldName });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已添加字段：${nextFieldName}`);
      setActiveAction(null);
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
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.updateField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldId: editingFieldId, fieldType: nextFieldType, fieldName: nextFieldName });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: nextFieldName });
      setUiNotice(`已更新字段：${nextFieldName}`);
      setActiveAction(null);
      setEditingFieldId(null);
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

  function openFileTab(file: WorkspaceFileView): void {
    const tab = tabForFile(file);
    setTabs((current) => upsertTab(current, tab));
    setActiveTabId(tab.id);
    setSelectedFilePath(file.path);
    setSelectedTypeId(null);
    setSelectedMemberId(null);
  }

  function openTypeTab(type: WorkspaceTypeView, memberId: string | null = null): void {
    const tab = tabForType(type);
    setTabs((current) => upsertTab(current, tab));
    setActiveTabId(tab.id);
    setSelectedTypeId(type.id);
    setSelectedFilePath(null);
    setSelectedMemberId(memberId);
    setExpandedNodeIds((current) => new Set(current).add(`type:${type.id}`));
  }

  function activateTab(tab: WorkspaceTab): void {
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

  function closeTab(tabId: string): void {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const fallback = next[Math.max(0, index - 1)] ?? next[0] ?? null;
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

  function openEditFieldAction(type: WorkspaceTypeView, field: WorkspaceFieldView): void {
    openTypeTab(type, field.id);
    setFieldType(field.type);
    setFieldName(field.name);
    setEditingFieldId(field.id);
    setActiveAction("edit-field");
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
        <button aria-label="协议工作区">◇</button>
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
          <button aria-label="新建 Header 文件" title="新建 Header 文件" disabled={!workspace || loading} onClick={() => openStructuredAction("create-header")}>▣＋</button>
          <button aria-label="添加字段" title="添加字段" disabled={selectedType?.kind !== "struct" || loading} onClick={() => openStructuredAction("add-field")}>＋f</button>
          <button aria-label="排序协议树" title="排序协议树" disabled={!workspace} onClick={() => setUiNotice("协议树已按目录、Header、类型排序")}>↥</button>
          <button aria-label="折叠全部" title="折叠全部" disabled={!workspace} onClick={collapseAll}>⌃⌄</button>
        </div>
        {workspace
          ? <nav className="tree" aria-label="协议资产树" onContextMenu={(event) => openContextMenu(event, { kind: "workspace" })}>
              <TreeNodes
                nodes={tree}
                selectedFilePath={selectedFilePath}
                selectedTypeId={selectedTypeId}
                selectedMemberId={selectedMemberId}
                expandedNodeIds={expandedNodeIds}
                onToggleNode={toggleNode}
                onSelectFile={(file) => {
                  openFileTab(file);
                }}
                onSelectType={(type) => {
                  openTypeTab(type);
                }}
                onSelectMember={(parent, memberId) => {
                  openTypeTab(parent, memberId);
                }}
                onOpenContextMenu={openContextMenu}
              />
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
            {uiNotice && <small className="notice" role="status">{uiNotice}</small>}
            <small className="health">{health}</small>
          </div>
        </header>
        {!workspace && <article>
          <p className="eyebrow">PROTO VAULT · MVP</p>
          <h2>让散落在 Header 中的协议<br />成为可管理的工程资产。</h2>
          <p className="lede">扫描 C++ 数据结构，理解字段布局，维护语义元数据，并用受控生成与语义差异守住协议演进。</p>
          <div className="flow"><span>扫描</span><b>→</b><span>IR</span><b>→</b><span>布局</span><b>→</b><span>生成</span><b>→</b><span>检查</span></div>
        </article>}
        {workspace && <TabStrip tabs={tabs} activeTabId={activeTabId} onActivate={activateTab} onClose={closeTab} />}
        {workspace && activeAction && <StructuredActionPanel
          action={activeAction}
          workspace={workspace}
          selectedType={selectedType}
          loading={loading}
          headerRelativePath={headerRelativePath}
          headerEditRelativePath={headerEditRelativePath}
          structHeaderPath={structHeaderPath}
          structName={structName}
          structEditName={structEditName}
          fieldType={fieldType}
          fieldName={fieldName}
          onHeaderRelativePathChange={setHeaderRelativePath}
          onHeaderEditRelativePathChange={setHeaderEditRelativePath}
          onStructHeaderPathChange={setStructHeaderPath}
          onStructNameChange={setStructName}
          onStructEditNameChange={setStructEditName}
          onFieldTypeChange={setFieldType}
          onFieldNameChange={setFieldName}
          onCancel={() => setActiveAction(null)}
          onCreateHeader={() => void createHeaderFromForm()}
          onCreateStruct={() => void createStructFromForm()}
          onRenameHeader={() => void renameHeaderFromForm()}
          onDeleteHeader={() => void deleteHeaderFromForm()}
          onRenameStruct={() => void renameStructFromForm()}
          onDeleteStruct={() => void deleteStructFromForm()}
          onAddField={() => void addFieldFromForm()}
          onUpdateField={() => void updateFieldFromForm()}
          onDeleteField={() => void deleteFieldFromForm()}
        />}
        {workspace && selectedType && <ProtocolEditor type={selectedType} selectedMemberId={selectedMemberId} onEditType={() => openStructuredAction("edit-struct")} onEditField={openEditFieldAction} onOpenContextMenu={openContextMenu} />}
        {workspace && selectedFile && <SourceViewer file={selectedFile} onEditHeader={() => openStructuredAction("edit-header")} onOpenContextMenu={openContextMenu} />}
        {workspace && !selectedType && !selectedFile && <div className="scan-empty">已发现 {workspace.files.length} 个 Header，但尚未解析到协议类型。</div>}
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
          onAddField={(type) => runContextAction(() => {
            openTypeTab(type);
            setFieldType("std::uint32_t");
            setFieldName("value");
            setActiveAction("add-field");
          })}
          onEditFile={(file) => runContextAction(() => editFile(file))}
          onEditType={(type) => runContextAction(() => editType(type))}
          onEditField={(type, field) => runContextAction(() => openEditFieldAction(type, field))}
        />}
      </section>
      <div className="resize-handle" role="separator" aria-label="调整属性栏宽度" onPointerDown={(event) => startResize("inspector", event)} />
      <aside className="inspector">
        <h2>属性</h2>
        {selectedType ? <dl><dt>类型</dt><dd>{selectedType.kind}</dd><dt>名称</dt><dd>{selectedType.name}</dd>{selectedMemberName && <><dt>当前项</dt><dd>{selectedMemberName}</dd></>}<dt>成员</dt><dd>{selectedType.kind === "struct" ? selectedType.fields.length : selectedType.values.length}</dd><dt>来源</dt><dd className="break">{selectedType.file}</dd></dl>
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
      : type.values.map((value) => ({ id: `enum-value:${type.id}:${value.name}`, kind: "field" as const, name: value.name, parent: type, enumValue: value }))
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

function upsertTab(tabs: WorkspaceTab[], tab: WorkspaceTab): WorkspaceTab[] {
  return tabs.some((item) => item.id === tab.id) ? tabs : [...tabs, tab];
}

function reconcileTabs(tabs: WorkspaceTab[], workspace: WorkspaceView, activeTab: WorkspaceTab | null): WorkspaceTab[] {
  const files = new Map(workspace.files.map((file) => [file.path, file]));
  const types = new Map(workspace.types.map((type) => [type.id, type]));
  const next = tabs.flatMap((tab): WorkspaceTab[] => {
    if (tab.kind === "file") {
      const file = files.get(tab.filePath);
      return file ? [tabForFile(file)] : [];
    }
    const type = types.get(tab.typeId);
    return type ? [tabForType(type)] : [];
  });
  return activeTab ? upsertTab(next, activeTab) : next;
}

function TabStrip({ tabs, activeTabId, onActivate, onClose }: {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onActivate(tab: WorkspaceTab): void;
  onClose(tabId: string): void;
}): React.JSX.Element | null {
  if (tabs.length === 0) return null;
  return <nav className="tab-strip" aria-label="工作区标签页">
    {tabs.map((tab) => <div className={tab.id === activeTabId ? "workspace-tab active" : "workspace-tab"} key={tab.id}>
      <button className="workspace-tab-main" aria-label={`切换到 ${tab.title}`} onClick={() => onActivate(tab)}>
        <span className={tab.kind === "file" ? "tab-kind file" : "tab-kind type"}>{tab.kind === "file" ? "H" : "S"}</span>
        <span>{tab.title}</span>
      </button>
      <button className="workspace-tab-close" aria-label={`关闭 ${tab.title}`} onClick={() => onClose(tab.id)}>×</button>
    </div>)}
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
  onSelectType,
  onSelectMember,
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
  onSelectType(type: WorkspaceTypeView): void;
  onSelectMember(parent: WorkspaceTypeView, memberId: string): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
  level?: number;
}): React.JSX.Element {
  return <div className="tree-level" style={{ "--level": level } as React.CSSProperties}>
    {nodes.map((node) => {
      if (node.kind === "folder") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className="tree-row folder">
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"}目录 ${node.name}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label folder-label" aria-label={`目录 ${node.name}`} onClick={() => onToggleNode(node.id)}><span className="icon folder-icon">■</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      if (node.kind === "file") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.file.path === selectedFilePath ? "tree-row active" : "tree-row"} onContextMenu={(event) => onOpenContextMenu(event, { kind: "file", file: node.file })}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"} Header ${node.file.relativePath}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={`打开 Header ${node.file.relativePath}`} onClick={() => onSelectFile(node.file)}><span className="icon file-icon">H</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      if (node.kind === "type") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.type.id === selectedTypeId && !selectedMemberId ? "tree-row active" : "tree-row"} onContextMenu={(event) => onOpenContextMenu(event, { kind: "type", type: node.type })}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"}类型 ${node.type.qualifiedName}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={node.type.qualifiedName} onClick={() => onSelectType(node.type)}><span className="icon type-icon">{node.type.kind === "struct" ? "S" : "E"}</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} onOpenContextMenu={onOpenContextMenu} level={level + 1} />}
        </div>;
      }
      return <button className={node.id === selectedMemberId ? "tree-row member active" : "tree-row member"} key={node.id} aria-label={`${node.parent.name} ${node.name}`} onClick={() => onSelectMember(node.parent, node.id)} onContextMenu={(event) => node.field ? onOpenContextMenu(event, { kind: "field", type: node.parent, field: node.field }) : undefined}>
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
  selectedType,
  loading,
  headerRelativePath,
  headerEditRelativePath,
  structHeaderPath,
  structName,
  structEditName,
  fieldType,
  fieldName,
  onHeaderRelativePathChange,
  onHeaderEditRelativePathChange,
  onStructHeaderPathChange,
  onStructNameChange,
  onStructEditNameChange,
  onFieldTypeChange,
  onFieldNameChange,
  onCancel,
  onCreateHeader,
  onCreateStruct,
  onRenameHeader,
  onDeleteHeader,
  onRenameStruct,
  onDeleteStruct,
  onAddField,
  onUpdateField,
  onDeleteField
}: {
  action: WorkspaceAction;
  workspace: WorkspaceView;
  selectedType?: WorkspaceTypeView;
  loading: boolean;
  headerRelativePath: string;
  headerEditRelativePath: string;
  structHeaderPath: string;
  structName: string;
  structEditName: string;
  fieldType: string;
  fieldName: string;
  onHeaderRelativePathChange(value: string): void;
  onHeaderEditRelativePathChange(value: string): void;
  onStructHeaderPathChange(value: string): void;
  onStructNameChange(value: string): void;
  onStructEditNameChange(value: string): void;
  onFieldTypeChange(value: string): void;
  onFieldNameChange(value: string): void;
  onCancel(): void;
  onCreateHeader(): void;
  onCreateStruct(): void;
  onRenameHeader(): void;
  onDeleteHeader(): void;
  onRenameStruct(): void;
  onDeleteStruct(): void;
  onAddField(): void;
  onUpdateField(): void;
  onDeleteField(): void;
}): React.JSX.Element {
  const title = action === "create-header" ? "新建 Header"
    : action === "create-struct" ? "新增数据结构"
      : action === "edit-header" ? "编辑 Header"
        : action === "edit-struct" ? "编辑数据结构"
          : action === "add-field" ? "添加字段"
            : "编辑字段";
  const description = action === "create-header"
    ? "在当前工作区内创建一个受控 Header 文件。"
    : action === "create-struct"
      ? "选择目标 Header，并插入一个最小 struct。"
      : action === "edit-header"
        ? "重命名或删除当前 Header 文件。"
        : action === "edit-struct"
          ? `重命名或删除当前 struct ${selectedType?.name ?? ""}。`
          : action === "add-field"
            ? `向当前 struct ${selectedType?.name ?? ""} 追加字段。`
            : `修改或删除当前 struct ${selectedType?.name ?? ""} 中的字段。`;

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

    {action === "edit-header" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onRenameHeader(); }}>
      <label>
        <span>Header 相对路径</span>
        <input value={headerEditRelativePath} onChange={(event) => onHeaderEditRelativePathChange(event.target.value)} placeholder="headers/protocol.hpp" autoFocus />
      </label>
      <small>重命名不会自动更新其他 Header 的 include 路径。</small>
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

    {action === "add-field" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onAddField(); }}>
      <label>
        <span>字段类型</span>
        <input value={fieldType} onChange={(event) => onFieldTypeChange(event.target.value)} placeholder="std::uint32_t" autoFocus />
      </label>
      <label>
        <span>字段名称</span>
        <input value={fieldName} onChange={(event) => onFieldNameChange(event.target.value)} placeholder="value" />
      </label>
      <small>当前目标：{selectedType?.qualifiedName ?? "未选择 struct"}</small>
      <button type="submit" disabled={loading || selectedType?.kind !== "struct"}>添加字段</button>
    </form>}

    {action === "edit-field" && <form className="action-form action-form-grid" onSubmit={(event) => { event.preventDefault(); onUpdateField(); }}>
      <label>
        <span>字段类型</span>
        <input value={fieldType} onChange={(event) => onFieldTypeChange(event.target.value)} placeholder="std::uint32_t" autoFocus />
      </label>
      <label>
        <span>字段名称</span>
        <input value={fieldName} onChange={(event) => onFieldNameChange(event.target.value)} placeholder="value" />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={loading || selectedType?.kind !== "struct"}>保存修改</button>
        <button type="button" className="danger" disabled={loading || selectedType?.kind !== "struct"} onClick={onDeleteField}>删除字段</button>
      </div>
    </form>}
  </section>;
}

function ProtocolEditor({ type, selectedMemberId, onEditType, onEditField, onOpenContextMenu }: {
  type: WorkspaceTypeView;
  selectedMemberId: string | null;
  onEditType(): void;
  onEditField(type: WorkspaceTypeView, field: WorkspaceFieldView): void;
  onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void;
}): React.JSX.Element {
  return <div className="editor" onContextMenu={(event) => onOpenContextMenu(event, { kind: "type", type })}>
    <div className="editor-title"><div><p className="eyebrow">{type.kind}</p><h2>{type.name}</h2><p>{type.qualifiedName}</p></div><div className="editor-actions"><span className="status">AST 已同步</span>{type.kind === "struct" && <button className="inline-action" onClick={onEditType}>编辑 Struct</button>}</div></div>
    {type.kind === "struct" ? <table><thead><tr><th>字段</th><th>类型</th><th>位置</th><th>操作</th></tr></thead><tbody>{type.fields.map((field) => <tr className={field.id === selectedMemberId ? "selected-row" : undefined} key={field.id} onContextMenu={(event) => onOpenContextMenu(event, { kind: "field", type, field })}><td>{field.name}</td><td><code>{field.type}</code></td><td>{field.location ? `${field.location.line}:${field.location.column}` : "—"}</td><td><button className="inline-action" onClick={() => onEditField(type, field)}>编辑</button></td></tr>)}</tbody></table> : <table><thead><tr><th>枚举项</th><th>值</th></tr></thead><tbody>{type.values.map((value) => <tr className={`enum-value:${type.id}:${value.name}` === selectedMemberId ? "selected-row" : undefined} key={value.name}><td>{value.name}</td><td>{value.value ?? "自动"}</td></tr>)}</tbody></table>}
  </div>;
}

function SourceViewer({ file, onEditHeader, onOpenContextMenu }: { file: WorkspaceView["files"][number]; onEditHeader(): void; onOpenContextMenu(event: React.MouseEvent, target: ContextMenuState["target"]): void }): React.JSX.Element {
  return <div className="source-viewer" onContextMenu={(event) => onOpenContextMenu(event, { kind: "file", file })}>
    <div className="editor-title"><div><p className="eyebrow">Header Source</p><h2>{file.relativePath.split("/").at(-1)}</h2><p>{file.includes.length} 个 include 依赖</p></div><div className="editor-actions"><span className="status">只读预览</span><button className="inline-action" onClick={onEditHeader}>编辑 Header</button></div></div>
    <pre><code>{file.content}</code></pre>
  </div>;
}

function ContextMenu({
  menu,
  onClose,
  onCreateHeader,
  onCreateStruct,
  onAddField,
  onEditFile,
  onEditType,
  onEditField
}: {
  menu: ContextMenuState;
  onClose(): void;
  onCreateHeader(): void;
  onCreateStruct(file: WorkspaceFileView): void;
  onAddField(type: WorkspaceTypeView): void;
  onEditFile(file: WorkspaceFileView): void;
  onEditType(type: WorkspaceTypeView): void;
  onEditField(type: WorkspaceTypeView, field: WorkspaceFieldView): void;
}): React.JSX.Element {
  const items: Array<{ label: string; action(): void; disabled?: boolean }> = [];
  if (menu.target.kind === "workspace") {
    items.push({ label: "新建 Header", action: onCreateHeader });
  }
  if (menu.target.kind === "file") {
    const { file } = menu.target;
    items.push(
      { label: "编辑 Header", action: () => onEditFile(file) },
      { label: "新增 Struct", action: () => onCreateStruct(file) }
    );
  }
  if (menu.target.kind === "type") {
    const { type } = menu.target;
    items.push(
      { label: "编辑 Struct", action: () => onEditType(type), disabled: type.kind !== "struct" },
      { label: "添加字段", action: () => onAddField(type), disabled: type.kind !== "struct" }
    );
  }
  if (menu.target.kind === "field") {
    const { type, field } = menu.target;
    items.push(
      { label: "编辑字段", action: () => onEditField(type, field) },
      { label: "添加字段", action: () => onAddField(type) }
    );
  }

  return <div className="context-menu" role="menu" aria-label="上下文菜单" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    {items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.action(); onClose(); }}>{item.label}</button>)}
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
