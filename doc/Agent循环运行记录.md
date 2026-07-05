# ProtoVault Agent 循环运行记录

本文档记录采用 LoopAgent / loop engineering 思路后的实际运行轨迹。它不是普通更新日志，而是每轮长循环的“状态快照 + 验收记录 + 下一轮入口”。

## 2026-07-05 P16 Loop 1：Git Source Control 前端集成

### 目标

把 Git 从“协议基线 Tag / 版本 Diff 的支撑能力”升级为前端可操作的 Source Control 视图，模仿 VS Code Git 插件完成本地版本操作。

### 基线状态

- 当前提交：`b8995e3 fix: clarify git commit ui boundary`。
- P14 已有 Git 状态、分支/Tag 查询、协议基线 Tag 和版本 Diff。
- 前端尚无 stage / unstage / commit 操作面板。

### 行动

- 新增 shared Git 操作契约。
- 主进程实现 stage/unstage/commit/checkout/create-branch。
- preload 暴露 Git 操作 API。
- 左侧 activity rail 新增“源代码管理 / Git”入口。
- 中间区域新增 Git Source Control 视图，包含提交框、暂存/未暂存列表、文件级 stage/unstage、全部 stage/unstage、分支切换、新建分支、基线 Tag 和版本 Diff 快捷入口。
- 右侧 Inspector 新增 Git 摘要。
- 更新 AI 知识库、使用手册、开发计划和 E2E。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

结果：

- desktop typecheck：通过。
- desktop unit：4 个测试文件、26 个测试通过。
- desktop build：通过。
- Electron E2E：1 个测试通过，覆盖左侧 `源代码管理` 入口和 Source Control 基础视图。
- 完整 `pnpm release:check`：通过，包含 contracts、desktop、Electron E2E 和 C++ core 配置/构建/CTest。

### 下一轮

建议进入 P16 Loop 2：

1. 文件 diff 预览，与 Header 源码视图联动。
2. 放弃更改操作，但必须设计二次确认和路径安全边界。
3. push / pull / fetch 远端同步，需处理凭据和失败恢复。
4. 分支创建时支持从 Tag / commit 创建。

## 2026-07-05 P15 Loop 3：Ollama 生成超时修复

### 目标

修复 AI 使用助手提问后只返回离线知识库的问题，避免把本地模型冷启动或较慢生成误判为 Ollama 不可用。

### 基线状态

- 当前提交：`aa22b4a feat: support ollama model switching`。
- 用户截图中显示 `运行时信息：This operation was aborted`，耗时约 `20009 ms`。
- 本机直接调用 `qwen2.5:3b` 热启动后可正常返回 `OK`，说明服务和模型本身可用。

### 行动

- 拆分 Ollama 状态检测超时和生成回答超时。
- 状态检测默认 3 秒，生成回答默认 120 秒。
- 新增 `PROTOVAULT_OLLAMA_GENERATE_TIMEOUT_MS`、`PROTOVAULT_OLLAMA_STATUS_TIMEOUT_MS`、`PROTOVAULT_OLLAMA_NUM_PREDICT`。
- 生成回答默认限制 `num_predict=700`，降低长回答拖垮体验的概率。
- 超时错误改为明确提示“生成回答超时”，不再只透出 `This operation was aborted`。
- 更新 AI 使用助手提示和 AI 知识库文档。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

结果：

- desktop typecheck：通过。
- desktop：4 个测试文件、23 个测试通过。
- desktop build：通过。
- Electron E2E：1 个测试通过。
- 完整 `pnpm release:check` 通过。
- `qwen2.5:3b` 直接生成验证通过，同类 Git/Tag 问题约 4.53 秒返回。

### 下一轮

建议继续做真实 UI 提问体验优化：

1. 显示“模型加载中 / 正在生成”阶段性状态。
2. 支持手动取消本次生成。
3. 增加一次真实 ask 的可选集成测试，但不放入默认发布门，避免 CI 依赖本机模型。

## 2026-07-05 P15 Loop 2：轻量 Ollama 模型与模型切换

### 目标

把本地 AI 使用助手从“自动选择一个可用模型”升级为“默认轻量模型 + 用户可切换模型”的模式，降低日常问答启动和推理负担，同时保留大模型用于复杂代码问题。

### 基线状态

- 当前提交：`fac2d22 feat: add local AI help assistant`。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件，继续保留，不纳入提交范围。
- 本机 Ollama 已可用，原有模型为 `qwen3-coder:30b`。

