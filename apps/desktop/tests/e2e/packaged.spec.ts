import { _electron as electron, expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packagedExecutable = process.env.PROTOVAULT_PACKAGED_EXE;

test.setTimeout(120_000);

test("packaged app scans and reads Git state without external developer tools", async () => {
  test.skip(!packagedExecutable, "Set PROTOVAULT_PACKAGED_EXE to run the standalone package smoke test.");

  const executable = resolve(packagedExecutable!);
  const resourcesRoot = resolve(dirname(executable), "resources");
  const bundledGit = resolve(resourcesRoot, "protovault-tools", "git", "cmd", "git.exe");
  const workspaceRoot = await mkdtemp(resolve(tmpdir(), "protovault-packaged-smoke-"));
  const appDataRoot = await mkdtemp(resolve(tmpdir(), "protovault-packaged-appdata-"));
  await mkdir(resolve(workspaceRoot, "headers", "standalone"), { recursive: true });
  await writeFile(resolve(workspaceRoot, "headers", "standalone", "packet.hpp"), `#pragma once
#include <cstdint>
namespace standalone {
struct Packet {
  std::uint32_t id;
  std::uint16_t sequence;
};
}
`, "utf8");

  await execFileAsync(bundledGit, ["init", "-b", "main"], { cwd: workspaceRoot });
  await execFileAsync(bundledGit, ["config", "user.name", "ProtoVault Package Test"], { cwd: workspaceRoot });
  await execFileAsync(bundledGit, ["config", "user.email", "package-test@protovault.local"], { cwd: workspaceRoot });
  await execFileAsync(bundledGit, ["add", "."], { cwd: workspaceRoot });
  await execFileAsync(bundledGit, ["commit", "-m", "test: initialize standalone workspace"], { cwd: workspaceRoot });

  const application = await electron.launch({
    executablePath: executable,
    env: {
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      WINDIR: process.env.WINDIR ?? "C:\\Windows",
      PATH: "C:\\Windows\\System32;C:\\Windows",
      APPDATA: appDataRoot,
      LOCALAPPDATA: resolve(appDataRoot, "Local"),
      PROTOVAULT_DISABLE_RESTORE: "1",
      PROTOVAULT_SAMPLE_WORKSPACE: workspaceRoot
    }
  });

  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "ProtoVault" })).toBeVisible({ timeout: 20_000 });

    const runtime = await application.evaluate(({ app }) => ({
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath
    }));
    expect(runtime.appPath.toLowerCase()).toContain("app.asar");
    expect(runtime.resourcesPath.toLowerCase()).toBe(resourcesRoot.toLowerCase());

    await page.getByRole("button", { name: "加载示例项目" }).click();
    await expect(page.getByRole("button", { name: "standalone::Packet", exact: true })).toBeVisible({ timeout: 40_000 });
    const workspaceDock = page.getByLabel("工作区管理");
    await expect(workspaceDock).toContainText("SQLite 索引");
    await expect(workspaceDock).toContainText("Git main");
    await expect(page.getByRole("button", { name: "新增数据结构" })).toBeEnabled();
  } finally {
    await application.close();
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(appDataRoot, { recursive: true, force: true });
  }
});
