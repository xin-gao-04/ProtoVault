# ProtoVault Agent 开发计划

本项目按阶段验收门推进，不绑定日期。主 Agent 必须先完成当前阶段测试与交付记录，再进入依赖阶段。

## Agent 循环执行规则

从 P13 开始，较长工作采用 LoopAgent / loop engineering 式的小循环推进。每轮循环必须有明确目标、基线状态、验收门、运行记录和 Git 断点。

每轮默认流程：

```text
选择一个阶段内目标
→ 记录当前工作区状态
→ 实现或设计收束
→ 运行轻量门或发布门
→ 更新开发日志和循环运行记录
→ 独立提交
→ 写明下一轮入口
```

本地入口：

- `pnpm agent:loop:status`：查看 Git 状态和安全警告。
- `pnpm agent:loop`：运行轻量检查。
- `pnpm agent:loop:release`：运行完整发布门。
- `pnpm agent:p14:status`：查看 Git 基线改造的状态、安全警告和旧快照残留扫描。
- `pnpm agent:p14`：运行 P14 快速循环检查。
- `pnpm agent:p14:release`：运行 P14 完整发布门。

长循环不能自动扩大授权边界。未归属脏文件、示例工作区手工试验文件和临时文件默认保留但不提交。

| 阶段 | 状态 | 交付物 | 验收门 |
|---|---|---|---|
| P0 工程初始化 | 已完成 | pnpm monorepo、Electron/React、CMake、CI | 桌面端与 C++ 核心可构建、测试可运行 |
| P1 领域模型与契约 | MVP 契约基线完成 / 待收敛 | IR Schema、版本、错误与 API 请求模型、桌面 WorkspaceView 契约校验 | TS 契约与桌面扫描出口校验通过；Canonical IR 与运行态 WorkspaceView 仍是两套模型，C++ 往返未进入主链路 |
| P2 工作区管理 | MVP 完成 / 增量索引待实现 | 任意目录打开、多级 Header/空目录发现、`.protocol/workspace.json` 目录记录、Header 文件监听 | fixture 父目录可打开；外部 Header 修改会触发冲突提示；SQLite 持久索引尚未实现 |
| P3 Header 解析 | MVP 基础完成 / Worker 化待实现 | Clang AST 扫描、类型/字段/枚举、include 归属修正、诊断和进程内依赖缓存 | 示例 fixture 通过；复杂宏/模板仍排除；持久缓存、取消和崩溃隔离待实现 |
| P4 ABI 布局 | 已完成 MVP | size、offset、alignment、padding、pack、enum underlying type | 与编译器 `sizeof/offsetof` 基准一致 |
| P5 工作台 UI | 基础纵切完成 | Obsidian 风格合并树、字段、源码、属性、问题面板、三栏拖拽和主题变量兼容 | 示例工作区浏览定位 E2E 已通过 |
| P6 编辑与生成 | MVP 纵切完成 | 新建 Header、创建 struct/enum、字段/枚举项 CRUD、受控 Header 片段生成、写后重扫 | 基础写入、确定性片段生成和 E2E 通过；完整 IR→Header 生成器仍待深化 |
| P7 双向同步 | MVP 纵切完成 / 冲突中心待深化 | Header 内容 hash、保存前冲突保护、保存后重扫、外部修改提示、会话内最后有效 IR | 源码编辑不会静默覆盖外部修改；持久最后有效 IR 和 Disk/Base/Draft 三方合并待实现 |
| P8 元数据与文档 | MVP 纵切完成 | 元数据持久化、Header 注释同步、Markdown 文档生成 | 重扫不丢元数据；文档写入 `.protocol/reports/` |
| P9 协议 Lint | MVP 纵切完成 | 规则引擎、严重等级、源码定位 | 指针/运行期类型、缺失语义、布局问题、枚举问题有测试 |
| P10 语义 Diff | MVP 纵切完成 / 稳定身份待实现 | 基线状态比较、字段/枚举/布局变化、兼容性分级 | fixture 可识别新增、类型变化、offset/size；当前名称哈希 ID 会使改名退化为删除+新增 |
| P11 集成发布 | 初始 Release 完成 | E2E、发布检查脚本、发布检查清单、Windows NSIS 安装包与 Portable 包 | `pnpm release:check` 通过；`pnpm release:installer` 可生成 `ProtoVault-0.1.0` 分发包 |
| P12 协议网络地图 | MVP 纵切完成 | `.protocol/network`、NetworkNode、NetworkLink、ProtocolBinding、节点/链路/绑定表格 | 用户可维护实体节点、通信链路和链路上的协议绑定；协议不再直接持有生产者/消费者 |
| P13 网络派生分析 | Loop 6 / MVP 闭环完成 | FlowView CRUD、过滤派生视图、数据流画布、网络 Inspector、FlowView Markdown 报告、节点/链路/协议瓶颈提示、示例网络配置 | 可保存业务数据流观察视角，先定义视角再进入画布查看生产节点、链路载荷和消费节点，并可生成网络数据流报告；真实运行采样待后续阶段 |
| P14 Git 版本治理 | MVP 纵切完成 | Git 状态、分支/Tag 展示、协议 Baseline Tag、版本 Diff、P14 loop 脚本 | 基线创建要求工作区干净；版本 Diff 可对比 Git Tag 与当前工作树；旧快照入口退出 UI；发布门通过 |
| P15 本地 AI 使用助手 | MVP 纵切完成 | AI 可读功能知识库、模块检索、Ollama status/ask API、AI 使用助手视图、模型切换、轻量模型默认、离线降级 | 不注入全量手册；按问题选择少量模块；Ollama 可用时可选择本地模型，不可用时返回离线知识库摘要 |
| P16 Git Source Control | MVP 纵切完成 | 左侧 Source Control、暂存/取消暂存、提交、分支切换/创建、Git Inspector、Working Tree/Index/Commit 文件级 Diff tab、可展开提交 Graph、与基线 Tag/Diff 联动 | 可在前端完成本地 Git 提交流程；点击当前变更或历史提交文件子节点在中间打开对比；提交只允许当前工作区范围内暂存项；push/pull/放弃更改延后 |
| P17 稳定性与分发 | 初始完成 | 文件/进程场景测试、真实大目录 AST 流式输出、随包 Git/Clang、Setup/Portable | Desktop 35 个单测、Contracts 4 个测试、Electron E2E 3 个测试通过；正式签名和升级通道待实现 |
| P18 核心架构硬化 | 待启动 | Canonical IR 收敛、稳定 ID、SQLite 增量索引、Parser Worker、前端模块化、冲突中心 | 见 `产品审核与架构升级建议_2026-07-10.md` 的 P18 Loop 计划 |

