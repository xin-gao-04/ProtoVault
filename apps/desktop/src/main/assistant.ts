import {
  buildAssistantPrompt,
  PROTOVAULT_ASSISTANT_MODULES,
  selectAssistantModules,
  type AssistantAskInput,
  type AssistantAskResponse,
  type AssistantRuntimeStatus
} from "../shared/assistant";

const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const OLLAMA_TIMEOUT_MS = 20_000;
const MODEL_PREFERENCE = ["qwen", "deepseek", "llama3.1", "llama3", "mistral", "gemma"];

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

function ollamaEndpoint(): string {
  return (process.env.PROTOVAULT_OLLAMA_ENDPOINT ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, "");
}

function selectOllamaModel(models: string[]): string | undefined {
  const configured = process.env.PROTOVAULT_OLLAMA_MODEL?.trim();
  if (configured && models.includes(configured)) return configured;
  if (configured && models.length > 0) return models.find((model) => model.toLowerCase().includes(configured.toLowerCase())) ?? models[0];
  for (const preference of MODEL_PREFERENCE) {
    const match = models.find((model) => model.toLowerCase().includes(preference));
    if (match) return match;
  }
  return models[0];
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = OLLAMA_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getAssistantRuntimeStatus(): Promise<AssistantRuntimeStatus> {
  const endpoint = ollamaEndpoint();
  try {
    const payload = await fetchJson<OllamaTagsResponse>(`${endpoint}/api/tags`, { method: "GET" }, 3_000);
    const models = (payload.models ?? [])
      .map((model) => model.name ?? model.model ?? "")
      .filter(Boolean);
    return {
      available: models.length > 0,
      endpoint,
      models,
      selectedModel: selectOllamaModel(models),
      message: models.length > 0 ? undefined : "Ollama 已连接，但没有发现可用模型。请先执行 ollama pull qwen2.5:7b 或其他模型。"
    };
  } catch (error) {
    return {
      available: false,
      endpoint,
      models: [],
      message: `无法连接 Ollama。请确认已启动 ollama serve，或设置 PROTOVAULT_OLLAMA_ENDPOINT。${error instanceof Error ? ` ${error.message}` : ""}`
    };
  }
}

function fallbackAnswer(input: AssistantAskInput, moduleIds: string[], error?: string): string {
  const modules = PROTOVAULT_ASSISTANT_MODULES.filter((module) => moduleIds.includes(module.id));
  const summaries = modules.map((module) => `- ${module.title}：${module.summary}`).join("\n");
  return `本地 Ollama 当前不可用，因此先用内置知识库给出离线提示。

相关模块：
${summaries}

你可以这样处理：
1. 如果是操作问题，先在上方相关模块中定位入口，再回到工作台执行。
2. 如果要启用 AI 问答，请启动 Ollama：ollama serve。
3. 拉取一个本地模型，例如：ollama pull qwen2.5:7b。
4. 回到 ProtoVault 后重新打开 AI 使用助手，系统会自动读取可用模型。

原始问题：${input.question}
${error ? `\n运行时信息：${error}` : ""}`;
}

export async function askLocalAssistant(input: AssistantAskInput): Promise<AssistantAskResponse> {
  const startedAt = Date.now();
  const modules = selectAssistantModules(input.question, input.moduleId);
  const moduleIds = modules.map((module) => module.id);
  const prompt = buildAssistantPrompt(input, modules);
  const status = await getAssistantRuntimeStatus();

  if (!status.available || !status.selectedModel) {
    return {
      answer: fallbackAnswer(input, moduleIds, status.message),
      endpoint: status.endpoint,
      moduleIds,
      fallback: true,
      promptSize: prompt.length,
      elapsedMs: Date.now() - startedAt,
      error: status.message
    };
  }

  try {
    const payload = await fetchJson<OllamaGenerateResponse>(`${status.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: status.selectedModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 4096
        }
      })
    });
    const answer = payload.response?.trim();
    if (!answer) throw new Error(payload.error || "Ollama 返回为空。");
    return {
      answer,
      model: status.selectedModel,
      endpoint: status.endpoint,
      moduleIds,
      fallback: false,
      promptSize: prompt.length,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      answer: fallbackAnswer(input, moduleIds, message),
      model: status.selectedModel,
      endpoint: status.endpoint,
      moduleIds,
      fallback: true,
      promptSize: prompt.length,
      elapsedMs: Date.now() - startedAt,
      error: message
    };
  }
}
