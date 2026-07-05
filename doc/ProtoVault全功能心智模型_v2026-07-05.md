# ProtoVault 全功能心智模型 v2026-07-05：协议资产工作台的“事实层—操作层—治理层”

一句话心智模型：ProtoVault 不是 Header 编辑器，而是把 C++ Header 中的数据结构、系统节点链路、协议版本和本地 AI 问答统一进一个桌面工作台；用户编辑的是可验证的协议资产，工具负责把它安全同步回源码、文档、报告和 Git 历史。

读者定位：

- 用户：需要打开工程、理解协议、编辑字段、检查布局、生成文档、维护网络数据流和版本基线。
- 开发者 / Agent：需要理解当前实现边界、操作入口、数据模型、写盘保护和后续迭代方向。
- 本地 AI 助手：需要按模块检索操作细节，而不是一次吞下所有上下文。

地图位置：

```text
初版设计思路
  → Agent 开发计划
  → 开发更新日志
  → ProtoVault 使用手册 / AI 功能知识库
  → 本文：全功能心智模型与操作留存版
```

本文是“留存版”。它把当前产品的原理、操作路径、关键对象、风险边界和验证方式汇总为一份可持续更新的版本文档。

## 目录

1. 统一框架：三层事实与三类操作
2. 系统架构：Electron 工作台、本地主进程与协议扫描
3. 工作区：打开目录、扫描、目录记录和恢复
4. 协议 IR：Header、Struct、Enum、Field 与稳定对象
5. 左侧协议树：真实文件结构、搜索、右键菜单和定位
6. Tab 工作流：预览、固定、脏状态、保存和导航历史
7. 结构化编辑：字段、枚举、注释、初始化值和删除
8. Header 源码同步：双向注释、冲突保护和错误修复通道
9. 内存布局、Lint 和文档报告
10. 协议关系图谱：只读影响分析与跳转
11. 网络地图：实体节点、通信链路、协议绑定和 FlowView
12. 数据流画布：从网络事实派生业务视角
13. Git 源代码管理、基线 Tag 和版本 Diff
14. 本地 AI 使用助手与 Ollama 模型切换
15. 主题、布局和 Obsidian 兼容
16. 持久化文件、API 与安全写入规则
17. 常见误区与纠正
18. 标准操作流程与检查清单
19. 当前限制与下一步优化机会
20. 自测问题

## 1. 统一框架：三层事实与三类操作

ProtoVault 当前最重要的设计收敛，是把“协议是什么”和“协议在系统中怎么流动”拆开。

```text
协议结构事实
  Header / Namespace / Struct / Enum / Field / TypeRef / MemoryLayout / Diagnostic

网络系统事实
  NetworkNode / NetworkLink / ProtocolBinding / Node Profile / Link Budget

观察与治理事实
  FlowView / Graph Focus / Lint Report / Markdown Report / Git Baseline / Version Diff / AI Answer
```

### 1.1 为什么要分层

如果把生产者、消费者、通信频率都直接写在 Struct 上，短期看起来简单，长期会混乱：

- 一个协议可能在多条链路上传输。
- 一条链路可能同时传输多个协议。
- 一次大型仿真包含很多业务数据流，但共享同一张节点和链路网络。
- 协议结构变更和系统部署变更不是同一类事实。

因此当前版本采用：

```text
Struct / Enum 说明数据格式。
NetworkNode 说明系统实体。
NetworkLink 说明节点之间如何通信。
ProtocolBinding 说明某个协议作为载荷走哪条链路。
FlowView 说明用户当前想观察哪一组事实。
```

### 1.2 三类主要操作

| 操作类型 | 用户目的 | 主界面位置 | 写入对象 |
|---|---|---|---|
| 协议结构编辑 | 改字段、枚举、注释、初始化值 | 中间表格 / Header 源码 tab | Header 源文件与 `.protocol/meta` |
| 网络事实编辑 | 改节点、链路、协议绑定、FlowView | 网络地图中间表格 | `.protocol/network/network.json` |
| 版本与治理 | 提交、Tag、Diff、文档、Lint | 左侧 Source Control / 顶部工具栏 / 报告区 | Git、`.protocol/baselines`、`.protocol/reports` |

设计原则：右侧属性栏主要负责展示和解释；真正的编辑应尽量发生在中间表格或源码 tab，避免用户在多个位置产生互相冲突的编辑入口。

## 2. 系统架构：Electron 工作台、本地主进程与协议扫描

当前实现是 Electron + React + TypeScript 的桌面应用。业务逻辑主要位于 Electron 主进程和共享契约中。

### 2.1 主要代码边界