## 当前技术约束

- Windows 优先。
- 当前机器已安装 Visual Studio 2022 Build Tools（MSVC 19.44）和 LLVM/Clang 22.1.8。
- 机器存在遗留 VS2015 环境变量，项目通过 `scripts/core.ps1` 在 CMake 调用前隔离该污染。
- Header 解析使用 Clang AST；正则仅用于提取 include 展示信息，不作为类型解析替代。
- 双向同步采用保存时解析和显式冲突处理。
- IR 合约版本从 `1.0.0` 开始。
- 协议网络地图采用“节点和链路是主事实，协议绑定是链路载荷，数据流是派生视图”的建模方式，避免把生产者/消费者直接写回协议类型。
- 协议版本治理采用 Git 分支与 Tag 作为主线：分支表达实验/发布线路，Tag 表达可追溯协议基线；旧 `.protocol/snapshots` 不再作为 UI 工作流入口。
- 初始 Windows Release 使用 electron-builder 生成 NSIS 安装包和 Portable 包；正式品牌图标、签名证书和自动更新通道仍待后续发布工程补齐。

## 当前可运行里程碑

桌面端可以打开任意文件夹工作区，也可以一键加载 `examples` 父目录。自动化测试使用独立 `fixtures`，避免演示目录的手工试验污染基线。当前已实现并验证：

- 递归发现 `.h/.hh/.hpp/.hxx`。
- 保留空目录，并写入 `.protocol/workspace.json` 目录记录。
- 使用 Clang JSON AST 提取 namespace、struct、enum、字段、定长数组与源码位置。
- 修正 include 声明归属，避免 `geometry.hpp` 类型错误挂到 `track.hpp`。
- 显示 Header 源码与 include 数量。
- 在协议树中切换 struct/enum，并显示字段或枚举值。
- 显示扫描诊断，并支持重新扫描示例。
- 顶部操作支持新建 Header、创建 struct、给选中 struct 追加字段。
- Header 文件外部修改会触发冲突提示，可重新扫描或查看 Diff。
- 兼容 Obsidian CSS variables，并可接入本地 Tokyo Night 主题。
- Playwright 启动真实 Electron 完成加载、Header/Struct/Enum 切换测试。
- 协议网络地图可维护节点、链路和协议绑定；绑定可链接当前工作区协议类型，并派生 payload size、链路带宽和节点收发数据量。
- 数据流视角可维护 FlowView，按关键词过滤网络事实，并派生视角内节点、链路、协议绑定、吞吐和风险提示。
- 网络地图提供“数据流画布”，以生产节点 → 链路 / 协议载荷 → 消费节点的分层方式展示数据流，线宽表达带宽，流光表达方向。
- 协议关系图谱收敛为 Header / Struct / Enum 的包含与引用依赖图，不再展示网络数据链路传导。
- 数据流视角位于数据流画布之前，负责定义业务观察范围；数据流画布负责展示生产节点、链路载荷和消费节点。
- 图谱右侧 Inspector 可展示网络节点和协议载荷上下文，包括节点画像、链路方向、吞吐、链路约束和瓶颈提示。
- 网络数据流视角可导出 Markdown 报告到 `.protocol/reports/network-flow-*.md`。
- 默认示例入口 `examples` 已包含一套雷达仿真网络配置，可直接展示网络地图和数据流视角效果。
- 工作区底栏展示 Git 分支、最近 Tag 和脏状态；顶部工具栏提供“基线 Tag”和“版本 Diff”，版本报告写入 `.protocol/baselines/working-tree.json`。
- 左侧工作栏提供“源代码管理 / Git”视图，切换后左侧 Navigator 变为 Source Control：支持暂存、取消暂存、提交暂存更改、切换本地分支、新建并切换分支，并提供基线 Tag / 版本 Diff 快捷入口；变更文件在中间以 Diff tab 打开，左侧下方显示可展开提交 Graph，历史提交文件子节点可打开 Commit Diff。
- “AI 使用助手”替代静态帮助页，使用模块化知识库和本地 Ollama 模型回答操作问题；当前本机可用模型为 `qwen2.5:3b` 和 `qwen3-coder:30b`，默认优先使用轻量模型。
- 发布工程已接入 `electron-builder`，可通过 `pnpm release:installer` 生成 `apps/desktop/release/ProtoVault-0.1.0-Setup-x64.exe` 和 `ProtoVault-0.1.0-Portable-x64.exe`。
- Header 扫描针对大目录减少无效遍历：默认跳过 `.git`、`.protocol`、`node_modules`、`dist/out/build*`、测试输出等生成目录，并在界面显示当前扫描阶段、处理数量和文件名。

