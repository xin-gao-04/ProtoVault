# ProtoVault Agent 循环运行记录

本文档记录采用 LoopAgent / loop engineering 思路后的实际运行轨迹。它不是普通更新日志，而是每轮长循环的“状态快照 + 验收记录 + 下一轮入口”。

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
