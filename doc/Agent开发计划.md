# ProtoVault Agent 开发计划

本项目按阶段验收门推进，不绑定日期。主 Agent 必须先完成当前阶段测试与交付记录，再进入依赖阶段。

| 阶段 | 状态 | 交付物 | 验收门 |
|---|---|---|---|
| P0 工程初始化 | 已完成 | pnpm monorepo、Electron/React、CMake、CI | 桌面端与 C++ 核心可构建、测试可运行 |
| P1 领域模型与契约 | MVP 收束完成 | IR Schema、版本、错误与 API 请求模型、桌面 WorkspaceView 契约校验 | TS 契约与桌面扫描出口校验通过；C++ Schema 往返仍待服务深化 |
| P2 工作区管理 | MVP 完成 | 任意目录打开、多级 Header/空目录发现、`.protocol/workspace.json` 目录记录、Header 文件监听 | fixture 父目录可打开；外部 Header 修改会触发冲突提示 |
| P3 Header 解析 | 基础完成 | Clang AST 扫描、类型/字段/枚举、include 归属修正与诊断 | 示例 fixture 通过；复杂宏/模板仍排除 |
| P4 ABI 布局 | 已完成 MVP | size、offset、alignment、padding、pack、enum underlying type | 与编译器 `sizeof/offsetof` 基准一致 |
| P5 工作台 UI | 基础纵切完成 | Obsidian 风格合并树、字段、源码、属性、问题面板、三栏拖拽和主题变量兼容 | 示例工作区浏览定位 E2E 已通过 |
| P6 编辑与生成 | MVP 纵切完成 | 新建 Header、创建 struct/enum、字段/枚举项 CRUD、受控 Header 片段生成、写后重扫 | 基础写入、确定性片段生成和 E2E 通过；完整 IR→Header 生成器仍待深化 |
| P7 双向同步 | MVP 纵切完成 | Header 内容 hash、保存前冲突保护、保存后重扫、外部修改提示面板 | 源码编辑不会静默覆盖外部修改；外部修改可重新扫描或查看 Diff |
| P8 元数据与文档 | MVP 纵切完成 | 元数据持久化、Header 注释同步、Markdown 文档生成 | 重扫不丢元数据；文档写入 `.protocol/reports/` |
| P9 协议 Lint | MVP 纵切完成 | 规则引擎、严重等级、源码定位 | 指针/运行期类型、缺失语义、布局问题、枚举问题有测试 |
| P10 语义 Diff | MVP 纵切完成 | 快照、字段/枚举/布局变化、兼容性分级 | fixture 可识别新增、类型变化、offset/size 等变化 |
| P11 集成发布 | 发布门 MVP 完成 | E2E、发布检查脚本、发布检查清单和用户说明入口 | `pnpm release:check` 定义完整检查；正式安装包仍待接入 |
| P12 协议网络地图 | 设计收束，待实现 | `.protocol/network`、NetworkNode、NetworkLink、ProtocolBinding、节点/链路/绑定表格、拓扑预览 | 用户可维护实体节点、通信链路和链路上的协议绑定；协议不再直接持有生产者/消费者 |
| P13 网络派生分析 | 设计收束，待实现 | FlowView、链路数据量估算、节点收发汇总、关键链路/瓶颈视图、影响分析报告 | 可从节点、链路和协议绑定派生业务数据流视图，并定位高频、大包和节点瓶颈 |

## 当前技术约束

- Windows 优先。
- 当前机器已安装 Visual Studio 2022 Build Tools（MSVC 19.44）和 LLVM/Clang 22.1.8。
- 机器存在遗留 VS2015 环境变量，项目通过 `scripts/core.ps1` 在 CMake 调用前隔离该污染。
- Header 解析使用 Clang AST；正则仅用于提取 include 展示信息，不作为类型解析替代。
- 双向同步采用保存时解析和显式冲突处理。
- IR 合约版本从 `1.0.0` 开始。
- 协议网络地图采用“节点和链路是主事实，协议绑定是链路载荷，数据流是派生视图”的建模方式，避免把生产者/消费者直接写回协议类型。

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

## 下一阶段执行顺序

P12 先做事实层，不急于做复杂图上编辑：

1. 定义 `NetworkNode`、`NetworkLink`、`ProtocolBinding`、`FlowView` 契约和示例数据。
2. 新增 `.protocol/network` 持久化读写，所有写入使用临时文件加原子替换。
3. 在左侧工作栏增加“网络地图”模式，中间以表格编辑节点、链路和协议绑定。
4. 协议绑定类型选择复用当前工作区扫描到的 struct/enum，并读取布局大小作为载荷大小来源。
5. 增加只读拓扑预览，支持双击跳转到节点表、链路表、协议类型标签和左侧协议树。
6. 加入基础链路数据量估算：载荷大小、频率、批量大小、峰值系数和链路总量。
7. 在 P12 验收通过后，再进入 P13 的业务 FlowView、瓶颈视图和 AI 总结。