## 下一阶段执行顺序

P12 已完成基础事实层：

1. 已定义 `NetworkNode`、`NetworkLink`、`ProtocolBinding`、`FlowView` 契约。
2. 已新增 `.protocol/network` 持久化读写，写入使用临时文件加原子替换。
3. 已在左侧工作栏增加“网络地图”模式，中间以表格编辑节点、链路和协议绑定。
4. 已支持协议绑定选择当前工作区扫描到的 struct/enum，并读取布局大小作为载荷大小来源。
5. 已取消拓扑预览入口，避免和数据流画布重复表达链路传导。
6. 已加入基础链路数据量估算：载荷大小、频率、批量大小、峰值系数和链路总量。

P13 Loop 1 已完成：

1. FlowView 业务视图的保存、过滤和派生规则。
2. 视图内节点、链路、协议绑定、吞吐和基础风险提示。
3. 示例网络配置与 E2E 验证。

P13 Loop 2 已完成后已被 Loop 6 收敛：

1. 关系图谱不再承担数据流展示，只保留协议依赖分析。
2. FlowView 作为数据流画布的前置视角管理入口。
3. 数据流画布展示实体节点、协议载荷和消费节点关系。
4. 峰值系数、延迟预算等链路字段已写入手册说明。

P13 Loop 3-5 已完成：

1. 右侧 Inspector 支持网络图谱上下文。
2. 节点画像驱动的基础瓶颈提示。
3. FlowView Markdown 报告生成。
4. 图谱单击查看上下文、双击跳转。
5. 发布门验证通过。

P14 已完成执行结果：

1. Loop 0：已设计 Baseline/Tag 替代 Snapshot 的术语、计划和验收门。
2. Loop 1：已完成 Git/Baseline 契约和 IPC/preload API。
3. Loop 2：已实现 Git CLI 服务、基线写入、Tag 创建和版本 Diff。
4. Loop 3：已替换 UI 入口，显示分支/tag/脏状态，退出旧快照工作流。
5. Loop 4：已新增 P14 loop 脚本和自动化测试。
6. Loop 5：已运行发布门、review 并更新日志。

后续建议：

1. 将 AI 知识库从静态模块升级为可更新索引，支持按版本/界面区域增量维护。
2. 将协议文档和网络数据流报告组合为项目架构报告。
3. 定义真实运行采样契约：吞吐、延迟、丢包、队列深度、CPU/GPU、磁盘 IO。
4. 在网络地图中继续打磨表格批量编辑和导入/导出能力。
5. 为 Git 分支/tag 增加更强业务引导，例如“实验分支、评审 Tag、发布 Tag、兼容性报告”的项目模板。
6. 为 Release 增加正式应用图标、签名证书、自动更新和 GitHub Release 附件上传流程。

## 2026-07-10 审核后的执行收敛

此前计划以功能纵切为主，P12-P17 已使产品具备较完整的演示和本地使用能力。审核确认下一阶段不能继续按功能数量衡量完成度，必须优先补足底层可信度。

P18 默认按以下顺序推进：

1. 用 ADR 固定 Canonical IR 与运行投影的边界。
2. 建立持久稳定 ID，先解决类型和字段改名的身份延续。
3. 建立 SQLite 增量索引和重启可复用的 Header IR cache。
4. 将 Clang 解析放入可取消、可超时、可崩溃恢复的 Parser Worker。
5. 拆分 `renderer/src/main.tsx` 和 `main/workspace.ts`，按领域和视图建立模块边界。
6. 完成 Disk/Base/Draft 三方冲突中心。
7. 再进入远端 Git、多协议包合成和发布工程深化。

详细差距、架构方案和性能预算见 `doc/产品审核与架构升级建议_2026-07-10.md`。
