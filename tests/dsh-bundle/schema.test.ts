/**
 * validateAgentCordis 结构校验测试。
 *
 * 覆盖：空文档、合法文档、缺 name、重复 id、name 形式（./、@、cordis:、
 * 无 scope 包名与子路径）、group 与 name 配对、行外内容。
 */
import { describe, it, expect } from "vitest";
import { validateAgentCordis } from "../../src/dsh-bundle/schema.js";

describe("validateAgentCordis", () => {
  it("空文档报 document is empty", () => {
    expect(validateAgentCordis("")).toEqual(["document is empty"]);
    expect(validateAgentCordis("   \n  \n")).toEqual(["document is empty"]);
  });

  it("合法文档（@scope 行）返回空", () => {
    const doc = [
      "- id: persona",
      "  name: '@deepseek-ai/dsh-persona'",
      "  config:",
      "    text: You are a helpful software engineer assistant.",
      "",
      "- id: tool-fs",
      "  name: '@deepseek-ai/dsh-tool-fs'",
    ].join("\n");
    expect(validateAgentCordis(doc)).toEqual([]);
  });

  it("相对路径行（./）合法", () => {
    const doc = [
      "- id: tool-win-shell",
      "  name: ./tool-win-shell.mjs",
    ].join("\n");
    expect(validateAgentCordis(doc)).toEqual([]);
  });

  it("无 scope 包名与 exports 子路径合法", () => {
    const a = "- id: x\n  name: win-shell-mcp";
    const b = "- id: y\n  name: win-shell-mcp/plugin";
    expect(validateAgentCordis(a)).toEqual([]);
    expect(validateAgentCordis(b)).toEqual([]);
  });

  it("缺 name 报错", () => {
    const doc = "- id: persona";
    expect(validateAgentCordis(doc)).toContain('row "persona": missing "name" key');
  });

  it("重复 id 报错", () => {
    const doc = [
      "- id: persona",
      "  name: '@deepseek-ai/dsh-persona'",
      "- id: persona",
      "  name: '@deepseek-ai/dsh-persona'",
    ].join("\n");
    const errors = validateAgentCordis(doc);
    expect(errors.some((e) => e.includes('duplicate row id "persona"'))).toBe(true);
  });

  it("group: true 要求 name 为 cordis:group", () => {
    const doc = [
      "- id: planning",
      "  name: '@deepseek-ai/dsh-plan-mode'",
      "  group: true",
    ].join("\n");
    expect(validateAgentCordis(doc)).toContain('row "planning": "group: true" requires name "cordis:group"');
  });

  it("合法 cordis:group 行", () => {
    const doc = [
      "- id: planning",
      "  name: cordis:group",
      "  group: true",
      "  isolate:",
      "    planMode: true",
    ].join("\n");
    expect(validateAgentCordis(doc)).toEqual([]);
  });

  it("行外顶层内容报错", () => {
    const doc = "not a row: true";
    // toContain 对数组是元素全等，需先 join 再子串断言（错误消息带 line 前缀）
    const text = validateAgentCordis(doc).join("\n");
    expect(text).toContain("content outside a \"- id:\" row");
  });

  it("空行与注释被忽略", () => {
    const doc = [
      "# comment",
      "",
      "- id: persona",
      "  name: '@deepseek-ai/dsh-persona'",
    ].join("\n");
    expect(validateAgentCordis(doc)).toEqual([]);
  });
});
