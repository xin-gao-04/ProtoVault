import React from "react";
import ReactDOM from "react-dom/client";
import type { WorkspaceFieldView, WorkspaceFileView, WorkspaceTypeView, WorkspaceView } from "../../shared/workspace";
import "./styles.css";

type ProtocolTreeNode =
  | { id: string; kind: "folder"; name: string; children: ProtocolTreeNode[] }
  | { id: string; kind: "file"; name: string; file: WorkspaceFileView; children: ProtocolTreeNode[] }
  | { id: string; kind: "type"; name: string; type: WorkspaceTypeView; children: ProtocolTreeNode[] }
  | { id: string; kind: "field"; name: string; parent: WorkspaceTypeView; field?: WorkspaceFieldView; enumValue?: WorkspaceTypeView["values"][number] };

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

  async function createHeaderFromToolbar(): Promise<void> {
    if (!workspace) return;
    const defaultName = `headers/new_protocol_${workspace.files.length + 1}.hpp`;
    const relativePath = window.prompt("新建 Header 相对路径", defaultName);
    if (!relativePath) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.createHeader({ workspaceRoot: workspace.rootPath, relativePath });
      applyWorkspaceResult(result, { selectFileRelativePath: relativePath.replaceAll("\\", "/").replace(/^\/+/, "") });
      setUiNotice(`已创建 Header：${relativePath}`);
    });
  }

  async function createStructFromToolbar(): Promise<void> {
    if (!workspace) return;
    const headerPath = selectedFilePath ?? selectedType?.file ?? workspace.files[0]?.path;
    if (!headerPath) {
      setUiNotice("当前工作区还没有 Header，请先新建 Header 文件");
      return;
    }
    const structName = window.prompt("新建 struct 名称", "NewProtocol");
    if (!structName) return;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.createStruct({ workspaceRoot: workspace.rootPath, headerPath, structName });
      applyWorkspaceResult(result, { selectTypeName: structName });
      setUiNotice(`已创建数据结构：${structName}`);
    });
  }

  async function addFieldFromToolbar(): Promise<void> {
    if (!workspace || selectedType?.kind !== "struct") return;
    const raw = window.prompt("新增字段，格式：类型 名称", "std::uint32_t value");
    if (!raw) return;
    const match = raw.trim().match(/^(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)$/);
    if (!match) {
      setUiNotice("请输入类似 std::uint32_t value 的字段定义");
      return;
    }
    const [, fieldType, fieldName] = match;
    await runWorkspaceAction(async () => {
      const result = await window.protoVault.addField({ workspaceRoot: workspace.rootPath, typeId: selectedType.id, fieldType, fieldName });
      applyWorkspaceResult(result, { selectTypeName: selectedType.name, selectFieldName: fieldName });
      setUiNotice(`已添加字段：${fieldName}`);
    });
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
          <button aria-label="新增数据结构" title="新增数据结构" disabled={!workspace || loading} onClick={() => void createStructFromToolbar()}>✎</button>
          <button aria-label="新建 Header 文件" title="新建 Header 文件" disabled={!workspace || loading} onClick={() => void createHeaderFromToolbar()}>▣＋</button>
          <button aria-label="添加字段" title="添加字段" disabled={selectedType?.kind !== "struct" || loading} onClick={() => void addFieldFromToolbar()}>＋f</button>
          <button aria-label="排序协议树" title="排序协议树" disabled={!workspace} onClick={() => setUiNotice("协议树已按目录、Header、类型排序")}>↥</button>
          <button aria-label="折叠全部" title="折叠全部" disabled={!workspace} onClick={collapseAll}>⌃⌄</button>
        </div>
        {workspace
          ? <nav className="tree" aria-label="协议资产树">
              <TreeNodes
                nodes={tree}
                selectedFilePath={selectedFilePath}
                selectedTypeId={selectedTypeId}
                selectedMemberId={selectedMemberId}
                expandedNodeIds={expandedNodeIds}
                onToggleNode={toggleNode}
                onSelectFile={(file) => {
                  setSelectedFilePath(file.path);
                  setSelectedTypeId(null);
                  setSelectedMemberId(null);
                }}
                onSelectType={(type) => {
                  setSelectedTypeId(type.id);
                  setSelectedFilePath(null);
                  setSelectedMemberId(null);
                  setExpandedNodeIds((current) => new Set(current).add(`type:${type.id}`));
                }}
                onSelectMember={(parent, memberId) => {
                  setSelectedTypeId(parent.id);
                  setSelectedFilePath(null);
                  setSelectedMemberId(memberId);
                }}
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
        {workspace && selectedType && <ProtocolEditor type={selectedType} selectedMemberId={selectedMemberId} />}
        {workspace && selectedFile && <SourceViewer file={selectedFile} />}
        {workspace && !selectedType && !selectedFile && <div className="scan-empty">已发现 {workspace.files.length} 个 Header，但尚未解析到协议类型。</div>}
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
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} level={level + 1} />}
        </div>;
      }
      if (node.kind === "file") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.file.path === selectedFilePath ? "tree-row active" : "tree-row"}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"} Header ${node.file.relativePath}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={`打开 Header ${node.file.relativePath}`} onClick={() => onSelectFile(node.file)}><span className="icon file-icon">H</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} level={level + 1} />}
        </div>;
      }
      if (node.kind === "type") {
        const expanded = expandedNodeIds.has(node.id);
        return <div className="tree-branch" key={node.id}>
          <div className={node.type.id === selectedTypeId && !selectedMemberId ? "tree-row active" : "tree-row"}>
            <button className="disclosure" aria-label={`${expanded ? "折叠" : "展开"}类型 ${node.type.qualifiedName}`} aria-expanded={expanded} onClick={() => onToggleNode(node.id)}>{expanded ? "▾" : "▸"}</button>
            <button className="node-label" aria-label={node.type.qualifiedName} onClick={() => onSelectType(node.type)}><span className="icon type-icon">{node.type.kind === "struct" ? "S" : "E"}</span><span>{node.name}</span></button>
          </div>
          {expanded && <TreeNodes nodes={node.children} selectedFilePath={selectedFilePath} selectedTypeId={selectedTypeId} selectedMemberId={selectedMemberId} expandedNodeIds={expandedNodeIds} onToggleNode={onToggleNode} onSelectFile={onSelectFile} onSelectType={onSelectType} onSelectMember={onSelectMember} level={level + 1} />}
        </div>;
      }
      return <button className={node.id === selectedMemberId ? "tree-row member active" : "tree-row member"} key={node.id} aria-label={`${node.parent.name} ${node.name}`} onClick={() => onSelectMember(node.parent, node.id)}>
        <span className="disclosure-spacer" /><span className="icon field-icon">{node.field ? "f" : "#"}</span><span>{node.name}</span>
        {node.field && <small>{node.field.type}</small>}
        {node.enumValue && <small>{node.enumValue.value ?? "auto"}</small>}
      </button>;
    })}
  </div>;
}

