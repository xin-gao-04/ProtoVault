export type AssistantModuleId =
  | "overview"
  | "workspace"
  | "protocol-tree"
  | "tabs-navigation"
  | "structured-editing"
  | "source-sync"
  | "layout-lint-docs"
  | "dependency-graph"
  | "network-map"
  | "flow-view-canvas"
  | "git-baseline"
  | "themes-layout";

export interface AssistantKnowledgeModule {
  id: AssistantModuleId;
  title: string;
  summary: string;
  keywords: string[];
  related: AssistantModuleId[];
  content: string;
}

export interface AssistantAskInput {
  question: string;
  moduleId?: AssistantModuleId;
  model?: string;
  workspaceSummary?: string;
}

export interface AssistantAskResponse {
  answer: string;
  model?: string;
  endpoint: string;
  moduleIds: AssistantModuleId[];
  fallback: boolean;
  promptSize: number;
  elapsedMs: number;
  error?: string;
}

export interface AssistantRuntimeStatus {
  available: boolean;
  endpoint: string;
  models: string[];
  selectedModel?: string;
  message?: string;
}

export const PROTOVAULT_ASSISTANT_MODULES: AssistantKnowledgeModule[] = [
  {
    id: "overview",
    title: "产品总览与推荐工作流",
    summary: "解释 ProtoVault 的定位、主闭环和各入口之间的职责边界。",
    keywords: ["总览", "工作流", "mvp", "闭环", "入口", "怎么用", "流程", "AI", "助手", "Ollama", "模型", "overview", "workflow"],
    related: ["workspace", "structured-editing", "network-map", "git-baseline"],
    content: `
ProtoVault 是 Windows 优先的数据协议资产管理桌面工具，不是普通 Header 编辑器。
推荐闭环：打开工作区 → 扫描 C++ Header → 生成协议 IR → 查看/编辑协议字段 → 分析内存布局 → 同步 Header → 生成文档 → Lint → 版本 Diff。
左侧工作栏负责切换主要视图：协议工作台、关系图谱、网络地图、AI 使用助手等。
中间区域是主要操作区：协议表格编辑、源码预览/编辑、网络事实表格、数据流画布、报告和问答。
右侧属性栏只做解释与摘要，不承担主要编辑；字段、枚举、网络事实等编辑应优先在中间表格完成。
当前事实层分为两条主线：协议结构事实和网络事实。协议结构来自 Header 扫描与结构化编辑；网络事实来自节点、链路、协议绑定和 FlowView。
AI 使用助手接入本地 Ollama，左侧状态卡可切换已安装模型；日常问答推荐轻量模型 qwen2.5:3b，复杂代码问题可切换到更大的本地模型。`
  },
  {
    id: "workspace",
    title: "工作区打开、扫描与目录记录",
    summary: "说明打开文件夹、扫描 Header、进度条、空目录保留、上次工作区恢复和文件监听。",
    keywords: ["工作区", "打开", "扫描", "目录", "空文件夹", "进度", "恢复", "文件监听", "workspace", "scan"],
    related: ["protocol-tree", "source-sync", "git-baseline"],
    content: `
工作区入口位于左侧底部工作区栏：可以打开本地目录、加载示例项目、重新扫描和打开设置。
打开对象是文件夹，不是单个文件。扫描会递归发现 .h/.hh/.hpp/.hxx，并保留空目录。
扫描阶段包括 discover/read/parse/metadata/done，界面顶部显示进度反馈，避免大工作区无响应。
工作区记录写入 .protocol/workspace.json，包含目录、Header、类型、诊断和网络摘要。
应用会记住上次工作空间，启动时默认尝试恢复；失败时提示重新打开。
Header 外部修改会触发冲突提示面板。为避免静默覆盖，用户可以重新扫描、查看版本 Diff 或暂时忽略。`
  },
  {
    id: "protocol-tree",
    title: "协议树、文件结构和搜索",
    summary: "说明左侧树如何模拟文件结构，Header 下如何展开类型和字段，以及搜索/右键操作。",
    keywords: ["协议树", "树图", "文件结构", "搜索", "右键", "展开", "收起", "header", "struct", "enum"],
    related: ["tabs-navigation", "structured-editing", "dependency-graph"],
    content: `
协议树模拟完整文件夹结构，而不是只展示最后一级 Header。文件夹可自由展开/收起。
Header 节点下展示当前文件中扫描到的 struct/enum，类型节点下展示字段或枚举项。
树顶部工具栏放置协议编辑相关操作，如新建 Header、新增结构体、新增枚举、添加字段、搜索等。
搜索入口在协议树顶部工具栏；搜索时隐藏不匹配节点，并自动展开匹配路径，类似 IDE/Visual Studio 的过滤式搜索。
右键菜单支持对 Header、Struct、Enum、字段、枚举项进行上下文操作，包括编辑、添加、删除等。
Ctrl 点击字段可从表格定位到树图对应节点。`
  },
  {
    id: "tabs-navigation",
    title: "Tab、预览区和全局导航",
    summary: "说明单击预览、双击固定、关闭菜单、脏状态和 Alt 左右导航。",
    keywords: ["tab", "标签页", "预览", "双击", "关闭", "脏状态", "alt", "后退", "前进", "导航"],
    related: ["source-sync", "structured-editing"],
    content: `
ProtoVault 的 tab 模仿 Visual Studio：单击树节点打开临时预览 tab，双击才固定为正式 tab，避免打开过多标签。
tab 右键菜单包含：打开文件位置（Header）、关闭、关闭其他、关闭左侧、关闭右侧。
存在未保存结构化编辑、注释或源码草稿时，tab 显示脏状态；关闭前会提示保存或放弃。
Ctrl+S 保存当前 tab 范围内的源码、结构化编辑、注释或网络编辑草稿。
Alt+左箭头返回上一步界面，Alt+右箭头前进到下一步界面。它是 UI 导航历史，不是撤销编辑；恢复的是视图、tab、选中项和网络子标签。`
  },
  {
    id: "structured-editing",
    title: "结构化编辑：字段、枚举、注释和初始化值",
    summary: "说明中间表格编辑策略、字段类型选择、F2、右键删除和保存前校验。",
    keywords: ["字段", "枚举", "编辑", "表格", "F2", "删除", "注释", "初始化", "类型", "CRUD", "enum", "field"],
    related: ["source-sync", "layout-lint-docs", "protocol-tree"],
    content: `
主要编辑发生在中间表格，而不是右侧属性栏。右侧属性栏只做摘要展示。
字段表格支持直接添加、修改、删除字段；枚举表格支持添加、修改、删除枚举项。
F2 会编辑当前选中的 Header、Struct、Enum、字段或枚举项；右键菜单也提供对应编辑/删除入口。
字段类型输入由“基础类型”和“组合类型”两级选择辅助。基础类型包括 std::uint32_t、float、double、bool 等；组合类型来自当前工作区扫描到且在头文件可达范围内的其他 struct/enum。
手动输入字段类型时会做校验，不支持或会导致 Header 编译失败的写入应被拒绝。
字段支持初始化值，例如 std::uint32_t id = 7;。枚举项新增时若留空，默认使用当前最大枚举值 + 1，并写入显式数值。
字段注释写在源码字段同行，格式为 // xxx；结构体和枚举注释使用简洁的 /// @brief xxx。`
  },
  {
    id: "source-sync",
    title: "源码编辑、注释同步和冲突保护",
    summary: "说明 Header 源码视图、Ctrl+S 保存、注释双向同步、外部修改保护和错误恢复。",
    keywords: ["源码", "header", "同步", "ctrl-s", "保存", "冲突", "注释", "错误", "clang", "波浪线"],
    related: ["structured-editing", "workspace", "layout-lint-docs"],
    content: `
Header 源码 tab 可直接编辑。Ctrl+S 保存时写回源文件并重扫工作区。
保存前会使用内容 hash 检查是否被外部修改；如果 hash 不一致，会拒绝保存以避免静默覆盖。
结构化编辑写入前会生成候选 Header 并执行 C++ 语法检查；失败时不能写盘。
如果已有 Header 本身存在编译错误，工作区仍保留文件视图和诊断，用户可以打开源码 tab 修复后重新保存/扫描。
注释支持从源码导入并同步回源码：字段行尾 // 注释；结构体、枚举、枚举项可识别 ///、/** */、/*! */ 等形式，并在结构化更新时输出稳定格式。
不支持的 C++ 结构应产生诊断，不应静默丢弃。`
  },
  {
    id: "layout-lint-docs",
    title: "内存布局、Lint 和文档报告",
    summary: "说明 size/offset/padding、Lint 规则、Markdown 文档和报告面板。",
    keywords: ["布局", "size", "offset", "padding", "lint", "文档", "报告", "sizeof", "offsetof", "pack"],
    related: ["structured-editing", "git-baseline"],
    content: `
布局分析显示类型大小、对齐、字段 offset、字段 size、padding before/after、pack 和 partial 状态。
布局估算覆盖定宽整数、浮点、bool、char、enum、struct 引用、定长数组和有限 pack。
P4 验收使用编译器辅助程序的 sizeof/offsetof 交叉验证。
Lint 规则覆盖指针和运行期容器、非定宽类型、缺失字段语义、过多 padding、枚举问题等，并带源码定位和严重等级。
“文档”按钮生成 Markdown 协议文档到 .protocol/reports/protocol-documentation.md，包含字段、布局、枚举和诊断摘要。
网络数据流视图也可生成 Markdown 报告，输出到 .protocol/reports/network-flow-*.md。`
  },
  {
    id: "dependency-graph",
    title: "协议关系图谱",
    summary: "说明图谱只表达 Header/Struct/Enum 依赖，不承担数据流传导。",
    keywords: ["关系图谱", "图谱", "依赖", "引用", "包含", "双击", "跳转", "graph"],
    related: ["protocol-tree", "flow-view-canvas"],
    content: `
协议关系图谱只回答 Header、Struct、Enum 之间如何包含和引用，不再展示网络数据链路传导。
节点类型包括 Header、Struct、Enum；边表达 contains 或 references。
单击节点会更新右侧 Inspector，显示影响力、布局摘要、诊断和上下文；双击节点打开对应 tab 或跳转树图。
图谱支持搜索，搜索会保留命中节点及相关邻居，帮助定位影响范围。
依赖图和数据流画布职责分离：依赖图看协议类型关系，数据流画布看生产节点 → 链路/载荷 → 消费节点。`
  },
  {
    id: "network-map",
    title: "网络地图：节点、链路和协议绑定",
    summary: "说明网络事实层的 CRUD、链路字段、协议绑定和吞吐估算。",
    keywords: ["网络地图", "节点", "链路", "协议绑定", "吞吐", "频率", "批量", "峰值系数", "延迟预算", "带宽"],
    related: ["flow-view-canvas", "layout-lint-docs", "git-baseline"],
    content: `
网络地图是系统事实层，包含 NetworkNode、NetworkLink、ProtocolBinding 和 FlowView。
节点表示仿真主控、模型节点、算法服务、网关、存储、可视化、硬件设备、外部系统等实体，可记录主机、进程、软硬件画像和备注。
链路表示节点之间的通信关系，字段包括源节点、目标节点、传输方式、Endpoint、延迟预算、带宽上限、是否关键和备注。
延迟预算是用户录入的设计上限，不是当前实测值；后续运行期采样可用于预算与实测对比。
协议绑定表示某个协议类型在某条链路上传输。估算吞吐 = payloadSize × frequencyHz × batchSize × peakMultiplier。
峰值系数用于把平均吞吐放大为突发吞吐，1 表示不放大。`
  },
  {
    id: "flow-view-canvas",
    title: "数据流视角与数据流画布",
    summary: "说明 FlowView 是观察层，画布展示生产节点、链路载荷、消费节点和风险。",
    keywords: ["数据流", "FlowView", "画布", "生产节点", "消费节点", "链路载荷", "风险", "瓶颈"],
    related: ["network-map", "dependency-graph"],
    content: `
大型仿真通常有很多业务数据流，但它们共享一张数据链路网络。因此 ProtoVault 不以“数据流”为主事实，而是以实体节点和链路为主事实，FlowView 作为观察层。
数据流视角保存名称、过滤条件、说明和来源，用于定义当前关注范围，例如 Tracking、Telemetry、Control、Replay。
数据流画布按生产节点 → 链路/协议载荷 → 消费节点分层展示，方向从左到右，线宽表达估算带宽，流光表达传输方向，颜色表达风险。
画布中的协议载荷可以跳转到对应协议类型；链路详情展示 endpoint、延迟预算、带宽上限、估算带宽、关键等级和风险原因。
风险提示来自当前录入事实，包括关键链路、带宽超限、高吞吐节点、高连接度节点、高峰值系数、缺失软硬件画像等。`
  },
  {
    id: "git-baseline",
    title: "Git 基线 Tag 与版本 Diff",
    summary: "说明分支、Tag、基线创建条件、版本 Diff 范围和推荐版本治理习惯。",
    keywords: ["git", "分支", "tag", "基线", "版本", "diff", "baseline", "提交", "发布"],
    related: ["layout-lint-docs", "workspace"],
    content: `
ProtoVault 使用 Git 分支和 Tag 表达协议演进，不再使用孤立的 .protocol/snapshots 工作流。
分支表示实验线、任务线或发布维护线；Tag 表示一次可追溯的协议基线。
创建基线 Tag 前必须满足：当前路径属于 Git 仓库、无冲突、当前工作区无未提交改动、Tag 名称不存在。
基线文件写入 .protocol/baselines/*.json，包含协议类型、字段、枚举、布局、Git commit、网络节点、链路、协议绑定和 FlowView 摘要。
版本 Diff 默认比较最近基线 Tag 与当前 working tree，覆盖字段/枚举/布局变化，也覆盖网络节点、链路、协议绑定、FlowView 和带宽变化。
推荐流程：完成协议变更 → Lint/文档/测试 → Git commit → 创建基线 Tag → 用版本 Diff 生成演进风险报告。`
  },
  {
    id: "themes-layout",
    title: "主题、布局和界面习惯",
    summary: "说明 Obsidian 风格、三栏布局、主题切换、滚动区域和工具栏收起。",
    keywords: ["主题", "布局", "obsidian", "三栏", "拖拽", "隐藏", "滚动", "设置", "tokyo", "简墨"],
    related: ["tabs-navigation", "overview"],
    content: `
界面采用 Obsidian 风格的暗色/浅色主题变量，并兼容本地主题思路。全局主题在左侧底部工作区设置中切换。
三栏布局包括左侧协议树/工作栏、中间主工作区、右侧属性 Inspector。左右栏支持拖拽宽度和一键收起，顶部工作栏也可收起。
左侧不是单一滚动组件：协议树区域独立滚动，底部工作区栏固定，避免树过长遮挡工作区管理。
关系图谱和全局 UI 主题联动，不保留独立图谱主题按钮。
中间表格和报告区域根据主题变量着色，避免浅色主题下表格仍是黑色。`
  }
];