| 边界 | 代表文件 | 职责 |
|---|---|---|
| Renderer UI | `apps/desktop/src/renderer/src/main.tsx` | 三栏界面、tab、表格、图谱、网络地图、Git UI、AI 助手 |
| Renderer 样式 | `apps/desktop/src/renderer/src/styles.css` | 主题、布局、表格、图谱和 Git Diff 样式 |
| Preload API | `apps/desktop/src/preload/index.ts` | 向前端暴露 `window.protoVault.*` |
| Main Service | `apps/desktop/src/main/workspace.ts` | 扫描、写盘、Git、网络、文档、基线、Diff |
| Main IPC | `apps/desktop/src/main/index.ts` | 绑定 Electron IPC handler |
| Shared Contract | `apps/desktop/src/shared/workspace.ts` | Workspace、Git、Network、Diff、Lint 等类型 |
| Assistant Knowledge | `apps/desktop/src/shared/assistant.ts` | AI 助手模块知识、prompt 拼装和模块选择 |

### 2.2 运行时关系

```text
React Renderer
  → window.protoVault API
  → Electron preload
  → IPC handlers
  → workspace.ts 本地服务
  → 文件系统 / Git CLI / Clang / Ollama
```

当前业务接口不依赖 Electron 语义；Electron 只是本地桌面的传输壳。这个边界保留了后续替换为本地 HTTP 服务或 C++ 服务的空间。

## 3. 工作区：打开目录、扫描、目录记录和恢复

### 3.1 原理

工作区是一个本地文件夹，不是单个 Header 文件。打开工作区后，系统递归扫描目录中的 Header，并保留空目录信息。工作区根目录下的 `.protocol` 保存工具元数据。

推荐结构：

```text
workspace/
  headers/
  .protocol/
    workspace.json
    meta/
    network/
    baselines/
    reports/
    cache/
```

### 3.2 操作路径

| 目标 | 操作 |
|---|---|
| 打开工作区 | 在启动页或左侧底部工作区区域选择打开目录 |
| 加载示例 | 使用示例入口打开 `examples` 或示例 radar workspace |
| 重新扫描 | 使用顶部或工作区相关的刷新 / 扫描操作 |
| 查看扫描进度 | 中间上方扫描条显示阶段与结果 |
| 恢复上次工作区 | 启动时会尝试打开上次记录的工作区 |

### 3.3 扫描阶段

扫描不是一次性黑盒动作，而是分阶段：

```text
discover → read → parse → metadata → done
```

- `discover`：递归发现目录、空目录和 `.h/.hh/.hpp/.hxx`。
- `read`：读取文件内容和 hash。
- `parse`：调用 Clang AST 提取类型、字段、枚举和诊断。
- `metadata`：合并源码注释、`.protocol/meta` 和网络配置。
- `done`：产出 `WorkspaceView`。

### 3.4 关键保护

- 打开的是文件夹，因此必须完整筛选目录下内容，包括空文件夹。
- `.protocol/workspace.json` 记录目录与工作区状态。
- 文件监听关注 Header 外部修改；外部修改会触发冲突提示。
- 保存时检查 content hash，避免覆盖用户在外部编辑器中的修改。

## 4. 协议 IR：Header、Struct、Enum、Field 与稳定对象

### 4.1 当前核心对象

| 对象 | 含义 | 主要用途 |
|---|---|---|
| WorkspaceView | 当前工作区整体视图 | UI 渲染和操作上下文 |
| WorkspaceFileView | Header 文件 | 文件树、源码 tab、include 关系 |
| WorkspaceDirectoryView | 目录 / 空目录 | 真实文件结构展示 |
| WorkspaceTypeView | Struct / Enum | 表格编辑、图谱节点、布局和 Diff |
| WorkspaceFieldView | Struct 字段 | 字段表、注释、初始化值、布局 |
| WorkspaceEnumValueView | Enum 项 | 枚举表、默认值和 Diff |
| WorkspaceMemoryLayoutView | 类型布局 | size、align、padding、字段偏移 |
| WorkspaceDiagnostic | 扫描或语法诊断 | 问题面板、源码错误提示 |

### 4.2 C++ 支持边界

MVP 支持：

- `struct`
- `enum` / `enum class`
- namespace
- 定宽基础类型
- 浮点、布尔和字符
- 定长数组
- 嵌套结构体引用
- 有限 `typedef` / `using`
- `#include`
- 有限 `#pragma pack`

明确不进入结构化可编辑 IR：

- 宏生成结构体
- 复杂条件编译
- 模板
- 继承
- 运行期容器
- 函数和方法

这些内容不能静默忽略，必须生成诊断，并且 Header 源码视图仍要可打开，方便用户修复或手工维护。

## 5. 左侧协议树：真实文件结构、搜索、右键菜单和定位

### 5.1 原理

协议树不是“只展示最后一层 Header”，而是模拟真实文件结构：

```text
workspace root
  headers/
    common/
      time.hpp
        Timestamp
          seconds
          nanoseconds
      geometry.hpp
        Vec3
    radar/
      track.hpp
        RadarTrack
```

