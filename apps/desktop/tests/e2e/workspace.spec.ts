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
    await expect(page.getByRole("button", { name: "新建 Header 文件" })).toBeEnabled();
    await page.getByRole("button", { name: "新建 Header 文件" }).click();
    await expect(page.getByRole("region", { name: "结构化编辑" })).toContainText("新建 Header");
    await expect(page.getByLabel("Header 相对路径")).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();

    const radarTrack = page.getByRole("button", { name: "demo::radar::RadarTrack", exact: true });
    await expect(radarTrack).toBeVisible();
    await radarTrack.click();
    await page.getByRole("button", { name: "新增数据结构" }).click();
    await expect(page.getByRole("region", { name: "结构化编辑" })).toContainText("新增数据结构");
    await expect(page.getByLabel("Struct 名称")).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: "添加字段" }).click();
    await expect(page.getByRole("region", { name: "结构化编辑" })).toContainText("添加字段");
    await expect(page.getByLabel("字段类型")).toBeVisible();
    await expect(page.getByLabel("字段名称")).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();

    await expect(page.getByRole("cell", { name: "trackId" })).toBeVisible();
    await expect(page.getByText("没有扫描问题")).toBeVisible();
    await expect(page.getByText("__vcrt_va_list_is_reference")).toHaveCount(0);

    await page.getByRole("button", { name: "折叠类型 demo::radar::RadarTrack", exact: true }).click();
    await expect(page.getByRole("button", { name: "RadarTrack trackId" })).toHaveCount(0);
    await page.getByRole("button", { name: "展开类型 demo::radar::RadarTrack", exact: true }).click();
    await page.getByRole("button", { name: "RadarTrack velocity" }).click();
    await expect(page.locator("tr.selected-row").getByRole("cell", { name: "velocity" })).toBeVisible();

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
    await expect(page.getByText("struct RadarTrack", { exact: false })).toBeVisible();
    await expect(page.getByText("只读预览")).toBeVisible();

    await page.getByRole("button", { name: "demo::common::CoordinateFrame", exact: true }).click();
    await expect(page.getByRole("cell", { name: "ECEF" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  } finally {
    await application.close();
  }
});
