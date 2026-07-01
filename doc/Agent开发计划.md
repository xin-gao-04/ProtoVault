# ProtoVault Agent 开发计划

本项目按阶段验收门推进，不绑定日期。主 Agent 必须先完成当前阶段测试与交付记录，再进入依赖阶段。

| 阶段 | 状态 | 交付物 | 验收门 |
|---|---|---|---|
| P0 工程初始化 | 已完成 | pnpm monorepo、Electron/React、CMake、CI | 桌面端与 C++ 核心可构建、测试可运行 |
| P1 领域模型与契约 | 基础完成 | IR Schema、版本、错误与 API 请求模型 | TS 契约与桌面接口通过；C++ Schema 往返仍待服务深化 |
| P2 工作区管理 | 基础完成 | 任意目录打开、多级 Header/空目录发现、`.protocol/workspace.json` 目录记录 | `examples` 父目录可打开；文件监听仍待深化 |
| P3 Header 解析 | 基础完成 | Clang AST 扫描、类型/字段/枚举、include 归属修正与诊断 | 示例 fixture 通过；复杂宏/模板仍排除 |
| P4 ABI 布局 | 已完成 MVP | size、offset、alignment、padding、pack、enum underlying type | 与编译器 `sizeof/offsetof` 基准一致 |
| P5 工作台 UI | 基础纵切完成 | Obsidian 风格合并树、字段、源码、属性、问题面板、三栏拖拽和主题变量兼容 | 示例工作区浏览定位 E2E 已通过 |
| P6 编辑与生成 | 第一纵切进行中 | 新建 Header、创建 struct、追加字段、写后重扫 | 基础写入测试通过；确定性生成器待实现 |
| P7 双向同步 | MVP 纵切完成 | Header 内容 hash、保存前冲突保护、保存后重扫 | 源码编辑不会静默覆盖外部修改；冲突面板仍待完善 |
| P8 元数据与文档 | MVP 纵切完成 | 元数据持久化、Header 注释同步、Markdown 文档生成 | 重扫不丢元数据；文档写入 `.protocol/reports/` |
| P9 协议 Lint | MVP 纵切完成 | 规则引擎、严重等级、源码定位 | 指针/运行期类型、缺失语义、布局问题、枚举问题有测试 |
| P10 语义 Diff | MVP 纵切完成 | 快照、字段/枚举/布局变化、兼容性分级 | fixture 可识别新增、类型变化、offset/size 等变化 |
| P11 集成发布 | 待开始 | E2E、安装包和用户说明 | 核心闭环通过 |

## 当前技术约束

- Windows 优先。
- 当前机器已安装 Visual Studio 2022 Build Tools（MSVC 19.44）和 LLVM/Clang 22.1.8。
- 机器存在遗留 VS2015 环境变量，项目通过 `scripts/core.ps1` 在 CMake 调用前隔离该污染。
- Header 解析使用 Clang AST；正则仅用于提取 include 展示信息，不作为类型解析替代。
- 双向同步采用保存时解析和显式冲突处理。
- IR 合约版本从 `1.0.0` 开始。

## 当前可运行里程碑

桌面端可以打开任意文件夹工作区，也可以一键加载 `examples` 父目录。当前已实现并验证：

- 递归发现 `.h/.hh/.hpp/.hxx`。
- 保留空目录，并写入 `.protocol/workspace.json` 目录记录。
- 使用 Clang JSON AST 提取 namespace、struct、enum、字段、定长数组与源码位置。
- 修正 include 声明归属，避免 `geometry.hpp` 类型错误挂到 `track.hpp`。
- 显示 Header 源码与 include 数量。
- 在协议树中切换 struct/enum，并显示字段或枚举值。
- 显示扫描诊断，并支持重新扫描示例。
- 顶部操作支持新建 Header、创建 struct、给选中 struct 追加字段。
- 兼容 Obsidian CSS variables，并可接入本地 Tokyo Night 主题。
- Playwright 启动真实 Electron 完成加载、Header/Struct/Enum 切换测试。