Header 节点下展示本文件声明的 Struct / Enum；类型节点下展示字段或枚举项。

### 5.2 顶部工具栏

左侧树顶部工具栏承担“当前协议内容操作”，不是工作区管理：

- 新建 Header。
- 新建 Struct。
- 新建 Enum。
- 添加字段 / 枚举项。
- 搜索。
- 展开 / 收起。

工作区打开、主题、设置等放在左侧底部工作区栏。

### 5.3 搜索行为

搜索应接近 IDE / VS Code 树搜索：

- 搜索框由树顶部工具栏打开。
- 不匹配节点隐藏。
- 匹配节点的父路径自动展开。
- 可搜索 Header、Struct、Enum、字段、枚举项、类型名。

### 5.4 常用交互

| 操作 | 行为 |
|---|---|
| 单击 Header / 类型 | 打开预览 tab，并刷新中间内容 |
| 双击 Header / 类型 | 固定为正式 tab |
| 单击字段 / 枚举项 | 打开对应类型 tab，并选中成员 |
| F2 | 编辑当前选中对象 |
| 右键 Header | 重命名、删除、编辑 include、打开源码 |
| 右键 Struct | 编辑、添加字段、删除 |
| 右键 Enum | 编辑、添加枚举项、删除 |
| 右键 Field | 编辑、删除 |
| 右键 Enum Value | 编辑、删除 |
| Ctrl + 点击表格行 | 定位并滚动到左侧树对应节点 |

### 5.5 易错点

- 左侧树不是主要编辑表格；它负责导航、定位和快捷操作。
- 长树必须自己滚动，不能遮挡底部工作区栏。
- 树图和工作区底栏是两个独立区域，不应共享一个滚动容器。

## 6. Tab 工作流：预览、固定、脏状态、保存和导航历史

### 6.1 原理

Tab 逻辑模仿 Visual Studio 的“预览 tab + 固定 tab”：

- 单击树节点：打开临时预览 tab。
- 双击树节点或进入编辑：固定为正式 tab。
- 这样可以快速浏览，不会打开一堆永久 tab。

### 6.2 Tab 类型

| Tab 类型 | 标记 | 内容 |
|---|---|---|
| Header tab | `H` | Header 源码和 include 摘要 |
| Type tab | `S` / `E` | Struct 字段表或 Enum 枚举表 |
| Git Diff tab | `G` | Working Tree / Index 文件对比 |

### 6.3 Tab 右键菜单

| 操作 | 说明 |
|---|---|
| 打开文件位置 | Header tab 或 Git diff tab 可打开文件所在位置 |
| 关闭 | 关闭当前 tab |
| 关闭其他标签 | 保留当前 tab |
| 关闭左侧标签 | 关闭当前 tab 左侧所有 tab |
| 关闭右侧标签 | 关闭当前 tab 右侧所有 tab |

### 6.4 脏状态

以下内容会让 tab 进入未保存状态：

- Header 源码草稿。
- 字段 / 枚举项结构化编辑草稿。
- 注释修改。
- 初始化值修改。
- 数据流或网络编辑中与当前 tab 相关的草稿。

关闭或切换离开 dirty tab 时必须提示，避免静默丢失。

### 6.5 快捷键

| 快捷键 | 行为 |
|---|---|
| `Ctrl + S` | 保存当前 active tab 的可保存改动 |
| `F2` | 编辑当前选中 Header、类型、字段或枚举项 |
| `Alt + ←` | 返回上一步界面 |
| `Alt + →` | 前进到下一步界面 |

注意：`Alt + ← / →` 是界面导航历史，不是撤销 / 重做编辑。它恢复位置、tab、视图、网络子页和图谱上下文，不主动修改文件。

## 7. 结构化编辑：字段、枚举、注释、初始化值和删除

### 7.1 设计原则

结构化编辑的主场是中间表格，而不是右侧属性栏。右侧展示属性摘要；真正增删改查应在表格、右键菜单和快捷键中完成。

### 7.2 Struct 字段能力

字段支持：

- 新增字段。
- 修改字段名。
- 修改字段类型。
- 修改初始化值。
- 修改字段注释。
- 删除字段。
- 调整字段顺序。
- Ctrl + 点击复杂类型跳转到类型定义。

字段类型选择采用二级策略：

```text
基础类型
  std::uint8_t / std::uint16_t / std::uint32_t / std::uint64_t
  std::int8_t / std::int16_t / std::int32_t / std::int64_t
  float / double / bool / char / std::byte

组合类型
  当前 Header 自身声明的类型
  当前 Header include 可达的 Struct / Enum
  排除自身，避免直接递归
```

手工输入仍允许，但保存时必须检查类型是否在允许范围内。

### 7.3 初始化值

