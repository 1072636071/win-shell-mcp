/**
 * WShell preset 结构测试：校验真实 bundled preset 文件的契约。
 *
 * 每个 preset 目录必须满足：agent.cordis.yml 通过 validateAgentCordis、
 * persona 极简（对齐官方 Minimal 的 complete/includeRuntimeContext）、
 * 目录构成与工具数符合该模式约定；`./tool-win-shell.mjs` 包装器存在且
 * re-export `win-shell-mcp/plugin`。
 *
 * 覆盖 wshell-standard（剔除 3 meta，58 域工具）与 wshell-batch（放行
 * batch_run，只剔除 2 meta；persona 含批量规则），按模式参数化断言。
 * win-shell 贡献数由 registry 推导（builtinTools.length − exclude 数），
 * 避免魔法数与注册实现漂移（单一来源）。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateAgentCordis, ROW_RE, META_RE, NAME_RE, unquote } from "../../src/dsh-bundle/schema.js";
import { builtinTools } from "../../src/registry.js";
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

/** win-shell-mcp 侧 3 个 meta 工具名（registry 的 builtinTools.length = 58 域 + 3 meta）。 */
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

/** 每个 preset 目录的契约基线（persona 1 段 + win-shell + fs/web/lsp 三组）。 */
const ROLE_ROWS = ["persona", "tool-win-shell", "tool-fs", "tool-web", "tool-lsp"];
/** DSH 原生补缺组常数（fs 4 + web 2 + lsp 1）。 */
const NATIVE_GAP_COUNT = 4 + 2 + 1;

/** 各模式期望（裁定向见工单 05 评论：批量模式放行 batch_run，故多 1 工具）。 */
interface ModeSpec {
  id: string;
  /** tool-win-shell 行应剔除的 meta 工具。 */
  exclude: string[];
  /** preset.yml 显示名。 */
  displayName: string;
  /** persona 是否须含批量规则（batch_run 一次完成）。 */
  batchRule: boolean;
}

const MODES: ModeSpec[] = [
  {
    id: "wshell-standard",
    exclude: ["batch_run", "tool_groups", "list_domain_tools"],
    displayName: "WShell 标准模式",
    batchRule: false,
  },
  {
    id: "wshell-batch",
    exclude: ["tool_groups", "list_domain_tools"],
    displayName: "WShell 批量模式",
    batchRule: true,
  },
];

describe.each(MODES)("$id preset", (mode) => {
  const dir = join(PRESETS_ROOT, mode.id);
  const agent = join(dir, "agent.cordis.yml");
  // win-shell 贡献 = registry 全量 − exclude 剔除数（单一来源，勿手写魔法数）
  const winShellCount = builtinTools.length - mode.exclude.length;
  const totalDir = winShellCount + NATIVE_GAP_COUNT;

  it("agent.cordis.yml 存在且通过结构校验", () => {
    expect(existsSync(agent)).toBe(true);
    const problems = validateAgentCordis(readFileSync(agent, "utf8"));
    expect(problems).toEqual([]);
  });

  it("目录构成：persona + tool-win-shell + fs/web/lsp 三组", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    expect(rows.map((r) => r.id)).toEqual(ROLE_ROWS);
  });

  it("tool-win-shell exclude 符合模式约定", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const toolWinShell = rows.find((r) => r.id === "tool-win-shell");
    expect(toolWinShell?.exclude).toEqual(mode.exclude);
  });

  it(`按 exclude 注册 win-shell = ${winShellCount}，目录共 ${totalDir}`, () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const exclude = rows.find((r) => r.id === "tool-win-shell")?.exclude ?? [];
    const { ctx, defined } = makeFakeCtx();
    pluginApply(ctx, { exclude });
    expect(defined.size).toBe(winShellCount);
    for (const meta of META_TOOLS) {
      expect(defined.has(meta)).toBe(!exclude.includes(meta));
    }
  });

  it("persona 对齐官方 Minimal，目录符合模式约定", () => {
    const text = readFileSync(agent, "utf8").replace(/\r\n/g, "\n");
    const personaBlock = personaSubtree(text);
    expect(personaBlock).toMatch(/text:\s*You are a helpful software engineer assistant\./);
    // 对齐官方 Minimal：complete 视为完整系统提示、不注入运行时上下文
    expect(personaBlock).toMatch(/complete:\s*true/);
    expect(personaBlock).toMatch(/includeRuntimeContext:\s*false/);
    if (mode.batchRule) {
      // 批量模式：persona 注入一条 batch_run 优先规则（非工具映射表）
      expect(personaBlock).toMatch(/优先用 batch_run 一次完成/);
      expect(personaBlock).not.toMatch(/tool_groups|list_domain_tools/);
    } else {
      // 极简模式：单行 text 配置，不允许规则堆砌
      expect(personaBlock.trim().length).toBeLessThan(200);
      expect(personaBlock).not.toMatch(/batch_run|tool_groups|list_domain_tools/);
    }
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
    expect(readFileSync(preset, "utf8")).toContain(`name: ${mode.displayName}`);
  });

  it("所有行 name 可被 dsh loader 接受", () => {
    for (const row of parseRows(readFileSync(agent, "utf8"))) {
      expect(row.name, `row ${row.id}`).toMatch(NAME_RE);
    }
  });
});
