/**
 * WShell preset 结构测试：校验真实 bundled preset 文件的契约。
 *
 * 每个 preset 目录必须满足：agent.cordis.yml 通过 validateAgentCordis、
 * persona 极简（对齐官方 Minimal 的 complete/includeRuntimeContext）、
 * 目录构成与工具数符合该模式约定；`./tool-win-shell.mjs` 包装器存在且
 * re-export `win-shell-mcp/plugin`。
 *
 * 覆盖 wshell-standard（剔除 3 meta，58 域工具）与 wshell-batch（放行
 * batch_run，只剔除 2 meta），按模式参数化断言。两模式 persona **逐字相同**：
 * 批量差异只在目录，「多步优先一次完成」的引导由 batch_run 工具描述独占
 * （persona 复述即双写，且 MCP 形态没有 persona）。
 * win-shell 贡献数由 registry 推导（builtinTools.length − exclude 数），
 * 避免魔法数与注册实现漂移（单一来源）。
 *
 * 全量模式 persona 额外承载 plan 政策与后台并行委派两条 guidance：它的
 * `complete: true` 会把 dsh 原生工具的 prompt section 排除在渲染之外。其中
 * plan 条款必须与 dsh-plan-mode 必填的 `section` 值逐字同源（该值在 complete
 * 下不渲染，只是配置形状），由同源断言把守。
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

/**
 * 提取某个键的标量文本，兼容同行标量（`key: value`）与折叠标量（`key: >-`）。
 *
 * persona 契约要按文本本身断言（长度、跨模式逐字一致），而不是按 YAML 子树
 * 长度——后者把键名与注释都算进去，会把"加一行注释"误判成"规则堆砌"。
 * @param lines 已按行切分的 YAML 文本
 * @param start 从哪一行开始向后找该键
 * @param key 目标键名
 * @returns 折叠为单行的标量文本
 */
function scalarValue(lines: readonly string[], start: number, key: string): string {
  const head = new RegExp(`^(\\s*)${key}:(\\s*)(>-|>\\+|\\|)?(.*)$`);
  for (let index = start; index < lines.length; index += 1) {
    const match = head.exec(lines[index]!);
    if (match === null) continue;
    const [, indent, , block, inline] = match;
    if (block === undefined || block === "") {
      return (inline ?? "").trim();
    }
    const deeper = new RegExp(`^\\s{${(indent ?? "").length + 1},}\\S`);
    const body: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!;
      if (line.trim() === "") break;
      if (!deeper.test(line)) break;
      body.push(line.trim());
    }
    return body.join(" ");
  }
  throw new Error(`未找到键 ${key}`);
}

/** 提取 persona 的 `text` 值（生效的系统提示正文）。 */
function personaText(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^-\s+id:\s*persona\s*$/.test(line));
  return scalarValue(lines, start, "text");
}

/** 提取 plan-mode 行的 `section` 值（dsh-plan-mode 必填的部署政策文本）。 */
function planSectionText(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\s*-\s+id:\s*plan-mode\s*$/.test(line));
  return scalarValue(lines, start, "section");
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

/** 每个 preset 目录的契约基线（persona 1 段 + win-shell + fs/web 两组，标准/批量模式不纳入可选的 lsp）。 */
const ROLE_ROWS = ["persona", "tool-win-shell", "tool-fs", "tool-web"];
/** DSH 原生补缺组常数（fs 4 + web 2；lsp 为可选能力，标准/批量模式不纳入）。 */
const NATIVE_GAP_COUNT = 4 + 2;

/** 各模式期望（裁定向见工单 05 评论：批量模式放行 batch_run，故多 1 工具）。 */
interface ModeSpec {
  id: string;
  /** tool-win-shell 行应剔除的 meta 工具。 */
  exclude: string[];
  /** preset.yml 显示名。 */
  displayName: string;
}