基础数据结构支持初始化值，例如：

```cpp
std::uint32_t id = 0;          // ID
bool enabled = false;          // 是否启用
std::uint8_t payload[8] = {};  // 载荷
```

初始化值必须参与：

- 表格展示。
- 表格编辑。
- Header 回写。
- 重新扫描后的同步。
- 语义 Diff。

### 7.4 字段注释

字段注释当前推荐使用字段源码同行格式：

```cpp
std::uint32_t counter; // 计数器
```

这样比 `/// @brief` 更短，也更适合字段级阅读。结构体和枚举可以继续使用前置 `/// @brief`。

扫描兼容：

- `// xxx`
- `/// xxx`
- `//! xxx`
- `/// @brief xxx`
- `/* xxx */`
- `/** xxx */`
- 多行块注释
- 旧格式 `@protovault-note`

删除源码注释后，重新扫描应清空表格中的注释，不能继续由旧 metadata 覆盖。

### 7.5 Enum 编辑

枚举支持：

- 新增枚举项。
- 修改名称。
- 修改显式值。
- 删除枚举项。
- 注释编辑。

新增枚举项默认值规则：

```text
新值 = 当前 enum 已知最大值 + 1
```

如果用户保存时数值为空，系统也会兜底写入显式数值，避免 C++ 自动推导导致后续 Diff 不稳定。

### 7.6 删除能力

删除入口必须覆盖：

- 表格行右键删除字段。
- 表格行右键删除枚举项。
- 左侧树右键删除字段。
- 左侧树右键删除枚举项。
- 左侧树右键删除 Struct。
- 左侧树右键删除 Enum。
- Header 右键删除文件。

删除前必须确认。删除后重新扫描并刷新树、tab、表格和图谱。

## 8. Header 源码同步：双向注释、冲突保护和错误修复通道

### 8.1 双向同步原则

ProtoVault 同时支持结构化编辑和源码编辑，但不能互相覆盖。

```text
结构化编辑
  → 生成候选 Header
  → Clang 校验
  → 原子写盘
  → 重新扫描

源码编辑
  → Ctrl+S 保存
  → hash 冲突检查
  → Clang 扫描
  → 刷新 IR / 诊断
```

### 8.2 写入前校验

新增字段、修改类型、新增枚举等结构化写入，在真正写盘前要先生成候选 Header 并执行语法校验。

如果校验失败：

- 不写入源文件。
- 显示诊断。
- 保留用户当前编辑上下文。
- 允许用户继续修改，不进入“彻底无法编辑”的死状态。

### 8.3 源码错误修复通道

如果 Header 已经因为外部编辑或历史错误无法解析，系统仍应允许：

- 打开 Header Source tab。
- 查看源码。
- 在出错行显示错误提示 / 波浪线。
- 用户手工修改源码。
- `Ctrl+S` 保存并重新扫描。

这是避免“解析失败 → 结构化视图崩溃 → 用户无法修复”的关键通道。

### 8.4 外部修改冲突

保存时必须比较：

- 打开 / 扫描时的文件 hash。
- 当前磁盘文件 hash。

如果磁盘已被外部修改：

- 禁止静默覆盖。
- 提示用户重新扫描、查看 Diff 或手动合并。

## 9. 内存布局、Lint 和文档报告

### 9.1 布局分析

P4 已完成 MVP：工具展示 C++ ABI 相关布局信息。

| 指标 | 含义 |
|---|---|
| `size` | 类型整体 `sizeof` |
| `alignment` | 对齐要求 |
| `dataSize` | 字段实际数据尺寸 |
| `paddingBytes` | padding 总量 |
| `offset` | 字段偏移 |
| `fieldSize` | 字段大小 |
| `paddingBefore / paddingAfter` | 字段前后 padding |
| `partial` | 布局是否部分解析 |

布局支持：

- 定宽整数。
- 浮点。
- bool / char。
- enum underlying type。
- struct 引用。
- 定长数组。
- 有限 `#pragma pack`。

### 9.2 Lint

Lint 规则分为 error、warning、suggestion。它不是为了阻止一切，而是把协议工程风险提前暴露。

当前关注：

- 指针。
- 运行期容器。
- 非定宽类型。
- 字段语义缺失。
- padding 过多。
- 枚举项问题。
- 不支持语法。
- 布局部分解析。

### 9.3 文档生成

协议文档写入：

```text
.protocol/reports/protocol-documentation.md
```

网络数据流报告写入：

```text
.protocol/reports/network-flow-*.md
```

文档应包含字段、布局、枚举、诊断摘要和网络视角分析，服务评审和交接，而不是只输出 API 列表。

## 10. 协议关系图谱：只读影响分析与跳转

### 10.1 定位

关系图谱的最终定位是 Protocol Impact Graph：协议影响图谱。

它只回答：

