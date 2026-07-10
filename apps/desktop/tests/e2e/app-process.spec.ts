import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test.setTimeout(90_000);

async function createProcessWorkspace(prefix: string): Promise<{ root: string; headerPath: string }> {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
  await mkdir(resolve(root, "headers", "process"), { recursive: true });
  await mkdir(resolve(root, "empty-folder"), { recursive: true });
  const headerPath = resolve(root, "headers", "process", "process_packet.hpp");
  await writeFile(headerPath, `#pragma once
#include <cstdint>
namespace demo::process {
struct ProcessPacket {
  std::uint32_t id;
  std::uint16_t sequence;
};
}
`, "utf8");
  return { root, headerPath };
}

async function launchDesktop(env: NodeJS.ProcessEnv): Promise<ElectronApplication> {
  const desktopRoot = resolve(import.meta.dirname, "../..");
  const mergedEnv = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  return electron.launch({
    args: ["."],
    cwd: desktopRoot,
    env: mergedEnv
  });
}

test("app process hides native chrome, scans sample workspace, runs lint, rescans, and reports external file changes", async () => {
  const workspace = await createProcessWorkspace("protovault-e2e-process-");
  const application = await launchDesktop({
    PROTOVAULT_DISABLE_RESTORE: "1",
    PROTOVAULT_SAMPLE_WORKSPACE: workspace.root
  });

  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "ProtoVault" })).toBeVisible({ timeout: 15_000 });

    const processState = await application.evaluate(({ BrowserWindow, Menu }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return {
        applicationMenuHidden: Menu.getApplicationMenu() === null,
        menuBarVisible: window?.isMenuBarVisible(),
        minimumSize: window?.getMinimumSize()
      };
    });
    expect(processState.applicationMenuHidden).toBe(true);
    expect(processState.menuBarVisible).toBe(false);
    expect(processState.minimumSize).toEqual([960, 640]);

    await page.getByRole("button", { name: "加载示例项目" }).click();
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "demo::process::ProcessPacket", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新扫描当前工作区" })).toBeEnabled();

    await page.getByRole("button", { name: "问题面板 / 运行 Lint" }).click();
    await expect(page.getByRole("region", { name: "协议报告" })).toContainText("协议 Lint");
    await page.getByRole("button", { name: "关闭报告" }).click();

    await page.getByRole("button", { name: "重新扫描当前工作区" }).click();
    await expect(page.getByRole("button", { name: "demo::process::ProcessPacket", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_800);

    const before = await readFile(workspace.headerPath, "utf8");
    await writeFile(workspace.headerPath, `${before}\n// external process edit\n`, "utf8");
    const externalChangePanel = page.getByRole("region", { name: "外部修改冲突" });
    await expect(externalChangePanel).toBeVisible({ timeout: 8_000 });
    await expect(externalChangePanel).toContainText("process/process_packet.hpp");
    await externalChangePanel.getByRole("button", { name: "导入磁盘版本" }).click();
    await expect(externalChangePanel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "demo::process::ProcessPacket", exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await application.close();
    await rm(workspace.root, { recursive: true, force: true });
  }
});

test("app process persists and restores the last workspace across restarts", async () => {
  const workspace = await createProcessWorkspace("protovault-e2e-restore-workspace-");
  const appDataRoot = await mkdtemp(resolve(tmpdir(), "protovault-e2e-appdata-"));

  let application: ElectronApplication | null = null;
  try {
    application = await launchDesktop({
      APPDATA: appDataRoot,
      PROTOVAULT_SAMPLE_WORKSPACE: workspace.root
    });
    let page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: "加载示例项目" })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "加载示例项目" }).click();
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "demo::process::ProcessPacket", exact: true })).toBeVisible();
    await application.close();
    application = null;

    application = await launchDesktop({
      APPDATA: appDataRoot
    });
    page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "demo::process::ProcessPacket", exact: true })).toBeVisible();
  } finally {
    if (application) await application.close();
    await rm(workspace.root, { recursive: true, force: true });
    await rm(appDataRoot, { recursive: true, force: true });
  }
});
