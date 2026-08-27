/**
 * WShell preset 结构测试：校验真实 bundled preset 文件的契约。
 *
 * 每个 preset 目录必须满足：agent.cordis.yml 通过 validateAgentCordis、
 * persona 单行极简、目录构成行符合该模式约定；`./tool-win-shell.mjs`
 * 包装器存在且 re-export `win-shell-mcp/plugin`。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateAgentCordis, ROW_RE, META_RE, NAME_RE, unquote } from "../../src/dsh-bundle/schema.js";
import {
  apply as pluginApply,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../../src/plugin.js";

const PRESETS_ROOT = fileURLToPath(new URL("../../presets/", import.meta.url));

/** 读取并解析 agent.cordis.yml 的顶层行（id → 前几个扁平键），足够断言契约。 */
function parseRows(text: string): { id: string; name: string; exclude?: string[] }[] {
  const rows: { id: string; name: string; exclude?: string[] }[] = [];
  let current: { id: string; name: string; exclude?: string[] } | null = null;
  let inConfig = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const row = ROW_RE.exec(line);
    if (row) {
      current = { id: row[1]!.trim(), name: "" };
      inConfig = false;
      rows.push(current);
      continue;
    }
    if (!current) continue;
    const name = META_RE.exec(line);
    if (name && name[1] === "name") current.name = unquote(name[2]!.trim());
    if (/^ {2}config:/.test(line)) { inConfig = true; continue; }
    if (inConfig) {
      const exclude = /^ {4}exclude:\s*\[(.*)\]\s*$/.exec(line);
      if (exclude) current.exclude = exclude[1]!.split(",").map((s) => s.trim());
    }
  }
  return rows;
}

/** 提取 persona 行的子树（该行 + 其后缩进/空行，到下一非缩进内容为止）。 */
function personaSubtree(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^-\s+id:\s*persona\s*$/.test(line));
  const body: string[] = [lines[start]!];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === "" || /^\s/.test(line)) body.push(line);
    else break; // 列 0 内容（下一行行 / 段尾注释）结束 persona 子树
  }
  return body.join("\n");
}

/** win-shell-mcp 侧 3 个 meta 工具名（registry 的 61 = 58 域 + 3 meta）。 */
const META_TOOLS = ["batch_run", "tool_groups", "list_domain_tools"] as const;

/** 捕获 defineTool 调用的 fake ctx（与插件投影测试同构，验证注册数）。 */
function makeFakeCtx(): {
  ctx: CordisPluginContext;
  defined: Map<string, DshToolDefinition>;
} {
  const defined = new Map<string, DshToolDefinition>();
  const ctx: CordisPluginContext = {
    tools: {
      defineTool(def: DshToolDefinition) {
        defined.set(def.name, def);
      },
    },
  };
  return { ctx, defined };
}

describe("wshell-standard preset", () => {
  const dir = join(PRESETS_ROOT, "wshell-standard");
  const agent = join(dir, "agent.cordis.yml");

  it("agent.cordis.yml 存在且通过结构校验", () => {
    expect(existsSync(agent)).toBe(true);
    const problems = validateAgentCordis(readFileSync(agent, "utf8"));
    expect(problems).toEqual([]);
  });

  it("目录构成：persona + tool-win-shell + fs/web/lsp 三组", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(["persona", "tool-win-shell", "tool-fs", "tool-web", "tool-lsp"]);
  });

  it("tool-win-shell 剔除 3 个 meta 工具（贡献 58 域工具）", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const toolWinShell = rows.find((r) => r.id === "tool-win-shell");
    expect(toolWinShell?.exclude).toEqual(["batch_run", "tool_groups", "list_domain_tools"]);
  });

  it("按 preset 的 exclude 注册 win-shell-mcp = 58 域工具（目录共 65）", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const exclude = rows.find((r) => r.id === "tool-win-shell")?.exclude ?? [];
    const { ctx, defined } = makeFakeCtx();
    pluginApply(ctx, { exclude });
    // 58 win-shell-mcp + fs 组 4 + web 组 2 + lsp 1 = 65
    expect(defined.size).toBe(58);
    for (const meta of META_TOOLS) expect(defined.has(meta)).toBe(false);
  });

  it("persona 单行极简（对齐官方 Minimal），不注入工具映射表", () => {
    const text = readFileSync(agent, "utf8").replace(/\r\n/g, "\n");
    const personaBlock = personaSubtree(text);
    expect(personaBlock).toMatch(/text:\s*You are a helpful software engineer assistant\./);
    // 对齐官方 Minimal persona：complete 视为完整系统提示、不注入运行时上下文
    expect(personaBlock).toMatch(/complete:\s*true/);
    expect(personaBlock).toMatch(/includeRuntimeContext:\s*false/);
    // persona 子树只含单行 text 配置与扁平 name/config，不允许规则堆砌
    expect(personaBlock.trim().length).toBeLessThan(200);
    // 明确不注入任何工具映射/规则/排除行
    expect(personaBlock).not.toMatch(/batch_run|tool_groups|list_domain_tools/);
  });

  it("tool-win-shell 行通过 ./tool-win-shell.mjs 包装器", () => {
    const text = readFileSync(agent, "utf8");
    expect(text).toContain("name: ./tool-win-shell.mjs");
    const wrapper = join(dir, "tool-win-shell.mjs");
    expect(existsSync(wrapper)).toBe(true);
    expect(readFileSync(wrapper, "utf8")).toContain("win-shell-mcp/plugin");
  });

  it("preset.yml 存在且含显示名", () => {
    const preset = join(dir, "preset.yml");
    expect(existsSync(preset)).toBe(true);
    expect(readFileSync(preset, "utf8")).toMatch(/name:\s*WShell 标准模式/);
  });

  it("所有行 name 可被 dsh loader 接受", () => {
    for (const row of parseRows(readFileSync(agent, "utf8"))) {
      expect(row.name, `row ${row.id}`).toMatch(NAME_RE);
    }
  });
});