1. 当前类型依赖谁。
2. 谁依赖当前类型。
3. 哪些节点存在布局或诊断风险。
4. 如何跳回树、tab 和表格编辑位置。

它不回答：

- 系统链路如何传输数据。
- 哪些节点生产或消费数据。
- 网络拓扑如何编辑。

这些属于网络地图和数据流画布。

### 10.2 节点和边

| 元素 | 当前处理 |
|---|---|
| Header | 弱显示 / 来源解释 |
| Struct | 主节点 |
| Enum | 主节点 |
| Field | 不作为默认节点，作为引用边来源 |
| contains 边 | Header 声明类型 |
| references 边 | Struct 字段引用其他 Struct / Enum |

方向统一：

```text
使用者 → 被引用类型
```

例如：

```cpp
struct RadarTrack {
  Timestamp timestamp;
};
```

图谱关系：

```text
RadarTrack → Timestamp
```

### 10.3 视觉编码

| 视觉 | 含义 |
|---|---|
| 节点大小 | 影响力，主要由引用关系和风险组成 |
| 节点颜色 | Header / Struct / Enum 类别 |
| 外环 | 布局或诊断风险 |
| 角标 | 诊断数量或严重风险 |
| 边颜色 | 依赖方向和聚焦关系 |
| 透明度 | 与当前焦点的相关性 |

注意：普通缺失注释不应显示惊叹号角标；`!` 应留给扫描诊断或 critical 布局风险。

### 10.4 交互

| 操作 | 行为 |
|---|---|
| 单击节点 | 聚焦，右侧 Inspector 展示上下文，并定位树 |
| 双击 Header | 打开 Header tab |
| 双击 Struct / Enum | 打开类型 tab |
| 搜索 | 匹配节点保留 / 高亮，非相关节点弱化 |
| 滚轮 | 平滑缩放 |
| 拖动画布 | 平移 |
| 拖拽节点 | 调整局部布局 |

图谱不做编辑，编辑回到中间表格和源码 tab。

## 11. 网络地图：实体节点、通信链路、协议绑定和 FlowView

### 11.1 原理

网络地图是系统事实层，不是协议图谱的附属模式。

```text
NetworkNode --NetworkLink--> NetworkNode
                       |
                       +-- ProtocolBinding --> Struct / Enum
```

### 11.2 NetworkNode

实体节点表示真实或逻辑系统实体。

字段：

- name。
- kind。
- role。
- subsystem。
- host。
- process。
- hardwareProfile。
- softwareProfile。
- notes。

节点类型包括：

- simulator。
- sensor。
- algorithm。
- visualization。
- recorder。
- gateway。
- hardware。
- service。
- database。
- external。
- manual。

### 11.3 NetworkLink

通信链路表示两个节点之间的传输关系。

字段：

- name。
- fromNodeId。
- toNodeId。
- transport。
- endpoint。
- latencyBudgetMs。
- bandwidthLimitMbps。
- critical。
- notes。

传输类型：

- udp。
- tcp。
- dds。
- shared-memory。
- file。
- mq。
- custom。
- manual。

延迟预算是用户输入的设计约束，不是当前实测值。带宽上限用于把估算吞吐和链路能力做比较。

### 11.4 ProtocolBinding

协议绑定表示某条链路承载某个协议类型。

字段：

- linkId。
- typeId。
- name。
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

峰值系数表示突发放大：

- `1.0`：不放大。
- `2.0`：按平均吞吐 2 倍估算。
- 大于 `2.0`：作为明显突发负载关注。

### 11.5 FlowView

FlowView 是观察层，不是事实层。

字段：

- name。
- filter。
- description。
- source：manual / derived / ai。

它通过过滤条件从节点、链路和协议绑定中提炼一个业务视角，例如“目标跟踪闭环”“遥测链路”“日志回放链路”。

## 12. 数据流画布：从网络事实派生业务视角

### 12.1 为什么不是普通关系图

数据流不适合放在协议关系图谱里。协议图谱强调类型引用；数据流强调生产节点、链路、协议载荷和消费节点。

因此当前设计顺序是：

```text
维护网络事实
  → 选择 / 创建 FlowView
  → 打开数据流画布
  → 查看生产节点 → 链路载荷 → 消费节点
```

### 12.2 画布布局

```text
生产节点        通信链路 / 协议载荷        消费节点
  Node A  ────── Link + Binding ──────>  Node B
```

视觉编码：

- 方向：左到右箭头。
- 带宽：线宽。
- 风险：颜色。
- 流光：数据传导方向。

### 12.3 风险提示

画布和报告可提示：

- 关键链路。
- 带宽超限。
- 高吞吐节点。
- 高连接度节点。
- 高吞吐协议。
- 高峰值系数。
- 缺失硬件画像。
- 缺失软件画像。
- 网关汇聚压力。
- 存储写入压力。

