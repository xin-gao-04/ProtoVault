# ProtoVault AI 功能知识库

用途：本文件面向本地 AI 助手、RAG 或提示词拼装使用。它按模块保存当前界面操作细节、业务逻辑和安全约束。问答时不应整篇注入模型，而应按用户问题选取 2-4 个相关模块，并追加当前工作区摘要。

版本：2026-07-05
适用范围：ProtoVault 桌面端 MVP，Electron / React / TypeScript，本地 Ollama 问答模块。

---

## assistant_prompt_policy

- 回答语言：中文。
- 回答结构：先结论，再操作路径，再风险/前置条件。
- 不确定时说明“不确定”或“当前版本未实现”，不要编造功能。
- 涉及写盘、删除、Header 生成、Git Tag、覆盖外部修改时，必须提醒冲突保护和前置条件。
- 不要一次注入全量知识库。优先选择：
  - 用户显式选择的模块。
  - 关键词命中的模块。
  - 1-2 个相关模块。
  - 当前工作区摘要。

---

## module: overview

title: 产品总览与推荐工作流

keywords:

- 总览
- 工作流
- MVP
- 闭环
- 怎么用
- 扫描
- 编辑
- Diff

content:

ProtoVault 是 Windows 优先的数据协议资产管理桌面工具，不是普通 Header 编辑器。主闭环是：

```text
打开工作区
→ 扫描 C++ Header
→ 生成协议 IR
→ 查看/编辑协议与字段
→ 分析内存布局
→ 双向同步 Header
→ 生成文档
→ 执行质量检查
→ 查看语义 Diff / 版本 Diff
```

当前界面分为三类事实：

1. 协议结构事实：Header、namespace、struct、enum、field、layout、diagnostic。
2. 网络事实：NetworkNode、NetworkLink、ProtocolBinding。
3. 观察视角：FlowView、数据流画布、报告、版本 Diff。

主操作原则：

- 左侧负责导航和入口。
- 中间负责主要编辑。
- 右侧负责解释和属性摘要。
- AI 使用助手负责问答，不直接修改工程文件；它支持切换本地 Ollama 模型，日常问答优先使用轻量模型。

---

## module: workspace

title: 工作区打开、扫描与目录记录

keywords:

- 工作区
- 打开目录
- 扫描
- 空文件夹
- 进度条
- 外部修改
- 重新扫描

content:

打开工作区时选择的是文件夹，不是单个 Header 文件。扫描逻辑会递归发现 `.h/.hh/.hpp/.hxx`，并记录空文件夹。工作区记录写入：

```text
.protocol/workspace.json
```

扫描阶段包括：

- discover：发现目录和 Header。
- read：读取 Header 内容。
- parse：调用 Clang AST 解析。
- metadata：合并注释、元数据和网络配置。
- done：完成。

界面有扫描进度条，避免大工作区卡顿时没有反馈。应用会记住上次工作区，启动时尝试恢复。

外部修改策略：

- 文件监听只关注 Header，不监听 `.protocol/` 运行产物。
- 检测到外部 Header 修改时弹出冲突提示。
- 用户可以重新扫描、查看版本 Diff 或关闭提示。
- 保存时使用 content hash 防止静默覆盖外部修改。

---

## module: protocol_tree

title: 协议树、文件结构和搜索

keywords:

- 协议树
- 文件结构
- Header
- Struct
- Enum
- 字段
- 搜索
- 右键菜单

content:

协议树模拟完整文件系统层级，不只展示最后一级 Header。文件夹可展开/收起。Header 节点下展示本文件中的 struct/enum，类型节点下展示字段或枚举项。

顶部工具栏放置结构化操作：

- 新建 Header。
- 新增 struct。
- 新增 enum。
- 添加字段。
- 搜索协议树。
- 展开/收起。

搜索行为：

- 搜索框位于树顶部工具栏。
- 不匹配节点隐藏。
- 命中节点路径自动展开。
- 可搜索 Header、类型、字段、枚举项。

右键菜单：

- Header：重命名、删除、编辑 include、打开源码。
- Struct：编辑、添加字段、删除。
- Enum：编辑、添加枚举项、删除。
- Field：编辑、删除。
- Enum value：编辑、删除。

---

## module: tabs_navigation

title: Tab、预览区和全局导航

keywords:

- Tab
- 预览
- 双击
- 关闭
- 脏状态
- Ctrl+S
- Alt
- 后退
- 前进

content:

Tab 逻辑模仿 Visual Studio：

- 单击树节点：打开临时预览 tab。
- 双击树节点：固定为正式 tab。
- 这样避免打开过多 tab。

Tab 右键菜单：

- Header tab：打开文件位置。
- 关闭。
- 关闭其他。
- 关闭左侧。
- 关闭右侧。

脏状态：

- 源码草稿未保存。
- 字段/枚举结构化编辑未保存。
- 注释修改未保存。
- 数据流/网络编辑未保存。

关闭脏 tab 时必须提示，避免丢失修改。

快捷键：

