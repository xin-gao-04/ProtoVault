import React from "react";
import type { WorkspaceDiagnostic } from "../../../shared/workspace";

const INITIAL_VISIBLE_PROBLEMS = 20;

type GroupedDiagnostic = {
  diagnostic: WorkspaceDiagnostic;
  count: number;
  key: string;
};

function conciseMessage(message: string): string {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const useful = lines.find((line) => /(?:fatal\s+)?(?:error|warning):/i.test(line))
    ?? lines.find((line) => !line.startsWith("Command failed:"))
    ?? lines[0]
    ?? "未知扫描问题";
  return useful.length > 240 ? `${useful.slice(0, 237)}…` : useful;
}

function groupDiagnostics(diagnostics: WorkspaceDiagnostic[]): GroupedDiagnostic[] {
  const grouped = new Map<string, GroupedDiagnostic>();
  for (const diagnostic of diagnostics) {
    const summary = conciseMessage(diagnostic.message);
    const key = [diagnostic.severity, diagnostic.file ?? "", diagnostic.line ?? "", diagnostic.column ?? "", summary].join("|");
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { diagnostic: { ...diagnostic, message: summary }, count: 1, key });
  }
  return [...grouped.values()].sort((left, right) => {
    if (left.diagnostic.severity !== right.diagnostic.severity) return left.diagnostic.severity === "error" ? -1 : 1;
    return (left.diagnostic.file ?? "").localeCompare(right.diagnostic.file ?? "")
      || (left.diagnostic.line ?? 0) - (right.diagnostic.line ?? 0);
  });
}

function displayLocation(diagnostic: WorkspaceDiagnostic, workspaceRoot: string): string {
  if (!diagnostic.file) return "工作区";
  const normalizedRoot = workspaceRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const normalizedFile = diagnostic.file.replaceAll("\\", "/");
  const path = normalizedFile.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalizedFile.slice(normalizedRoot.length + 1)
    : normalizedFile;
  return `${path}${diagnostic.line ? `:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""}` : ""}`;
}

export function ProblemsPanel({ diagnostics, workspaceRoot, onOpenDiagnostic }: {
  diagnostics: WorkspaceDiagnostic[];
  workspaceRoot: string;
  onOpenDiagnostic: (diagnostic: WorkspaceDiagnostic) => void;
}): React.JSX.Element {
  const [showAll, setShowAll] = React.useState(false);
  const grouped = React.useMemo(() => groupDiagnostics(diagnostics), [diagnostics]);
  const visible = showAll ? grouped : grouped.slice(0, INITIAL_VISIBLE_PROBLEMS);
  const hiddenCount = Math.max(0, grouped.length - visible.length);

  React.useEffect(() => setShowAll(false), [workspaceRoot]);

  return <section className="problems">
    <div className="problems-title">
      <h2>问题 · {diagnostics.length}</h2>
      {grouped.length !== diagnostics.length && <small>{grouped.length} 组</small>}
    </div>
    {diagnostics.length === 0
      ? <p className="ok">没有扫描问题</p>
      : <div className="problem-list">
          {visible.map(({ diagnostic, count, key }) => <button
            className={`problem problem-${diagnostic.severity}`}
            key={key}
            type="button"
            title={diagnostic.file ? "打开对应 Header" : diagnostic.message}
            onClick={() => onOpenDiagnostic(diagnostic)}
          >
            <span className="problem-severity">{diagnostic.severity === "error" ? "错误" : "警告"}</span>
            <span className="problem-message">{diagnostic.message}</span>
            <small>{displayLocation(diagnostic, workspaceRoot)}{count > 1 ? ` · 重复 ${count} 次` : ""}</small>
          </button>)}
          {hiddenCount > 0 && <button className="problems-more" type="button" onClick={() => setShowAll(true)}>显示其余 {hiddenCount} 组问题</button>}
          {showAll && grouped.length > INITIAL_VISIBLE_PROBLEMS && <button className="problems-more" type="button" onClick={() => setShowAll(false)}>收起问题列表</button>}
        </div>}
  </section>;
}