这些是基于已录入事实的提示，不是实测性能结论。

## 13. Git 源代码管理、基线 Tag 和版本 Diff

### 13.1 两类 Git 能力

当前 Git 相关能力分两层：

| 能力 | 目的 | UI |
|---|---|---|
| Source Control | 像 VS Code 一样完成暂存、提交、查看变更 | 左侧工作栏“源代码管理 / Git” |
| 协议版本治理 | 基于 Git Tag 形成协议基线和语义 Diff | 顶部“基线 Tag”“版本 Diff” |

### 13.2 Source Control 操作路径

```text
左侧工作栏
  → 源代码管理 / Git
  → 左侧 Navigator 变为 Source Control
  → 查看 Changes / Staged Changes
  → 点击文件在中间打开 Diff tab
  → 暂存文件或全部暂存
  → 输入提交信息
  → 提交暂存更改
```

Source Control 左侧包含：

- 提交信息框。
- 提交暂存更改按钮。
- 刷新。
- 全部暂存。
- 全部取消暂存。
- Staged Changes。
- Changes。
- 分支切换。
- 新建并切换分支。
- 最近 Tag。
- Graph 最近提交流程图：按当前工作区过滤历史，支持搜索提交信息、hash、作者、ref 和文件路径；提交节点可展开，文件子节点可打开 Commit Diff；点击提交后右侧 Git 摘要显示该提交详情。

中间区域不再是 Git 普通页面，而是 Git Diff tab：

- Working Tree Diff：工作区相对 HEAD / index 的变化。
- Index Diff：暂存区相对 HEAD 的变化。
- Commit Diff：某个历史提交相对父提交的文件变化。

### 13.3 Git 提交保护

提交前检查：

- 提交信息不能为空。
- 当前仓库必须是 Git repository。
- 当前工作区不能存在冲突。
- 必须有暂存内容。
- 如果仓库里有当前工作区之外的暂存项，禁止提交，避免误提交。

当前延后：

- push。
- pull。
- fetch。
- remote 认证。
- 放弃更改。
- hunk / line 级暂存。

### 13.4 基线 Tag

基线 Tag 表示一次可追溯协议状态。

创建前必须满足：

- 当前路径属于 Git 仓库。
- 无冲突。
- 工作区无未提交改动。
- Tag 名称不存在。

基线文件写入：

```text
.protocol/baselines/*.json
```

内容包含：

- 协议类型、字段、枚举、布局摘要。
- Git branch / commit / short commit。
- 网络节点、链路、协议绑定、FlowView 摘要。

### 13.5 版本 Diff

版本 Diff 默认比较：

```text
最近基线 Tag → 当前 working tree
```

覆盖范围：

- 类型新增 / 删除。
- 字段新增 / 删除。
- 字段类型变化。
- 字段 offset 变化。
- 枚举项新增 / 删除 / 数值变化。
- 类型 size 变化。
- 网络节点变化。
- 链路变化。
- 协议绑定变化。
- FlowView 变化。
- 带宽估算变化。

推荐治理流程：

```text
编辑协议 / 网络事实
→ Lint / 文档 / 测试
→ Source Control 暂存并提交
→ 创建协议基线 Tag
→ 版本 Diff 输出演进报告
```

## 14. 本地 AI 使用助手与 Ollama 模型切换

### 14.1 定位

AI 使用助手不是自动写代码入口，而是操作问答和设计解释入口。它读取模块化知识库，并根据用户问题选择少量模块注入 prompt，避免上下文爆炸。

### 14.2 模块化知识库

模块包括：

- overview。
- workspace。
- protocol_tree。
- tabs_navigation。
- structured_editing。
- source_sync。
- layout_lint_docs。
- dependency_graph。
- network_map。
- flow_view_canvas。
- git_baseline。
- themes_layout。
- local_ollama_integration。

模块选择策略：

```text
显式选择模块优先
→ 关键词匹配
→ 追加相关模块
→ 默认最多 4 个模块
```

### 14.3 Ollama 集成

默认端点：

```text
http://127.0.0.1:11434
```

环境变量：

```text
PROTOVAULT_OLLAMA_ENDPOINT
PROTOVAULT_OLLAMA_MODEL
PROTOVAULT_OLLAMA_STATUS_TIMEOUT_MS
PROTOVAULT_OLLAMA_GENERATE_TIMEOUT_MS
PROTOVAULT_OLLAMA_NUM_PREDICT
```

默认建议轻量模型：

```text
qwen2.5:3b
```

生成回答默认最长等待约 120 秒；状态检测和生成回答使用不同超时，避免本地模型冷启动被误判为不可用。

### 14.4 降级策略

如果 Ollama 不可用：

- 显示离线知识库摘要。
- 提示如何启动 Ollama。
- 不阻塞用户查看模块知识。

AI 助手必须遵守：

