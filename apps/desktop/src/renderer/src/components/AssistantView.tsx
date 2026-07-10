import React from "react";
import type { WorkspaceView } from "../../../shared/workspace";
import {
  PROTOVAULT_ASSISTANT_MODULES,
  type AssistantAskResponse,
  type AssistantModuleId,
  type AssistantRuntimeStatus
} from "../../../shared/assistant";

function workspaceSummary(workspace: WorkspaceView | null): string {
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

export default function AssistantView({ workspace, onBack }: { workspace: WorkspaceView | null; onBack: () => void }): React.JSX.Element {
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
        workspaceSummary: workspaceSummary(workspace)
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
            <select aria-label="Ollama 模型" value={modelSelectValue} disabled={modelOptions.length === 0 || asking} onChange={(event) => setSelectedModel(event.target.value)}>
              {modelOptions.length > 0
                ? <>{!modelSelectValue && <option value="">请选择模型</option>}{modelOptions.map((model) => <option key={model} value={model}>{model}{model === "qwen2.5:3b" ? " · 轻量推荐" : ""}</option>)}</>
                : <option value="">未发现模型</option>}
            </select>
          </label>
          <small>{runtimeStatus?.selectedModel ? `默认：${runtimeStatus.selectedModel}` : runtimeStatus?.message ?? "正在检测 127.0.0.1:11434"}</small>
          <small>端点：{runtimeStatus?.endpoint ?? "http://127.0.0.1:11434"}</small>
        </div>
        {PROTOVAULT_ASSISTANT_MODULES.map((module) => <button key={module.id} className={module.id === selectedModuleId ? "active" : ""} onClick={() => { setSelectedModuleId(module.id); setQuestion(module.summary); }}>
          <span>{module.title}</span><small>{module.summary}</small>
        </button>)}
      </aside>

      <div className="assistant-chat">
        <article className="manual-card assistant-card">
          <h3>{selectedModule.title}</h3><p>{selectedModule.summary}</p>
          <details><summary>查看该模块的 AI 知识片段</summary><pre>{selectedModule.content.trim()}</pre></details>
        </article>
        <article className="manual-card assistant-card">
          <h3>向 ProtoVault 助手提问</h3>
          <label><span>问题</span><textarea aria-label="向 ProtoVault 助手提问" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：如何添加字段并同步注释到 Header？" /></label>
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
          <h3>{answer.fallback ? "离线知识库回答" : "本地模型回答"}</h3><pre>{answer.answer}</pre>
          <footer><span>模块：{answer.moduleIds.join(", ")}</span><span>Prompt：{answer.promptSize} 字符</span><span>{answer.elapsedMs} ms</span>{answer.model && <span>模型：{answer.model}</span>}</footer>
        </article>}

        <div className="manual-grid assistant-quickref">
          <article className="manual-card"><h3>全局操作习惯</h3><ul>
            <li><kbd>Ctrl</kbd> + <kbd>S</kbd>：保存当前 tab 的源码、结构化编辑或注释改动。</li>
            <li><kbd>F2</kbd>：编辑当前选中的 Header、类型、字段或枚举项。</li>
            <li><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>Alt</kbd> + <kbd>→</kbd>：在上一步 / 下一步界面之间导航。</li>
          </ul></article>
          <article className="manual-card"><h3>链路字段速查</h3><dl><dt>延迟预算</dt><dd>用户录入的设计上限，不是当前实测值。</dd><dt>峰值系数</dt><dd>把平均吞吐放大为突发吞吐估计。</dd></dl></article>
          <article className="manual-card"><h3>当前工作区摘要</h3><pre>{workspaceSummary(workspace)}</pre></article>
        </div>
      </div>
    </div>
  </section>;
}
