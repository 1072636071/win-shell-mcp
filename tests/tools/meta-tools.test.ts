/**
 * 域导航元工具行为测试（工单 11-03）：tool_groups / list_domain_tools。
 *
 * 覆盖：
 * - tool_groups：15 域概览、域名与 01 工单枚举一致、toolCount 与 registry 的
 *   domain 字段统计一致、examples 确属该域（防文案漂移）、summary 非空；
 *   全量模式不附 visible 字段，懒模式（WIN_SHELL_LAZY=1）每域 visible=false。
 * - list_domain_tools：git 域返回 11 个条目且与 listTools() 条目深度相等
 *   （钉住「同形」验收）；非法 domain 返回 EINVAL。
 * - 两工具归属 meta 且只读（防漂移兜底，guard-mutating/guard-domain 亦覆盖）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { callTool, listTools } from "../../src/server.js";
import {
  COMMAND_DOMAINS,
  builtinTools,
  type Tool,
} from "../../src/registry.js";
import {
  createScopedListDomainToolsTool,
  listDomainToolsTool,
  listDomainToolsHandler,
} from "../../src/tools/list_domain_tools.js";
import {
  createScopedToolGroupsTool,
  toolGroupsTool,
} from "../../src/tools/tool_groups.js";
import { isFail, isOk } from "../../src/contract/output.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** 从统一输出契约中取成功 data（不含 ok）。 */
function dataOf(result: Awaited<ReturnType<typeof callTool>>) {
  if (!isOk(result)) throw new Error("预期成功结果，实际失败");
  const { ok: _ok, ...data } = result;
  return data;
}

describe("tool_groups 域概览", () => {
  it("返回 15 个分组且域名与 COMMAND_DOMAINS 枚举一致（含顺序）", async () => {
    const result = await callTool("tool_groups", {});
    expect(isOk(result)).toBe(true);
    const groups = dataOf(result)["groups"] as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(15);
    expect(groups.map((g) => g["domain"])).toEqual([...COMMAND_DOMAINS]);
  });

  it("各域 toolCount 与工具 domain 字段统计一致，总和为 58（61 − 3 meta）", async () => {
    const result = await callTool("tool_groups", {});
    const groups = dataOf(result)["groups"] as Array<{
      domain: string;
      toolCount: number;
    }>;
    for (const g of groups) {
      const actual = builtinTools.filter((t) => t.domain === g.domain).length;
      expect(g.toolCount, `域 ${g.domain} 的 toolCount 应与注册表一致`).toBe(
        actual,
      );
    }
    const total = groups.reduce((sum, g) => sum + g.toolCount, 0);
    expect(total).toBe(58);
  });

  it("每个分组 summary 非空、examples 非空且确属该域（防文案漂移）", async () => {
    const result = await callTool("tool_groups", {});
    const groups = dataOf(result)["groups"] as Array<{
      domain: string;
      summary: unknown;
      examples: string[];
    }>;
    for (const g of groups) {
      expect(String(g.summary).length, `域 ${g.domain} summary 应非空`).toBeGreaterThan(0);
      expect(g.examples.length, `域 ${g.domain} examples 应非空`).toBeGreaterThan(0);
      const domainTools = new Set(
        builtinTools.filter((t) => t.domain === g.domain).map((t) => t.name),
      );
      for (const example of g.examples) {
        expect(
          domainTools.has(example),
          `域 ${g.domain} 的示例 ${example} 不属于该域，DOMAIN_BRIEFS 文案漂移`,
        ).toBe(true);
      }
    }
  });

  it("全量模式（默认）不附 visible 字段（输出极简）", async () => {
    delete process.env["WIN_SHELL_LAZY"];
    const result = await callTool("tool_groups", {});
    const groups = dataOf(result)["groups"] as Array<Record<string, unknown>>;
    for (const g of groups) {
      expect(g["visible"], "全量模式下不应出现 visible 字段").toBeUndefined();
    }
  });

  it("懒模式（WIN_SHELL_LAZY=1）每域标注 visible=false", async () => {
    vi.stubEnv("WIN_SHELL_LAZY", "1");
    const result = await callTool("tool_groups", {});
    const groups = dataOf(result)["groups"] as Array<{
      domain: string;
      visible?: boolean;
    }>;
    for (const g of groups) {
      expect(g.visible, `懒模式下域 ${g.domain} 应标注 visible=false`).toBe(false);
    }
  });

  it("懒模式判定语义对齐配置模块：非 '1' 值仍为全量模式", async () => {
    vi.stubEnv("WIN_SHELL_LAZY", "true");
    const result = await callTool("tool_groups", {});
    const groups = dataOf(result)["groups"] as Array<{ visible?: boolean }>;
    expect(groups.every((g) => g.visible === undefined)).toBe(true);
  });
});