const MODULE_BY_ID = new Map(PROTOVAULT_ASSISTANT_MODULES.map((module) => [module.id, module]));

export function getAssistantModule(id: AssistantModuleId): AssistantKnowledgeModule {
  return MODULE_BY_ID.get(id) ?? PROTOVAULT_ASSISTANT_MODULES[0];
}

export function selectAssistantModules(question: string, preferredModuleId?: AssistantModuleId, limit = 4): AssistantKnowledgeModule[] {
  const normalizedQuestion = question.trim().toLowerCase();
  const scores = PROTOVAULT_ASSISTANT_MODULES.map((module) => {
    let score = preferredModuleId === module.id ? 100 : 0;
    if (preferredModuleId && getAssistantModule(preferredModuleId).related.includes(module.id)) score += 18;
    for (const keyword of module.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (normalizedQuestion.includes(normalizedKeyword)) score += Math.max(4, normalizedKeyword.length);
    }
    if (normalizedQuestion.includes(module.title.toLowerCase())) score += 20;
    return { module, score };
  }).sort((left, right) => right.score - left.score);

  const selected = scores.filter((item) => item.score > 0).map((item) => item.module);
  if (selected.length === 0) selected.push(getAssistantModule(preferredModuleId ?? "overview"));
  for (const relatedId of selected[0].related) {
    if (selected.length >= limit) break;
    const related = getAssistantModule(relatedId);
    if (!selected.some((module) => module.id === related.id)) selected.push(related);
  }
  return selected.slice(0, limit);
}

export function buildAssistantPrompt(input: AssistantAskInput, modules: AssistantKnowledgeModule[]): string {
  const workspaceSummary = input.workspaceSummary?.trim()
    ? `\n[当前工作区摘要]\n${input.workspaceSummary.trim()}\n`
    : "";
  const knowledge = modules.map((module) => `
[模块:${module.id}]
标题: ${module.title}
摘要: ${module.summary}
内容:
${module.content.trim()}
`).join("\n---\n");

  return `你是 ProtoVault 的本地产品助手。只根据给定模块知识、当前工作区摘要和用户问题回答。
回答要求：
1. 使用中文，先给结论，再给操作路径。
2. 如果用户问的是“怎么操作”，给出菜单/按钮/快捷键路径。
3. 如果涉及保存、删除、写入 Header、Git Tag，必须提醒冲突保护和前置条件。
4. 不要编造未出现在知识库中的功能；不确定时明确说明。
5. 保持简洁，优先用 3-6 条要点。
${workspaceSummary}
[可用知识模块]
${knowledge}

[用户问题]
${input.question.trim()}
`;
}