- 不编造未实现功能。
- 涉及保存、删除、Git Tag、覆盖文件时提醒前置条件。
- AI 输出是辅助解释，不是规则校验和人工评审的替代。

## 15. 主题、布局和 Obsidian 兼容

### 15.1 主题系统

全局主题入口在左侧底部工作区设置中。

当前主题方向：

- Tokyo Night。
- Obsidian Dark。
- Obsidian Light。
- 简墨：中国风简洁浅色主题。

主题应影响：

- 全局背景和文字。
- 左侧树。
- 中间表格。
- Header 源码。
- 右侧 Inspector。
- Git Diff。
- 关系图谱。
- 数据流画布。

图谱不再维护独立主题按钮，避免同一个应用出现两套主题系统。

### 15.2 布局

界面采用三栏结构：

```text
最左 rail：模式切换
左侧 Navigator：树 / Source Control / 当前模式列表
中间 Editor：tab、表格、源码、图谱、网络地图、Diff
右侧 Inspector：属性、诊断、图谱上下文、Git 摘要
```

能力：

- 左栏可拖拽宽度。
- 右栏可拖拽宽度。
- 左右栏可一键收起。
- 顶部工作栏可收起。
- 折叠后保留边缘箭头恢复。
- 长树独立滚动，不遮挡底部工作区栏。

### 15.3 代码配色

Header 源码展示应采用接近 Visual Studio C++ 的默认可读配色：

- 预处理：强调色。
- 类型：紫 / 蓝。
- 数字：青绿。
- 注释：绿色或低饱和灰绿。
- 关键字：蓝紫。

目标不是做完整 IDE，而是让源码预览和修复时足够熟悉。

## 16. 持久化文件、API 与安全写入规则

### 16.1 主要文件

| 路径 | 内容 |
|---|---|
| `.protocol/workspace.json` | 工作区目录记录 |
| `.protocol/meta/metadata.json` | 注释、字段元数据、旧 dataFlow 兼容信息 |
| `.protocol/network/network.json` | 节点、链路、协议绑定、FlowView |
| `.protocol/baselines/*.json` | 协议基线 |
| `.protocol/reports/*.md` | 文档、Diff、网络报告 |
| Header 源文件 | C++ 协议定义和字段行内注释 |

### 16.2 API 分类

工作区：

- open。
- scan。
- status。

协议结构：

- createHeader / renameHeader / deleteHeader。
- createStruct / renameStruct / deleteStruct。
- createEnum / renameEnum / deleteEnum。
- addField / updateField / deleteField。
- addEnumValue / updateEnumValue / deleteEnumValue。
- updateHeaderContent。
- updateHeaderIncludes。
- updateNote。

网络：

- createNetworkNode / updateNetworkNode / deleteNetworkNode。
- createNetworkLink / updateNetworkLink / deleteNetworkLink。
- createProtocolBinding / updateProtocolBinding / deleteProtocolBinding。
- createNetworkFlowView / updateNetworkFlowView / deleteNetworkFlowView。
- generateNetworkReport。

治理：

- lint。
- generateDocument。
- createBaselineTag。
- semanticDiff。

Git：

- gitStatus。
- gitBranches。
- gitTags。
- gitStagePath。
- gitUnstagePath。
- gitStageWorkspace。
- gitUnstageWorkspace。
- gitCommit。
- gitCheckoutBranch。
- gitCreateBranch。
- gitCommitGraph。
- gitFileDiff。

AI：

- assistantStatus。
- askAssistant。

### 16.3 安全写入

所有写操作应遵循：

```text
校验输入
→ 检查路径位于工作区内
→ 必要时检查 hash / Git 状态 / include cycle
→ 写临时文件
→ 原子替换
→ 重新扫描
→ 刷新 UI
```

禁止：

- 路径逃逸工作区。
- 解析失败时覆盖最后有效 IR。
- 结构化编辑生成非法 Header 后仍写盘。
- 静默覆盖外部修改。
- Git 提交当前工作区之外的暂存项。

## 17. 常见误区与纠正

| 误区 | 正确理解 |
|---|---|
| ProtoVault 是 Header 编辑器 | 它是协议资产工作台，Header 只是入口和同步目标 |
| 数据流应该直接挂在 Struct 上 | 节点和链路才是主事实，协议通过 Binding 走链路 |
| 关系图谱应该展示所有数据流 | 协议图谱只展示类型依赖，数据流交给数据流画布 |
| Git 功能只是顶部按钮 | Git Source Control 是左侧独立工作栏，Diff 在中间 tab |
| Alt + 左右是撤销重做 | 它是界面导航历史，不修改文件 |
| AI 可以决定协议是否正确 | AI 只辅助解释，规则校验、Clang、Lint 和人工评审才是硬门槛 |
| size 越大性能风险越高 | 风险还取决于频率、批量、峰值、链路和节点画像 |
| 注释只存在 `.protocol/meta` | Header 源码注释是重要同步源，删除源码注释要同步清空 |
| 解析失败后只能放弃 | 仍可打开源码 tab 修复并重新扫描 |

