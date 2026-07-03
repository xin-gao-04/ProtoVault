import { _electron as electron, expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

test("opens the sample workspace and navigates headers and protocol types", async () => {
  const desktopRoot = resolve(import.meta.dirname, "../..");
  const fixtureRoot = resolve(desktopRoot, "../../fixtures");
  const geometryHeader = resolve(fixtureRoot, "radar-workspace/headers/common/geometry.hpp");
  const originalGeometryHeader = await readFile(geometryHeader, "utf8");
  const flowProducer = `RadarDriver${Date.now()}`;
  const application = await electron.launch({
    args: ["."],
    cwd: desktopRoot,
    env: { ...process.env, PROTOVAULT_DISABLE_RESTORE: "1", PROTOVAULT_SAMPLE_WORKSPACE: fixtureRoot }
  });

  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "ProtoVault" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "加载示例项目" }).click();
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新增枚举" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新建 Header 文件" })).toBeEnabled();
    await page.getByRole("button", { name: "Lint" }).click();
    await expect(page.getByRole("region", { name: "协议报告" })).toContainText("协议 Lint");
    await page.getByRole("button", { name: "关闭报告" }).click();
    await page.getByRole("button", { name: "文档" }).click();
    await expect(page.getByRole("region", { name: "协议报告" })).toContainText(".protocol/reports/protocol-documentation.md");
    await page.getByRole("button", { name: "关闭报告" }).click();
    await page.getByRole("button", { name: "快照" }).click();
    await expect(page.getByRole("region", { name: "协议报告" })).toContainText(".protocol/snapshots/");
    await page.getByRole("button", { name: "关闭报告" }).click();
    await page.getByRole("button", { name: "Diff" }).click();
    await expect(page.getByRole("region", { name: "协议报告" })).toContainText("语义 Diff");
    await page.getByRole("button", { name: "关闭报告" }).click();
    await page.getByRole("button", { name: "关系图谱" }).click();
    const graph = page.getByRole("region", { name: "协议关系图谱" });
    await expect(graph).toBeVisible();
    await expect(page.getByRole("heading", { name: "图谱上下文" })).toBeVisible();
    await expect(page.getByLabel("协议关系图谱画布")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "图谱搜索" })).toBeVisible();
    await expect(graph.getByRole("button", { name: "图谱节点 struct RadarTrack" })).toBeVisible();
    await expect(graph.getByRole("button", { name: "图谱节点 struct Vec3" })).toBeVisible();
    await page.getByRole("textbox", { name: "图谱搜索" }).fill("Timestamp");
    await expect(graph.getByRole("button", { name: "图谱节点 struct Timestamp" })).toBeVisible();
    await expect(graph.getByRole("button", { name: "图谱节点 struct RadarTrack" })).toBeVisible();
    await page.getByRole("textbox", { name: "图谱搜索" }).fill("");
    await graph.getByRole("button", { name: "图谱节点 struct Vec3" }).click();
    await expect(page.getByText("影响力")).toBeVisible();
    await expect(page.getByText("布局摘要")).toBeVisible();
    await expect(page.getByRole("heading", { name: "数据流标签" })).toBeVisible();
    await graph.getByRole("button", { name: "图谱节点 struct Vec3" }).dblclick();
    await expect(page.getByRole("button", { name: "切换到 Vec3" })).toBeVisible();
    await page.getByLabel("Vec3 生产节点").fill(flowProducer);
    await page.getByLabel("Vec3 消费节点").fill("Tracker, Telemetry");
    await expect(page.getByRole("button", { name: "切换到 Vec3 未保存" })).toBeVisible();
    await page.keyboard.press("Control+S");
    await expect(page.getByText("数据流标签已保存到 .protocol/meta/metadata.json")).toBeVisible();
    await expect(page.getByRole("button", { name: "切换到 Vec3", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关系图谱" }).click();
    await graph.getByRole("button", { name: "数据流" }).click();
    await expect(graph.getByRole("button", { name: `图谱节点 producer ${flowProducer}` })).toBeVisible();
    await expect(graph.getByRole("button", { name: "图谱节点 consumer Tracker" })).toBeVisible();
    await graph.getByRole("button", { name: "依赖" }).click();
    await expect(page.getByRole("button", { name: "demo::common::Vec3", exact: true })).toBeVisible();
    await graph.getByRole("button", { name: "图谱节点 struct RadarTrack" }).dblclick();
    await expect(page.getByRole("button", { name: "切换到 RadarTrack" })).toBeVisible();
    await page.getByRole("button", { name: "关闭 RadarTrack" }).click();
    const treeBox = await page.locator(".tree").evaluate((element) => element.getBoundingClientRect());
    const dockBox = await page.locator(".workspace-dock").evaluate((element) => element.getBoundingClientRect());
    expect(treeBox.bottom).toBeLessThanOrEqual(dockBox.top + 1);
    await page.getByRole("button", { name: "搜索协议树" }).click();
    await page.getByRole("textbox", { name: "协议树搜索" }).fill("FaultSeverity");
    await expect(page.getByRole("button", { name: "demo::diagnostics::FaultSeverity", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "协议树搜索" }).fill("trackId");
    await expect(page.getByRole("button", { name: "RadarTrack trackId", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清空搜索" }).click();
    await expect(page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "新建 Header 文件" }).click();
    let actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("新建 Header");
    await expect(page.getByLabel("Header 相对路径")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    const radarTrack = page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true });
    await expect(radarTrack).toBeVisible();
    await radarTrack.click();
    await expect(page.getByRole("navigation", { name: "工作区标签页" })).toBeVisible();
    await expect(page.getByRole("button", { name: "预览 RadarTrack", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "切换到 RadarTrack" })).toHaveCount(0);
    await radarTrack.dblclick();
    await expect(page.getByRole("button", { name: "切换到 RadarTrack" })).toBeVisible();
    await expect(page.getByRole("button", { name: "预览 RadarTrack", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "内存布局" })).toBeVisible();
    await expect(page.getByText("Padding")).toBeVisible();
    await expect(page.getByText("字段布局")).toBeVisible();
    await page.keyboard.press("F2");
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑数据结构");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await radarTrack.click({ button: "right" });
    await expect(page.getByRole("menu", { name: "上下文菜单" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "编辑 Struct" })).toBeVisible();
    await page.getByRole("menuitem", { name: "添加字段" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("添加字段");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "新增数据结构" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("新增数据结构");
    await expect(page.getByLabel("Struct 名称")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("button", { name: "新增枚举" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("新增枚举");
    await expect(page.getByLabel("Enum 名称")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("button", { name: "编辑 Struct" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑数据结构");
    await expect(page.getByLabel("Struct 名称")).toHaveValue("RadarTrack");
    await page.getByRole("button", { name: "demo::radar::RadarDetection", exact: true }).click();
    await expect(page.getByLabel("Struct 名称")).toHaveValue("RadarDetection");
    await expect(page.getByRole("button", { name: "删除 Struct" })).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await radarTrack.click();

    await page.locator(".tree-actions").getByRole("button", { name: "添加字段" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("添加字段");
    await expect(page.getByRole("textbox", { name: "字段类型", exact: true })).toBeVisible();
    await expect(page.getByLabel("字段名称")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await expect(page.getByRole("cell", { name: "trackId" })).toBeVisible();
    const editor = page.locator(".editor");
    await editor.getByRole("button", { name: "添加字段" }).click();
    await expect(editor.getByLabel("新增字段名称")).toHaveValue("field9");
    await expect(editor.getByRole("textbox", { name: "新增字段类型", exact: true })).toHaveValue("std::uint32_t");
    await editor.getByLabel("新增字段类型 类型索引").click();
    await expect(page.getByRole("button", { name: /基础类型/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /组合类型/ })).toBeVisible();
    await page.getByRole("button", { name: /基础类型/ }).click();
    await expect(page.getByRole("heading", { name: "基础支持类型" })).toBeVisible();
    await page.locator(".field-type-menu button", { hasText: "std::uint16_t" }).click();
    await expect(editor.getByRole("textbox", { name: "新增字段类型", exact: true })).toHaveValue("std::uint16_t");
    await editor.getByRole("textbox", { name: "新增字段类型", exact: true }).fill("int");
    await editor.locator("tr.draft-row").getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("字段类型不在支持范围内")).toBeVisible();
    await editor.locator("tr.draft-row").getByRole("button", { name: "取消" }).click();
    await expect(editor.getByLabel("新增字段名称")).toHaveCount(0);

    const trackIdRow = page.getByRole("row", { name: /trackId/ });
    await trackIdRow.dblclick();
    await expect(trackIdRow.getByLabel("字段名称")).toHaveValue("trackId");
    await expect(trackIdRow.getByRole("textbox", { name: "字段类型", exact: true })).toHaveValue("std::uint32_t");
    await page.keyboard.press("Escape");
    await expect(trackIdRow.getByRole("textbox", { name: "字段类型", exact: true })).toHaveCount(0);

    const timestampRow = page.getByRole("row", { name: /timestamp/ });
    await timestampRow.dblclick();
    await expect(timestampRow.getByLabel("字段名称")).toHaveValue("timestamp");
    await expect(timestampRow.getByRole("textbox", { name: "字段类型", exact: true })).toHaveValue("demo::common::Timestamp");
    await page.keyboard.press("Escape");
    await expect(timestampRow.getByRole("textbox", { name: "字段类型", exact: true })).toHaveCount(0);

    await trackIdRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "编辑字段" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑字段");
    await expect(page.getByLabel("字段名称")).toHaveValue("trackId");
    await expect(page.getByRole("button", { name: "保存修改" })).toBeVisible();
    await expect(page.getByRole("button", { name: "删除字段" })).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.getByText("没有扫描问题")).toBeVisible();
    await expect(page.getByText("__vcrt_va_list_is_reference")).toHaveCount(0);

    await page.getByRole("button", { name: "折叠类型 demo::radar::RadarTrack", exact: true }).click();
    await expect(page.getByRole("button", { name: "RadarTrack trackId" })).toHaveCount(0);
    await page.getByRole("row", { name: /history/ }).click({ modifiers: ["Control"] });
    await expect(page.getByRole("button", { name: "RadarTrack history" })).toBeVisible();
    await page.getByRole("button", { name: "RadarTrack velocity" }).click();
    await page.keyboard.press("F2");
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑字段");
    await expect(page.getByLabel("字段名称")).toHaveValue("velocity");
    await expect(page.getByRole("heading", { name: "当前字段", exact: true })).toBeVisible();
    await expect(page.getByText("Offset", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "RadarTrack confidence" }).click();
    await expect(page.getByLabel("字段名称")).toHaveValue("confidence");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.locator("tr.selected-row").getByRole("cell", { name: "confidence" })).toBeVisible();

    await expect(page.getByRole("button", { name: "目录 radar-workspace", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "目录 headers", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "折叠 Header radar-workspace/headers/radar/track.hpp" }).click();
    await expect(radarTrack).toHaveCount(0);
    await page.getByRole("button", { name: "展开 Header radar-workspace/headers/radar/track.hpp" }).click();
    await expect(radarTrack).toBeVisible();

    await page.getByRole("button", { name: "折叠目录 common" }).click();
    await expect(page.getByRole("button", { name: "打开 Header radar-workspace/headers/common/geometry.hpp" })).toHaveCount(0);
    await page.getByRole("button", { name: "展开目录 common" }).click();
    await expect(page.getByRole("button", { name: "打开 Header radar-workspace/headers/common/geometry.hpp" })).toBeVisible();

    await page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true }).click();
    await editor.getByText("demo::common::Timestamp").click({ modifiers: ["Control"] });
    await expect(page.getByRole("heading", { name: "Timestamp" })).toBeVisible();
    await page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true }).click();

    const navigatorWidthBefore = await page.locator(".navigator").evaluate((element) => element.getBoundingClientRect().width);
    const leftResizer = page.getByRole("separator", { name: "调整左侧树栏宽度" });
    const leftBox = await leftResizer.boundingBox();
    if (!leftBox) throw new Error("Missing left resize handle");
    await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 40);
    await page.mouse.down();
    await page.mouse.move(leftBox.x + 70, leftBox.y + 40);
    await page.mouse.up();
    const navigatorWidthAfter = await page.locator(".navigator").evaluate((element) => element.getBoundingClientRect().width);
    expect(navigatorWidthAfter).toBeGreaterThan(navigatorWidthBefore + 30);

    const inspectorWidthBefore = await page.locator(".inspector").evaluate((element) => element.getBoundingClientRect().width);
    const rightResizer = page.getByRole("separator", { name: "调整属性栏宽度" });
    const rightBox = await rightResizer.boundingBox();
    if (!rightBox) throw new Error("Missing right resize handle");
    await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 40);
    await page.mouse.down();
    await page.mouse.move(rightBox.x - 60, rightBox.y + 40);
    await page.mouse.up();
    const inspectorWidthAfter = await page.locator(".inspector").evaluate((element) => element.getBoundingClientRect().width);
    expect(inspectorWidthAfter).toBeGreaterThan(inspectorWidthBefore + 30);

    await page.getByRole("button", { name: "打开 Header radar-workspace/headers/radar/track.hpp" }).click();
    await expect(page.getByRole("button", { name: "预览 track.hpp", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "打开 Header radar-workspace/headers/radar/track.hpp" }).dblclick();
    await expect(page.getByRole("button", { name: "切换到 track.hpp" })).toBeVisible();
    await expect(page.getByLabel("Header 源码")).toHaveValue(/struct RadarTrack/);
    await expect(page.locator(".source-highlight .cpp-keyword", { hasText: "struct" }).first()).toBeVisible();
    await expect(page.getByText("源码已同步")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存源码" })).toBeDisabled();
    await page.getByRole("button", { name: "Header 操作" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑 Header");
    await expect(page.getByLabel("Header 相对路径")).toHaveValue("radar-workspace/headers/radar/track.hpp");
    await page.getByRole("button", { name: "打开 Header radar-workspace/headers/common/time.hpp" }).click();
    await expect(page.getByLabel("Header 相对路径")).toHaveValue("radar-workspace/headers/common/time.hpp");
    await expect(page.getByRole("button", { name: "删除 Header" })).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "打开 Header radar-workspace/headers/radar/track.hpp" }).click();
    await page.getByRole("button", { name: "打开 Header radar-workspace/headers/radar/track.hpp" }).click({ button: "right" });
    await expect(page.getByRole("menu", { name: "上下文菜单" })).toBeVisible();
    await page.getByRole("menuitem", { name: "编辑 Header" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑 Header");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("button", { name: "demo::common::CoordinateFrame", exact: true }).click();
    await expect(page.getByRole("cell", { name: "ECEF" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "2", exact: true })).toBeVisible();
    await page.keyboard.press("F2");
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑枚举");
    await expect(page.getByLabel("Enum 名称")).toHaveValue("CoordinateFrame");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await editor.getByRole("button", { name: "添加枚举项" }).click();
    await expect(editor.getByLabel("新增枚举项名称")).toBeVisible();
    await expect(editor.getByLabel("新增枚举值")).toBeVisible();
    await editor.locator("tr.draft-row").getByRole("button", { name: "取消" }).click();

    const ecefRow = page.getByRole("row", { name: /ECEF/ });
    const tabStrip = page.getByRole("navigation", { name: "工作区标签页" });
    await ecefRow.dblclick();
    await expect(ecefRow.getByLabel("枚举项名称")).toHaveValue("ECEF");
    await expect(ecefRow.getByLabel("枚举值")).toHaveValue("2");
    await ecefRow.getByLabel("枚举值").fill("bad");
    await page.keyboard.press("Control+S");
    await expect(page.getByText("枚举值必须是整数，或留空使用自动编号")).toBeVisible();
    await expect(ecefRow.getByLabel("枚举值")).toHaveValue("bad");
    await ecefRow.getByLabel("枚举值").fill("22");
    await expect(tabStrip.getByRole("button", { name: /CoordinateFrame 未保存/ })).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("未保存");
      await dialog.accept();
    });
    const editorBox = await editor.boundingBox();
    if (!editorBox) throw new Error("Missing editor box");
    await page.mouse.click(editorBox.x + 20, editorBox.y + editorBox.height - 20);
    await expect(page.getByText("已保存枚举项：ECEF")).toBeVisible();
    await expect(ecefRow.getByLabel("枚举值")).toHaveCount(0);

    const noteText = `测试坐标系枚举项注释 CtrlS ${Date.now()}`;
    await ecefRow.getByRole("textbox", { name: "ECEF 枚举项注释" }).fill(noteText);
    await expect(tabStrip.getByRole("button", { name: /CoordinateFrame 未保存/ })).toBeVisible();
    await page.keyboard.press("Control+S");
    await expect(page.getByText("已保存枚举项：ECEF")).toBeVisible();
    await page.keyboard.press("Control+S");
    await expect(page.getByText("注释已同步到 Header 和 .protocol/meta/metadata.json")).toBeVisible();
    await expect(tabStrip.getByRole("button", { name: /^(预览|切换到) CoordinateFrame$/ })).toBeVisible();
    await expect.poll(async () => readFile(geometryHeader, "utf8")).toContain(noteText);

    await page.getByRole("button", { name: "demo::common::Vec3", exact: true }).click();
    const zRow = editor.getByRole("row", { name: /^z\s+double/ });
    await zRow.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "删除字段" })).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("确认删除字段");
      await dialog.accept();
    });
    await page.getByRole("menuitem", { name: "删除字段" }).click();
    await expect(page.getByText("已删除字段：z")).toBeVisible();
    await expect(editor.getByRole("row", { name: /^z\s+double/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Vec3 y" }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "删除字段" })).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("确认删除字段");
      await dialog.accept();
    });
    await page.getByRole("menuitem", { name: "删除字段" }).click();
    await expect(page.getByText("已删除字段：y")).toBeVisible();
    await expect(editor.getByRole("row", { name: /^y\s+double/ })).toHaveCount(0);
  } finally {
    await application.close();
    await writeFile(geometryHeader, originalGeometryHeader, "utf8");
  }
});