const MODES: ModeSpec[] = [
  {
    id: "wshell-standard",
    exclude: ["batch_run", "tool_groups", "list_domain_tools"],
    displayName: "WShell 标准模式",
  },
  {
    id: "wshell-batch",
    exclude: ["tool_groups", "list_domain_tools"],
    displayName: "WShell 批量模式",
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

  it("目录构成：persona + tool-win-shell + fs/web 两组", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    expect(rows.map((r) => r.id)).toEqual(ROLE_ROWS);
  });

  it("tool-win-shell exclude 符合模式约定，且注入相对路径基准", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const toolWinShell = rows.find((r) => r.id === "tool-win-shell");
    expect(toolWinShell?.exclude).toEqual(mode.exclude);
    // persona 声明 {{cwd}}，基准就必须由本行注入；两者缺一即成假话。
    expect(readFileSync(agent, "utf8")).toContain(
      "cwd: !!js process.env.DSH_CWD ?? process.cwd()",
    );
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
    // 对齐官方 Minimal：complete 视为完整系统提示、不注入运行时上下文
    expect(personaBlock).toMatch(/complete:\s*true/);
    expect(personaBlock).toMatch(/includeRuntimeContext:\s*false/);
    const persona = personaText(text);
    expect(persona).toBe(
      "You are a helpful software engineer assistant. Relative paths resolve against {{cwd}}.",
    );
    // 极简的度量落在正文：只允许身份 + 路径基准两句，规则堆砌即红。
    expect(persona.length).toBeLessThan(120);
    expect(persona).toContain("{{cwd}}");
    expect(persona).not.toMatch(/batch_run|tool_groups|list_domain_tools/);
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

it("标准与批量模式的 persona 逐字相同（差异只在目录）", () => {
  const [standard, batch] = MODES.map((mode) =>
    personaText(
      readFileSync(join(PRESETS_ROOT, mode.id, "agent.cordis.yml"), "utf8").replace(/\r\n/g, "\n"),
    ),
  );
  expect(batch).toBe(standard);
});

/**
 * WShell 全量模式：目录构成与 standard/batch（persona + tool-win-shell +
 * fs/web 两组，共 4 顶层行）不同——它是 DSH 官方 `standard`（完整编码
 * agent）原生组合 + win-shell 58 域工具，顶层含大量原生工具行与 cordis:group
 * 组。故独立 describe，聚焦：结构校验、persona 内容、win-shell 注册 58、
 * 关键原生行存在、不含 experimental/opt-in 包。
 */
describe("wshell-full preset", () => {
  const dir = join(PRESETS_ROOT, "wshell-full");
  const agent = join(dir, "agent.cordis.yml");
  const read = (): string => readFileSync(agent, "utf8").replace(/\r\n/g, "\n");

  /** 全量模式顶层须含的 DSH core 原生行 id（官方 standard 组合，不含组内子行）。 */
  const CORE_NATIVE_ROWS = [
    "tool-bash",
    "tool-pwsh",
    "tool-fs",
    "tool-fs-search",
    "tool-jobs",
    "skill-filesystem",
    "tool-skill",
    "tool-goal",
    "planning",
    "delegation",
    "tool-ask-user",
    "tool-todo",
    "tool-web",
  ];
  /** 组内（cordis:group 嵌套）原生行——parseRows 只解析顶层，故按文本匹配。 */
  const NESTED_NATIVE_IDS = [
    "tool-subagent",
    "tool-subagent-fork",
    "tool-workflow",
    "tool-ralph",
  ];
  /** 全量应为空的 experimental/opt-in 包行 id（工单 06 口径：剔除）。 */
  const EXCLUDED_ROWS = [
    "tool-cordis",
    "tool-agent-team",
  ];

  it("agent.cordis.yml 存在且通过结构校验", () => {
    expect(existsSync(agent)).toBe(true);
    expect(validateAgentCordis(readFileSync(agent, "utf8"))).toEqual([]);
  });

  it("目录构成：persona + tool-win-shell + DSH core 原生行", () => {
    const text = readFileSync(agent, "utf8");
    const rows = parseRows(text);
    const ids = rows.map((r) => r.id);
    expect(ids[0]).toBe("persona");
    expect(ids).toContain("tool-win-shell");
    for (const id of CORE_NATIVE_ROWS) {
      expect(ids, `missing native row ${id}`).toContain(id);
    }
    // 组内子行按文本锚点断言存在（parseRows 不可达）。
    for (const id of NESTED_NATIVE_IDS) {
      expect(text, `missing nested native row ${id}`).toMatch(new RegExp(`- id: ${id}\\s*$`, "m"));
    }
    for (const id of EXCLUDED_ROWS) {
      expect(ids, `unexpected experimental/opt-in row ${id}`).not.toContain(id);
      expect(text, `unexpected experimental/opt-in row ${id}`).not.toMatch(new RegExp(`- id: ${id}\\s*$`, "m"));
    }
  });

  it("tool-win-shell exclude 3 meta，win-shell 注册 58 域工具", () => {
    const rows = parseRows(readFileSync(agent, "utf8"));
    const exclude = rows.find((r) => r.id === "tool-win-shell")?.exclude ?? [];
    expect(exclude).toEqual(["batch_run", "tool_groups", "list_domain_tools"]);
    const { ctx, defined } = makeFakeCtx();
    pluginApply(ctx, { exclude });
    // registry 全量 − 3 exclude → 58 域工具（单一来源，勿手写魔法数）
    expect(defined.size).toBe(builtinTools.length - 3);
    for (const meta of META_TOOLS) expect(defined.has(meta)).toBe(false);
  });

  it("persona 承载身份 + 路径基准 + 本模式必要的两条 guidance", () => {
    const text = read();
    const personaBlock = personaSubtree(text);
    expect(personaBlock).toMatch(/complete:\s*true/);
    expect(personaBlock).toMatch(/includeRuntimeContext:\s*false/);
    const persona = personaText(text);
    expect(persona.startsWith("You are a helpful software engineer assistant.")).toBe(true);
    // complete:true 会丢弃 dsh 原生工具的 prompt section，plan 政策与后台委派
    // 默认只能由 persona 自己承载，否则模型拿到 schema 却拿不到用法边界。
    expect(persona).toContain("Relative paths resolve against {{cwd}}");
    expect(persona).toContain("While plan mode is active");
    expect(persona).toContain("Delegate with subagent in the background by default");
    expect(persona).not.toMatch(/batch_run|tool_groups|list_domain_tools/);
  });

  it("persona 的 plan 条款与 dsh-plan-mode 必填 section 逐字同源", () => {
    // 该 section 在 complete:true 下不参与渲染，只是 dsh-plan-mode 的必填形状；
    // 与 persona 同文才能保证哪天不再 complete 时两处不会各自漂移。
    const text = read();
    expect(personaText(text)).toContain(planSectionText(text));
    expect(text).toContain("cwd: !!js process.env.DSH_CWD ?? process.cwd()");
  });

  it("tool-win-shell 行通过 ./tool-win-shell.mjs 包装器", () => {
    expect(read()).toContain("name: ./tool-win-shell.mjs");
    const wrapper = join(dir, "tool-win-shell.mjs");
    expect(existsSync(wrapper)).toBe(true);
    expect(readFileSync(wrapper, "utf8")).toContain("win-shell-mcp/plugin");
  });

  it("preset.yml 存在且含显示名", () => {
    const preset = join(dir, "preset.yml");
    expect(existsSync(preset)).toBe(true);
    expect(readFileSync(preset, "utf8")).toContain("name: WShell 全量模式");
  });

  it("所有行 name 可被 dsh loader 接受", () => {
    for (const row of parseRows(read())) {
      expect(row.name, `row ${row.id}`).toMatch(NAME_RE);
    }
  });
});