- `Ctrl+S`：保存当前 tab 范围内改动。
- `F2`：编辑当前选中的 Header、类型、字段或枚举项。
- `Alt+←`：返回上一步界面。
- `Alt+→`：前进到下一步界面。

注意：Alt 导航是界面历史，不是撤销编辑。

---

## module: structured_editing

title: 结构化编辑：字段、枚举、注释和初始化值

keywords:

- 字段
- 枚举
- 添加字段
- 删除字段
- 注释
- 初始化
- 类型选择
- F2

content:

主要编辑应在中间表格完成，不依赖右侧属性栏。右侧属性栏只展示摘要。

字段支持：

- 新增字段。
- 修改字段名。
- 修改字段类型。
- 修改初始化值。
- 修改字段注释。
- 删除字段。

字段类型选择：

- 一级：基础类型 / 组合类型。
- 基础类型包括定宽整数、float、double、bool、char、std::byte。
- 组合类型来自当前工作区扫描到的其他 struct/enum，排除自身。
- 手动输入时应做类型检查。

枚举支持：

- 新增枚举项。
- 修改枚举项名称。
- 修改枚举值。
- 删除枚举项。
- 新增枚举项若数值为空，默认写入当前最大值 + 1。

注释策略：

- 字段注释写在字段源码同行，格式为 `// xxx`。
- 结构体/枚举注释可使用 `/// @brief xxx`。
- 扫描时识别已有 `///`、`/** */`、`/*! */` 和字段行尾注释。

写入保护：

- 写入前先生成候选 Header。
- 通过 C++ 语法检查后才写盘。
- 失败时不应破坏源文件。

---

## module: source_sync

title: 源码编辑、注释同步和冲突保护

keywords:

- 源码
- Header
- Ctrl+S
- 保存
- 冲突
- 注释同步
- Clang 错误
- 恢复

content:

Header 源码 tab 可以直接编辑，保存时使用 `Ctrl+S` 或保存按钮。保存后会重新扫描工作区。

冲突保护：

- 打开文件时记录 content hash。
- 保存时比较当前磁盘 hash。
- 若磁盘文件已被外部修改，则拒绝保存。
- 用户需要重新扫描或手动合并。

错误恢复：

- 如果 Header 本身语法错误，扫描应保留文件视图和诊断。
- 用户仍能打开源码 tab 修复。
- 修复后保存并重新扫描。

注释双向同步：

- 删除源码注释后，重新扫描应移除表格中的对应注释。
- 修改源码注释后，表格应反映新注释。
- 表格修改注释后，保存应同步到 Header。

---

## module: layout_lint_docs

title: 内存布局、Lint 和文档报告

keywords:

- 布局
- size
- offset
- padding
- pack
- Lint
- 文档
- 报告

content:

布局分析展示：

- 类型 size。
- alignment。
- dataSize。
- paddingBytes。
- 字段 offset。
- 字段 size。
- paddingBefore / paddingAfter。
- partial 状态和原因。

支持：

- 定宽整数。
- 浮点。
- bool / char。
- enum。
- struct 引用。
- 定长数组。
- 有限 `#pragma pack`。

Lint 覆盖：

- 指针或运行期容器。
- 非定宽类型。
- 缺失字段语义注释。
- padding 过多。
- 枚举问题。
- 不支持语法。

文档：

- 协议文档输出到 `.protocol/reports/protocol-documentation.md`。
- 数据流报告输出到 `.protocol/reports/network-flow-*.md`。

---

## module: dependency_graph

title: 协议关系图谱

keywords:

- 关系图谱
- 依赖
- 引用
- 包含
- Header
- Struct
- Enum

content:

协议关系图谱只表达 Header / Struct / Enum 依赖。它不表达网络链路传导，因为数据链路由数据流画布负责。

节点：

- Header。
- Struct。
- Enum。

边：

- contains：文件包含类型。
- references：字段或类型引用。

交互：

- 单击节点：右侧 Inspector 展示上下文。
- 双击节点：打开对应 tab 或跳转树图。
- 搜索：保留命中节点及邻居。

---

## module: network_map

title: 网络地图：节点、链路和协议绑定

keywords:

- 网络地图
- 节点
- 链路
- 协议绑定
- 延迟预算
- 带宽上限
- 峰值系数

content:

网络地图是事实层。核心对象：

- NetworkNode：实体节点。
- NetworkLink：节点之间通信关系。
- ProtocolBinding：某个协议类型在某条链路上传输。
- FlowView：业务观察视角。

节点字段：

- name。
- kind。
- role。
- subsystem。
- host。
- process。
- hardwareProfile。
- softwareProfile。
- notes。

链路字段：

- fromNodeId。
- toNodeId。
- transport。
- endpoint。
- latencyBudgetMs。
- bandwidthLimitMbps。
- critical。
- notes。

协议绑定字段：

- linkId。
- typeId。
- dataName。
- frequencyHz。
- batchSize。
- peakMultiplier。
- criticality。
- notes。

估算吞吐：

```text
estimatedBandwidthBps = payloadSize * frequencyHz * batchSize * peakMultiplier
```

延迟预算是设计约束，不是实测值。峰值系数表示突发负载放大倍率。

---

## module: flow_view_canvas

