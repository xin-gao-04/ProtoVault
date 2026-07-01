import { _electron as electron, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opens the sample workspace and navigates headers and protocol types", async () => {
  const desktopRoot = resolve(import.meta.dirname, "../..");
  const application = await electron.launch({
    args: ["."],
    cwd: desktopRoot,
    env: { ...process.env, PROTOVAULT_DISABLE_RESTORE: "1" }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "ProtoVault" })).toBeVisible();

    await page.getByRole("button", { name: "加载示例项目" }).click();
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新增枚举" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新建 Header 文件" })).toBeEnabled();
    await page.getByRole("button", { name: "新建 Header 文件" }).click();
    let actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("新建 Header");
    await expect(page.getByLabel("Header 相对路径")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    const radarTrack = page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true });
    await expect(radarTrack).toBeVisible();
    await radarTrack.click();
    await expect(page.getByRole("navigation", { name: "工作区标签页" })).toBeVisible();
    await expect(page.getByRole("button", { name: "切换到 RadarTrack" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "工作区类型" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "基础支持类型" })).toBeVisible();
    await page.locator(".field-type-menu button", { hasText: "std::uint16_t" }).click();
    await expect(editor.getByRole("textbox", { name: "新增字段类型", exact: true })).toHaveValue("std::uint16_t");
    await editor.getByRole("textbox", { name: "新增字段类型", exact: true }).fill("int");
    await editor.locator("tr.draft-row").getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("字段类型不在支持范围内")).toBeVisible();
    await editor.locator("tr.draft-row").getByRole("button", { name: "取消" }).click();
    await expect(editor.getByLabel("新增字段名称")).toHaveCount(0);

    const trackIdRow = page.getByRole("row", { name: /trackId/ });
    await trackIdRow.getByRole("button", { name: "编辑" }).click();
    await expect(trackIdRow.getByLabel("字段名称")).toHaveValue("trackId");
    await expect(trackIdRow.getByRole("textbox", { name: "字段类型", exact: true })).toHaveValue("std::uint32_t");
    await trackIdRow.getByRole("button", { name: "取消" }).click();
    await expect(trackIdRow.getByRole("button", { name: "编辑" })).toBeVisible();

    await trackIdRow.getByRole("button", { name: "面板" }).click();
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
    await page.getByRole("button", { name: "展开类型 demo::radar::RadarTrack", exact: true }).click();
    await page.getByRole("button", { name: "RadarTrack velocity" }).click();
    await page.keyboard.press("F2");
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑字段");
    await expect(page.getByLabel("字段名称")).toHaveValue("velocity");
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
    await expect(page.getByRole("button", { name: "切换到 track.hpp" })).toBeVisible();
    await expect(page.getByText("struct RadarTrack", { exact: false })).toBeVisible();
    await expect(page.getByText("只读预览")).toBeVisible();
    await page.getByRole("button", { name: "编辑 Header" }).click();
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

    await page.getByRole("button", { name: "添加枚举项" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("添加枚举项");
    await expect(page.getByLabel("枚举项名称")).toBeVisible();
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("row", { name: /ECEF/ }).getByRole("button", { name: "编辑" }).click();
    actionPanel = page.getByRole("region", { name: "结构化编辑" });
    await expect(actionPanel).toContainText("编辑枚举项");
    await expect(page.getByLabel("枚举项名称")).toHaveValue("ECEF");
    await expect(page.getByLabel("枚举值")).toHaveValue("2");
    await actionPanel.getByRole("button", { name: "关闭", exact: true }).click();

    const noteEditor = page.getByRole("region", { name: "注释编辑" });
    await expect(noteEditor).toContainText("枚举项 CoordinateFrame.ECEF");
    await noteEditor.getByPlaceholder("记录语义说明、单位、范围、兼容性约束…").fill("测试坐标系枚举项注释");
    await noteEditor.getByRole("button", { name: "保存注释" }).click();
    await expect(page.getByText("注释已保存到 .protocol/meta/metadata.json")).toBeVisible();
  } finally {
    await application.close();
  }
});