### 行动

- 拉取并验证轻量模型：`qwen2.5:3b`。
- Assistant API 新增可选 `model` 参数；提问时可使用用户选择的模型。
- 主进程模型选择策略改为优先 `qwen2.5:3b`，其次轻量 qwen 系列，再回退到其他已安装模型。
- AI 使用助手左侧状态卡新增 “Ollama 模型” 下拉框，可在已安装模型之间切换。
- 离线提示和 AI 知识库同步改为推荐 `ollama pull qwen2.5:3b`。
- E2E 覆盖模型切换入口可见性。

### 验证

已运行：

```powershell
ollama pull qwen2.5:3b
ollama list
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

结果：

- Ollama 已识别 `qwen2.5:3b`（约 1.9GB）和 `qwen3-coder:30b`（约 18GB）。
- `qwen2.5:3b` 极短生成验证通过，返回 `OK`。
- desktop typecheck：通过。
- desktop：4 个测试文件、23 个测试通过。
- desktop build：通过。
- Electron E2E：1 个测试通过。
- 完整 `pnpm release:check` 通过。

### 下一轮

建议进入 P15 Loop 3：

1. 为 AI 助手增加“当前选中 Header / 类型 / 网络视角”的一键上下文注入。
2. 增加可更新知识库索引，减少文档和 shared 常量长期手工同步。
3. 支持短轮对话历史，但每轮仍执行模块筛选和上下文压缩。

## 2026-07-05 P15：本地 AI 使用助手

### 目标

把静态帮助文档升级为本地 AI 问答模块：整理当前界面操作细节和业务逻辑，形成 AI 可读知识库，并通过 Ollama 按问题注入相关模块，避免上下文爆炸。

### 基线状态

- 当前提交：`c393bcf feat: add git baseline version workflow`。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件，继续保留，不纳入提交范围。
- Ollama 已安装但未运行；本轮启动本地服务后识别到模型 `qwen3-coder:30b`。

### 行动

- 新增 `doc/ProtoVaultAI功能知识库.md`。
- 新增 shared 模块化知识库和模块选择函数。
- 新增 Ollama status/ask 主进程服务。
- 新增 `assistant:status`、`assistant:ask` IPC 和 preload API。
- 原“使用手册”中心视图替换为“AI 使用助手”。
- UI 支持模块选择、问题输入、回答展示、prompt 注入模块列表、模型/耗时/prompt 大小展示。
- Ollama 不可用时返回离线知识库摘要和启动指引。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

结果：

- desktop typecheck：通过。
- desktop：4 个测试文件、22 个测试通过。
- desktop build：通过。
- Electron E2E：1 个测试通过。
- 完整 `pnpm release:check` 通过。
- Ollama 本地生成验证通过：`qwen3-coder:30b` 返回 `OK`。

### 下一轮

建议进入 P15 Loop 2：

1. 增加可更新知识库索引，避免 shared 常量和文档长期手工同步。
2. 支持多轮问答历史，但仍按轮次压缩上下文。
3. 允许用户把当前选中 Header/类型/网络视图作为额外上下文注入。

## 2026-07-05 P14 Loop 0-5：Git 基线与版本治理

### 目标

把旧的协议快照工作流替换为 Git 分支 / Tag 驱动的版本治理：分支表示工作线，Tag 表示协议基线，版本 Diff 对比基线与当前工作树，同时纳入网络事实层变化。

### 基线状态

- 当前提交：`47dcfa3 feat: refine flow navigation and manual`。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件：
  - `examples/radar-workspace/headers/common/geometry.hpp`
  - `examples/radar-workspace/headers/common/time.hpp`
  - `examples/radar-workspace/headers/diagnostics/faults.hpp`
  - `examples/radar-workspace/headers/telemetry/status.hpp`
  - `examples/radar-workspace/headers/common/.time.hpp.29896.1783053185857.tmp`
- 这些文件继续保留，不纳入提交范围。

### 行动

- 新增 Git/Baseline 类型、IPC 和 preload API。
- 主进程实现：
  - 工作区 Git 状态读取。
  - 分支与 Tag 查询。
  - 创建协议基线 Tag。
  - 基线文件写入 `.protocol/baselines/*.json`。
  - 版本 Diff：协议状态 + 网络事实变化。
- UI 替换：
  - `快照` → `基线 Tag`。
  - `Diff` → `版本 Diff`。
  - 工作区底栏展示分支、最近 Tag 和脏状态。
- 公共 UI API 不再暴露旧 snapshot 入口。
- 新增 P14 loop 脚本：
  - `scripts/p14-git-loop.ps1`
  - `pnpm agent:p14`
  - `pnpm agent:p14:all`
- 文档更新：
  - `doc/Agent开发计划.md`
  - `doc/ProtoVault使用手册.md`
  - `doc/开发更新日志.md`

### 当前验证

已运行：

```powershell
pnpm --filter @protovault/contracts test
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm agent:p14
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

当前结果：

- contracts：1 个测试文件、4 个测试通过。
- desktop typecheck：通过。
- desktop：3 个测试文件、20 个测试通过。
- P14 quick loop：通过。
- desktop build：通过。
- Electron E2E：1 个测试通过。
- C++ core：CMake configure/build 通过，CTest `core-self-test` 通过。
- 完整 `pnpm release:check` 通过。

### 下一轮入口

P14 的当前 MVP 闭环已通过发布门。下一轮可以继续把 Git 分支/tag 映射为更强业务模板，例如“实验分支 → 评审 Tag → 发布 Tag → 兼容性报告”。

## 2026-07-03 Loop 3-5：网络上下文、报告与瓶颈提示收束

### 目标

把 P13 从“能画网络数据流”推进到“能解释网络数据流”：图谱选中节点后能看到有效上下文，数据流视图能导出报告，节点画像和链路配置能转化为基础瓶颈线索。

### 基线状态

- 当前提交：`6e8f8db feat: render network flows in graph`。
- P13 Loop 2 已完成关系图谱数据流模式。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件：
  - `examples/radar-workspace/headers/common/geometry.hpp`
  - `examples/radar-workspace/headers/common/time.hpp`
  - `examples/radar-workspace/headers/diagnostics/faults.hpp`
  - `examples/radar-workspace/headers/telemetry/status.hpp`
  - `examples/radar-workspace/headers/common/.time.hpp.29896.1783053185857.tmp`
- 这些文件继续保留，不纳入提交范围。

### 行动

- 修正图谱选中状态：
  - `ProtocolGraphView` 将当前 graph 与 selected node 回传给 App。
  - 右侧 Inspector 使用真实数据流图谱上下文，而不是固定依赖图谱。
  - 单击节点查看上下文，双击才打开 tab 或切换网络地图。
- 扩展 GraphInspector：
  - `network-node` 显示节点画像、入出带宽、链路、协议载荷和瓶颈提示。
  - `protocol-binding` 显示协议、链路方向、频率、批量、峰值系数、估算带宽和链路约束。
  - 方向说明改为“我流向的 / 流向我的”。
- 新增 FlowView Markdown 报告：
  - shared 契约、main IPC、preload API、后端生成函数和 UI 按钮。
  - 报告输出到 `.protocol/reports/network-flow-*.md`。
- 增强瓶颈提示：
  - 高吞吐节点、高连接度节点、高吞吐协议、高峰值系数、链路超限、画像缺失、网关汇聚、存储写入。
- 补充测试：
  - 单元测试覆盖网络报告生成和写盘。
  - E2E 覆盖网络地图中“生成视图报告”按钮。
  - E2E 超时从 30 秒调到 90 秒，适配当前完整纵切流程。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/contracts test
pnpm --filter @protovault/desktop build
pnpm --filter @protovault/desktop test:e2e
pnpm release:check
```

结果通过：

- contracts：2 个测试文件、6 个测试通过。
- desktop typecheck：通过。
- desktop：3 个测试文件、20 个测试通过。
- Electron E2E：1 个测试通过。
- C++ core：CMake configure/build 通过，CTest `core-self-test` 通过。
- 完整 `pnpm release:check` 通过。

### 收获

- P13 的核心价值不在“多一个漂亮图”，而在把网络事实转成可审计的系统理解：谁产生、经哪条链路、承载什么协议、可能哪里堵。
- FlowView 报告是后续智能化接入的自然材料：它比截图更适合作为上下文输入，也能被版本化审计。
- 图谱节点不宜承担编辑入口；它更适合作为浏览、跳转和解释层，编辑仍放在网络地图表格里。

### 下一轮

P13 的 MVP 闭环已经完成。建议下一阶段进入 P14 或回补 P10/P11 深化：

1. 语义 Diff 纳入网络事实层，识别节点、链路、协议绑定和 FlowView 的变化。
2. 文档生成器把网络报告和协议文档组合成项目架构报告。
3. 引入真实运行采样接口之前，先定义性能指标契约：吞吐、延迟、丢包、队列深度、CPU/GPU、磁盘 IO。

## 2026-07-03 Loop 2：关系图谱接入网络数据流

### 目标

修复 P13 Loop 1 后暴露出的模型断层：网络地图已经采用“实体节点 + 链路 + 协议绑定 + FlowView”，但关系图谱的数据流模式仍然展示旧的协议类型 producer / consumer 标签。

本轮目标是让关系图谱的数据流模式读取网络事实，并按 FlowView 展示节点、协议载荷和协议类型关系。

### 基线状态

- 当前提交：`954eed5 feat: add network flow views`。
- P13 Loop 1 已完成 FlowView CRUD、派生视图和示例网络配置。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件：
  - `examples/radar-workspace/headers/common/geometry.hpp`
  - `examples/radar-workspace/headers/common/time.hpp`
  - `examples/radar-workspace/headers/diagnostics/faults.hpp`
  - `examples/radar-workspace/headers/telemetry/status.hpp`
  - `examples/radar-workspace/headers/common/.time.hpp.29896.1783053185857.tmp`
- 这些 Header 改动不归本轮处理，未纳入提交范围。

### 行动

- 扩展关系图谱节点类型：
  - `network-node`
  - `protocol-binding`
- 修改数据流模式构图规则：
  - 有网络协议绑定时：展示 `NetworkNode → ProtocolBinding → Protocol Type → NetworkNode`。
  - 无网络协议绑定时：回退旧 `producer → type → consumer` 标签模型。
- 图谱顶部增加 FlowView 选择器。
- 图例和节点索引改为实体节点 / 协议载荷语义。
- 协议载荷节点双击打开绑定的协议类型。
- 实体节点双击切换到网络地图。
- 增强图谱搜索文本，支持网络节点、子系统、协议绑定、业务数据名和协议名。
- 为协议绑定表单的“峰值系数”增加 tooltip 和说明。
- E2E 从旧 producer/consumer 断言改为 network-node / protocol-binding 断言。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm --filter @protovault/contracts test
pnpm test:e2e
pnpm agent:loop
pnpm release:check
```

结果通过：

- contracts：2 个测试文件、6 个测试通过。
- desktop typecheck：通过。
- desktop：3 个测试文件、20 个测试通过。
- Electron E2E：1 个测试通过。
- C++ core：CMake configure/build 通过，CTest `core-self-test` 通过。

### 收获

- “数据流”在关系图谱中应表达系统事实，不应再以协议类型上的 producer / consumer 标签为主。
- FlowView 适合作为图谱过滤器，而不是独立图谱类型。
- 图谱中引入协议载荷节点后，能够在视觉上表达“一条链路上承载多个协议”的情况，比直接把协议画成边更可扩展。

### 下一轮

建议进入 P13 Loop 3：

1. 右侧 Inspector 支持网络图谱上下文：选中实体节点/协议载荷时显示节点画像、链路、吞吐和风险。
2. FlowView Markdown 报告生成。
3. 基于节点硬件/软件画像的瓶颈解释。

## 2026-07-03 Loop 1：P13 FlowView 与示例网络

### 目标

推进 P13 的第一轮落地：让协议网络地图不只维护事实层，还能保存业务数据流观察视角，并从节点、链路和协议绑定中派生基础分析结果。

同时补一套可直接打开查看的示例网络编辑效果。

### 基线状态

- 当前提交：`1bdad87 docs: add agent loop workflow`。
- P12 协议网络地图事实层已完成。
- P13 原状态为“设计收束，待实现”。
- 本轮开始时仍存在未归属示例 Header 改动和一个 `.tmp` 文件：
  - `examples/radar-workspace/headers/common/geometry.hpp`
  - `examples/radar-workspace/headers/common/time.hpp`
  - `examples/radar-workspace/headers/diagnostics/faults.hpp`
  - `examples/radar-workspace/headers/telemetry/status.hpp`
  - `examples/radar-workspace/headers/common/.time.hpp.29896.1783053185857.tmp`
- 这些 Header 改动不归本轮处理，未纳入提交范围。

### 行动

- 新增 FlowView CRUD：
  - `createNetworkFlowView`
  - `updateNetworkFlowView`
  - `deleteNetworkFlowView`
- 补齐 shared 类型、main IPC、preload API 和后端单元测试。
- 网络地图 UI 新增“数据流视图”tab：
  - 默认派生视图：全量网络、关键与高风险。
  - 手动 FlowView 创建、编辑、删除。
  - 基于过滤条件派生节点、链路、协议绑定、吞吐、最高链路、最高节点和风险提示。
- 新增 `examples/.protocol/network/network.json`，为默认示例入口提供网络演示数据。
- `.gitignore` 精确放行示例 network.json，继续忽略其他 `.protocol` 运行产物。
- E2E 增加 FlowView 创建和派生结果展示验证。

### 验证

已运行：

```powershell
pnpm --filter @protovault/desktop typecheck
pnpm --filter @protovault/desktop test
pnpm agent:loop
pnpm test:e2e
pnpm agent:loop
pnpm release:check
```

结果通过：

- contracts：2 个测试文件、6 个测试通过。
- desktop typecheck：通过。
- desktop：3 个测试文件、20 个测试通过。
- Electron E2E：1 个测试通过。
- C++ core：CMake configure/build 通过，CTest `core-self-test` 通过。

中途发现并修复：

- 首次 E2E 中 `全量网络` 同时匹配左侧按钮和右侧标题，触发 Playwright strict mode。
- 修复方式：断言改为 `heading: 全量网络`。

### 收获

- FlowView 作为“观察视角”是合适的：它只保存过滤条件和说明，不复制事实层数据，也不保存派生统计。
- 当前过滤语法宜保持轻量；正式查询语言应等用户实际使用后再设计。
- 示例网络配置必须放在 `examples/.protocol/network/network.json`，因为桌面端默认“加载示例项目”打开的是 `examples` 根目录。

### 下一轮

建议进入 P13 Loop 2：

1. 节点画像驱动的瓶颈提示：把硬件画像、软件画像、链路带宽、协议吞吐组合成更具体的风险解释。
2. FlowView 报告生成：把当前视图导出为 Markdown，包含节点、链路、协议绑定、吞吐和风险摘要。
3. 网络派生视图和右侧 Inspector 联动：选择 FlowView 后右侧展示该视图的上下文，而不是全局网络摘要。

## 2026-07-03 Loop 0：建立本地循环工作法

### 目标

调研 LoopAgent / loop engineering 的核心方法，并把它转化为 ProtoVault 可本地执行、可审计、可恢复的开发循环。

本轮不新增产品 UI 功能，重点是建立后续长任务推进的流程基础。

### 基线状态

- 当前阶段：P12 协议网络地图 MVP 已完成，P13 网络派生分析待实现。
- 当前项目已有完整发布门：`pnpm release:check`。
- 本轮开始时存在未归属的示例 Header 改动：
  - `examples/radar-workspace/headers/common/geometry.hpp`
  - `examples/radar-workspace/headers/common/time.hpp`
  - `examples/radar-workspace/headers/diagnostics/faults.hpp`
  - `examples/radar-workspace/headers/telemetry/status.hpp`
  - `examples/radar-workspace/headers/common/.time.hpp.29896.1783053185857.tmp`
- 这些文件不归本轮处理，不应提交。

### 行动

- 新增 `doc/Agent循环迭代方法.md`，定义 ProtoVault 的循环开发方法。
- 新增 `scripts/agent-loop.ps1`，提供状态检查、轻量检查和发布门检查入口。
- 在 `package.json` 增加：
  - `agent:loop:status`
  - `agent:loop`
  - `agent:loop:release`
- 更新 `doc/Agent开发计划.md`，把循环方法纳入阶段推进规则。
- 更新 `doc/开发更新日志.md`，记录本轮方法论接入。

### 验证

已运行：

```powershell
pnpm agent:loop
```

结果通过：

- `pnpm --filter @protovault/contracts test`：2 个测试文件、6 个测试通过。
- `pnpm --filter @protovault/desktop typecheck`：通过。
- `pnpm --filter @protovault/desktop test`：3 个测试文件、20 个测试通过。

脚本首次运行后发现中文路径输出被 Git 转义，随后改为 `git -c core.quotepath=false status --short` 并再次运行通过。

### 收获

- ProtoVault 已经具备长循环推进的基础设施：阶段计划、更新日志、Git 提交和发布门。
- 当前最大流程风险不是“Agent 不够自动”，而是“长任务中状态边界不清”，尤其是示例工作区里的手工试验改动。
- 后续 P13 应按小循环推进，不宜一次性把 FlowView、瓶颈分析和报告生成混在一个巨大提交里。

### 下一轮

建议进入 P13 Loop 1：实现 FlowView 的持久化、过滤和基础派生视图。