title: 数据流视角与数据流画布

keywords:

- 数据流
- FlowView
- 画布
- 生产节点
- 消费节点
- 瓶颈

content:

大型仿真项目有很多业务数据流，但它们共享同一张数据链路网络。因此 ProtoVault 不把每个数据流当作独立事实层，而是把 FlowView 作为观察层。

FlowView 保存：

- name。
- filter。
- description。
- source。

数据流画布展示：

- 左侧：生产节点。
- 中间：通信链路和协议载荷。
- 右侧：消费节点。

视觉编码：

- 方向：左到右箭头。
- 带宽：连线粗细。
- 风险：颜色。
- 流光：数据传导方向。

风险提示：

- 关键链路。
- 带宽超限。
- 高吞吐节点。
- 高连接度节点。
- 高峰值系数。
- 缺失软硬件画像。

---

## module: git_baseline

title: Git 基线 Tag 与版本 Diff

keywords:

- Git
- 分支
- Tag
- 基线
- 版本 Diff
- 发布

content:

ProtoVault 使用 Git 分支和 Tag 管理协议演进。

当前版本 UI 边界：

- 左侧底部工作区栏只展示 Git 状态，例如当前分支、最近 Tag、dirty 改动数量。
- 顶部工作栏提供“基线 Tag”和“版本 Diff”两个协议版本治理按钮。
- 当前版本不提供 Git commit、切换分支、push、pull 或完整源码管理界面。
- 如果用户问“提交版本在哪里”，必须说明：界面里没有 Git commit 按钮；需要使用外部 Git 工具或命令行先提交，再回到 ProtoVault 创建基线 Tag 或查看版本 Diff。

分支作用：

- 实验线。
- 任务线。
- 发布维护线。

Tag 作用：

- 表示一次协议基线。
- 作为版本 Diff 的稳定锚点。

创建基线 Tag 条件：

- 当前路径属于 Git 仓库。
- 无冲突。
- 当前工作区无未提交改动。
- Tag 不存在。

基线文件：

```text
.protocol/baselines/*.json
```

版本 Diff 对比：

- 最近基线 Tag。
- 当前 working tree。

覆盖范围：

- 类型新增/删除。
- 字段新增/删除。
- 字段类型变化。
- 字段 offset 变化。
- 枚举项变化。
- 类型 size 变化。
- 网络节点变化。
- 链路变化。
- 协议绑定变化。
- FlowView 变化。
- 带宽估算变化。

推荐流程：

```text
编辑协议
→ Lint / 文档 / 测试
→ 外部 Git commit
→ 创建基线 Tag
→ 版本 Diff
```

---

## module: themes_layout

title: 主题、布局和界面习惯

keywords:

- 主题
- Obsidian
- 三栏
- 拖拽
- 隐藏
- 滚动
- Tokyo Night
- 简墨

content:

界面采用 Obsidian 风格变量：

- background-primary。
- background-secondary。
- text-normal。
- text-muted。
- interactive-accent。
- background-modifier-border。

全局主题在左侧底部工作区设置中切换。主题影响整体 UI 和关系图谱。

布局：

- 左侧：工作栏、协议树、工作区栏。
- 中间：主要操作区。
- 右侧：Inspector。

交互：

- 左右栏可拖拽调整宽度。
- 左右栏可一键收起。
- 顶部工作栏可收起。
- 协议树独立滚动，底部工作区栏固定。

---

## local_ollama_integration

title: 本地 Ollama 问答模块

content:

默认端点：

```text
http://127.0.0.1:11434
```

环境变量：

```text
PROTOVAULT_OLLAMA_ENDPOINT=http://127.0.0.1:11434
PROTOVAULT_OLLAMA_MODEL=qwen2.5:3b
PROTOVAULT_OLLAMA_STATUS_TIMEOUT_MS=3000
PROTOVAULT_OLLAMA_GENERATE_TIMEOUT_MS=120000
PROTOVAULT_OLLAMA_NUM_PREDICT=700
```

模型发现：

- 调用 `/api/tags`。
- 优先选择环境变量指定模型。
- 否则默认优先选择 `qwen2.5:3b`、`qwen2.5:1.5b`、`qwen3:4b` 等轻量模型，再回退到 qwen、deepseek、llama、mistral、gemma。
- AI 使用助手左侧状态卡提供 “Ollama 模型” 下拉框；用户可以在已安装模型之间切换。
- 当前推荐：日常使用 `qwen2.5:3b`，复杂代码或长上下文问题再切换到更大的本地模型。

提问：

- 调用 `/api/generate`。
- stream=false。
- temperature=0.2。
- num_ctx=4096。
- num_predict 默认 700，避免一次回答过长。
- 状态检测默认 3 秒超时，生成回答默认 120 秒超时。模型首次加载或大模型冷启动可能超过 20 秒，因此生成超时不能和“模型不可用”混为一谈。

降级：

- 如果 Ollama 未启动，界面显示离线知识库摘要。
- 如果生成回答超时，界面也会先显示离线知识库摘要，并在运行时信息中提示超时原因。
- 不阻塞用户继续查看模块知识。
