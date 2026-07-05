import { describe, expect, it } from "vitest";
import { buildAssistantPrompt, selectAssistantModules } from "./assistant";

describe("assistant knowledge routing", () => {
  it("selects only relevant modules for a git baseline question", () => {
    const modules = selectAssistantModules("如何创建 Git 基线 Tag 并查看版本 Diff？");

    expect(modules.map((module) => module.id)).toContain("git-baseline");
    expect(modules.length).toBeLessThanOrEqual(4);
  });

  it("routes local Ollama model switching questions to the overview module", () => {
    const modules = selectAssistantModules("Ollama 模型怎么切换，小模型适合什么场景？");

    expect(modules.map((module) => module.id)).toContain("overview");
  });

  it("routes git commit guidance to the source-control view", () => {
    const modules = selectAssistantModules("提交版本的位置在界面的哪里？", "git-baseline");
    const prompt = buildAssistantPrompt({
      question: "提交版本的位置在界面的哪里？",
      moduleId: "git-baseline"
    }, modules);

    expect(prompt).toContain("左侧工作栏 → 源代码管理");
    expect(prompt).toContain("左侧 Source Control");
    expect(prompt).toContain("提交暂存更改");
  });

  it("explains expandable git graph history files", () => {
    const modules = selectAssistantModules("Git Graph 怎么看历史提交里的文件修改？", "git-baseline");
    const prompt = buildAssistantPrompt({
      question: "Git Graph 怎么看历史提交里的文件修改？",
      moduleId: "git-baseline"
    }, modules);

    expect(prompt).toContain("提交节点可展开");
    expect(prompt).toContain("Commit Diff");
  });

  it("keeps prompts bounded to selected modules", () => {
    const modules = selectAssistantModules("字段类型怎么编辑，注释如何同步到 Header？", "structured-editing");
    const prompt = buildAssistantPrompt({
      question: "字段类型怎么编辑，注释如何同步到 Header？",
      moduleId: "structured-editing",
      workspaceSummary: "Header: 7\nStruct: 10"
    }, modules);

    expect(modules.map((module) => module.id)).toContain("structured-editing");
    expect(prompt).toContain("[当前工作区摘要]");
    expect(prompt.length).toBeLessThan(18_000);
  });
});