describe("list_domain_tools 域明细", () => {
  it("git 域返回 11 个条目", async () => {
    const result = await callTool("list_domain_tools", { domain: "git" });
    expect(isOk(result)).toBe(true);
    const data = dataOf(result);
    expect(data["domain"]).toBe("git");
    expect(data["tools"] as unknown[]).toHaveLength(11);
  });

  it("条目与 listTools() 投影逐字段深度相等（同形性验收）", async () => {
    const result = await callTool("list_domain_tools", { domain: "fs" });
    const tools = dataOf(result)["tools"] as Array<Record<string, unknown>>;
    // 期望值直接取自 server.listTools() 对同域子集的投影——同形即深度相等。
    const expected = listTools(
      builtinTools.filter((t) => t.domain === "fs"),
    ) as unknown as Array<Record<string, unknown>>;
    expect(tools).toEqual(expected);
    expect(tools.length).toBe(10); // fs 域现状 10 工具
    for (const entry of tools) {
      expect(typeof entry["name"]).toBe("string");
      expect(typeof entry["description"]).toBe("string");
      expect(entry["inputSchema"]).toBeDefined();
      expect(entry["outputSchema"]).toBeDefined();
      expect(entry["annotations"]).toBeDefined();
    }
  });

  it.each([
    ["meta 名额不是合法入参", "meta"],
    ["未知域名", "bogus_domain"],
    ["大写变体视为非法", "GIT"],
  ])("非法 domain（%s）返回 EINVAL", async (_label, domain) => {
    const result = await callTool("list_domain_tools", { domain });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("缺参返回 EINVAL（schema 校验路径）", async () => {
    const result = await callTool("list_domain_tools", {});
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("handler 防御路径：绕过 schema 直接调用同样 EINVAL", async () => {
    const result = await listDomainToolsHandler({ domain: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });
});

describe("两导航工具元数据", () => {
  for (const tool of [toolGroupsTool, listDomainToolsTool] as Tool[]) {
    it(`${tool.name} 归属 meta`, () => {
      expect(tool.domain).toBe("meta");
    });

    it(`${tool.name} 显式只读`, () => {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    });

    it(`${tool.name} description ≤150 字符（预算护栏口径一致）`, () => {
      expect(tool.description.length).toBeLessThanOrEqual(150);
    });
  }
});

// ---------------------------------------------------------------------------
// 工单 11-05：部署子表感知（scoped 副本）——白名单部署下的统计口径
// ---------------------------------------------------------------------------

/** 构造一个"白名单裁剪后"的部署子表：仅保留 fs/git 两域全部 + 全部 meta。 */
function fsGitPool(): readonly Tool[] {
  return builtinTools.filter(
    (t) =>
      t.domain === "fs" || t.domain === "git" || t.domain === "meta",
  );
}

describe("工单 11-05：scoped tool_groups 统计口径", () => {
  it("只输出非空域，toolCount 反映子表（空域不出现）", async () => {
    const scoped = createScopedToolGroupsTool(fsGitPool());
    const result = await scoped.handler({});
    expect(isOk(result)).toBe(true);
    const groups = (dataOf(result)["groups"] ?? []) as Array<{
      domain: string;
      toolCount: number;
    }>;
    expect(groups.map((g) => g.domain)).toEqual(["fs", "git"]);
    for (const g of groups) {
      const expected = builtinTools.filter(
        (t) => t.domain === g.domain && fsGitPool().includes(t),
      ).length;
      expect(g.toolCount).toBe(expected);
    }
  });

  it("精选示例被部分裁剪时只保留可见者；全部被裁时回退为域内现存前 2 个", async () => {
    // fs 精选示例为 fs_list/fs_read/fs_write：仅保留 fs_read → 示例 ['fs_read']
    // text 精选示例为 text_grep/text_replace/cat：一个不剩，仅保留 text_head → 回退 ['text_head']
    const pool = builtinTools.filter(
      (t) =>
        ["fs_read", "text_head", "pwd"].includes(t.name) ||
        t.domain === "meta",
    );
    const scoped = createScopedToolGroupsTool(pool);
    const result = await scoped.handler({});
    const groups = (dataOf(result)["groups"] ?? []) as Array<{
      domain: string;
      examples: string[];
    }>;
    const byDomain = new Map(groups.map((g) => [g.domain, g.examples]));
    expect(byDomain.get("fs")).toEqual(["fs_read"]);
    expect(byDomain.get("text")).toEqual(["text_head"]);
    // 每个出现的分组示例都指向子表内真实存在的工具
    for (const g of groups) {
      for (const example of g.examples) {
        expect(pool.some((t) => t.name === example)).toBe(true);
      }
    }
  });

  it("全量子表下 scoped 与默认 handler 输出深度相等（零破坏不变量）", async () => {
    const scopedResult = await createScopedToolGroupsTool(builtinTools).handler({});
    const defaultResult = await toolGroupsTool.handler({});
    expect(dataOf(scopedResult)).toEqual(dataOf(defaultResult));
  });
});

describe("工单 11-05：scoped list_domain_tools 可见性口径", () => {
  it("只返回子表内可见工具；域被裁干净时返回空数组（响错误）", async () => {
    const pool = fsGitPool();
    const scoped = createScopedListDomainToolsTool(pool);
    const gitResult = await scoped.handler({ domain: "git" });
    const gitData = dataOf(gitResult) as { domain: string; tools: unknown[] };
    expect(gitData.domain).toBe("git");
    // git 域在 fsGitPool 中完整保留 → 条目数与全量 git 域一致（11 个）
    expect(gitData.tools).toHaveLength(11);

    const netScoped = createScopedListDomainToolsTool(fsGitPool());
    const netResult = await netScoped.handler({ domain: "net" });
    const netData = dataOf(netResult) as { domain: string; tools: unknown[] };
    // net 域整体被裁 → 空数组 + 域名照实回显（响错误而非报错）
    expect(netData.tools).toEqual([]);
  });

  it("EINVAL 防御在 scoped 副本同样生效", async () => {
    const scoped = createScopedListDomainToolsTool(fsGitPool());
    const result = await scoped.handler({ domain: "nope" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) expect(result.error.code).toBe("EINVAL");
  });

  it("副本仅替换 handler，listTools 投影与原工具无差别", () => {
    const pool = fsGitPool();
    for (const [scoped, original] of [
      [createScopedToolGroupsTool(pool), toolGroupsTool],
      [createScopedListDomainToolsTool(pool), listDomainToolsTool],
    ] as const) {
      expect(listTools([scoped])).toEqual(listTools([original]));
    }
  });
});
