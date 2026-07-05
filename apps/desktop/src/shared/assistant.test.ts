import { describe, expect, it } from "vitest";
import { buildAssistantPrompt, selectAssistantModules } from "./assistant";

describe("assistant knowledge routing", () => {
  it("selects only relevant modules for a git baseline question", () => {
    const modules = selectAssistantModules("如何创建 Git 基线 Tag 并查看版本 Diff？");

    expect(modules.map((module) => module.id)).toContain("git-baseline");
    expect(modules.length).toBeLessThanOrEqual(4);
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