## 18. 标准操作流程与检查清单

### 18.1 新用户理解工作区

```text
打开工作区
→ 等待扫描完成
→ 查看左侧树和右侧问题
→ 打开几个核心 Struct
→ 查看字段表、布局和诊断
→ 打开关系图谱看引用关系
```

检查：

- Header 是否全部被发现。
- 空目录是否保留。
- 诊断是否可定位。
- 核心结构体是否有 layout。

### 18.2 修改字段

```text
打开 Struct tab
→ 双击字段行或 F2 编辑
→ 修改名称 / 类型 / 注释 / 初始化值
→ 检查类型候选和语法校验
→ Ctrl+S 保存
→ 重新扫描后查看 layout / lint
```

检查：

- 字段注释是否写回源码同行。
- 初始化值是否保留。
- layout offset 是否符合预期。
- Git Changes 是否只包含预期文件。

### 18.3 修复源码错误

```text
打开 Header Source tab
→ 查看诊断行
→ 直接修改源码
→ Ctrl+S
→ 重新扫描
```

检查：

- 错误是否消失。
- 类型表是否恢复。
- 外部修改冲突是否处理。

### 18.4 维护网络数据流

```text
进入网络地图
→ 创建 / 编辑 NetworkNode
→ 创建 / 编辑 NetworkLink
→ 创建 / 编辑 ProtocolBinding
→ 创建 FlowView
→ 打开数据流画布
→ 生成网络数据流报告
```

检查：

- 链路源 / 目标是否正确。
- 协议绑定是否选到正确类型。
- 频率、批量、峰值系数是否合理。
- 风险提示是否来自已录入事实。

### 18.5 做一次协议版本治理

```text
完成协议修改
→ 运行 Lint / 生成文档
→ 左侧 Source Control 查看 Changes
→ 点击文件查看 Diff
→ 暂存预期文件
→ 输入提交信息并 commit
→ 创建协议基线 Tag
→ 运行版本 Diff
```

检查：

- 没有误提交示例临时文件。
- 基线 Tag 创建前工作区干净。
- Diff 覆盖字段、布局和网络事实变化。

## 19. 当前限制与下一步优化机会

### 19.1 当前限制

- C++ 支持范围是受限 Header 子集，不支持复杂宏、模板、继承和运行期容器作为可编辑协议。
- Git Graph 已支持展开提交文件子节点，但尚未实现完整 merge lane 和复杂分支可视化。
- Git Diff 是文件级行 diff，暂未支持 hunk / line 级暂存。
- Source Control 暂不支持 push / pull / remote 认证。
- 数据流画布是派生展示，不支持拖拽编辑链路。
- 网络风险是估算提示，未接入真实运行采样。
- AI 助手是单轮问答，尚未做向量索引和长期对话记忆。
- 正式安装包和完整发布流程仍待深化。

### 19.2 优化机会

1. 把 AI 知识库从静态模块升级为版本化索引。
2. 为 Git 分支 / Tag 增加业务模板：实验分支、评审 Tag、发布 Tag。
3. 增加 hunk 级暂存和更接近 VS Code 的 Diff 操作体验。
4. 将网络事实报告与协议文档合并为项目架构报告。
5. 引入运行期采样契约：延迟、吞吐、队列深度、CPU/GPU、磁盘 IO。
6. 强化大工作区扫描性能：增量 AST、缓存、后台 worker、虚拟列表。
7. 图谱层后续可迁移到 PixiJS/WebGL，但前提是证明大规模工作区有性能瓶颈。
8. 增加字段元数据：单位、范围、坐标系、时间基准、兼容性状态。
9. 增加序列化布局与内存布局区分，避免 `sizeof` 被误当作网络载荷大小。

## 20. 自测问题

1. 为什么 ProtoVault 不把生产者和消费者直接写在 Struct 上？
2. Header 解析失败时，用户应该如何恢复？
3. 字段注释删除后，为什么不能继续由 `.protocol/meta` 旧值覆盖？
4. 关系图谱和数据流画布分别回答什么问题？
5. 创建协议基线 Tag 前为什么要求工作区干净？
6. `Alt + ← / →` 和编辑撤销有什么区别？
7. 峰值系数为什么影响链路风险判断？
8. Git Source Control 和顶部“基线 Tag / 版本 Diff”分别属于哪一层能力？

一句话总结：ProtoVault 的关键不是把所有功能堆在一个界面里，而是保持事实层清晰、编辑路径集中、写盘前可验证、版本演进可追溯；这样协议才能从代码细节升级为真正可管理的工程资产。