function ProtocolEditor({ type, selectedMemberId }: { type: WorkspaceTypeView; selectedMemberId: string | null }): React.JSX.Element {
  return <div className="editor">
    <div className="editor-title"><div><p className="eyebrow">{type.kind}</p><h2>{type.name}</h2><p>{type.qualifiedName}</p></div><span className="status">AST 已同步</span></div>
    {type.kind === "struct" ? <table><thead><tr><th>字段</th><th>类型</th><th>位置</th></tr></thead><tbody>{type.fields.map((field) => <tr className={field.id === selectedMemberId ? "selected-row" : undefined} key={field.id}><td>{field.name}</td><td><code>{field.type}</code></td><td>{field.location ? `${field.location.line}:${field.location.column}` : "—"}</td></tr>)}</tbody></table> : <table><thead><tr><th>枚举项</th><th>值</th></tr></thead><tbody>{type.values.map((value) => <tr className={`enum-value:${type.id}:${value.name}` === selectedMemberId ? "selected-row" : undefined} key={value.name}><td>{value.name}</td><td>{value.value ?? "自动"}</td></tr>)}</tbody></table>}
  </div>;
}

function SourceViewer({ file }: { file: WorkspaceView["files"][number] }): React.JSX.Element {
  return <div className="source-viewer">
    <div className="editor-title"><div><p className="eyebrow">Header Source</p><h2>{file.relativePath.split("/").at(-1)}</h2><p>{file.includes.length} 个 include 依赖</p></div><span className="status">只读预览</span></div>
    <pre><code>{file.content}</code></pre>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
