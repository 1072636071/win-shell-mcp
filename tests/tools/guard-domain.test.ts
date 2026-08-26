/**
 * 域护栏测试（工单 01 域元数据地基）：沿用 guard-mutating.test.ts 的全量遍历模式。
 *
 * 断言：
 * - 每个工具 domain 非空，且取值在「15 命令域 | "meta"」枚举内；
 * - 15 个命令域每个至少有 1 个工具（防空壳域）；
 * - 域计数总和 + 现存 meta 工具数 = 内置工具总数
 *   （01 落地时点：58 域工具 + batch_run 1 meta = 59；
 *    03 号已落地：58 域工具 + 3 meta（batch_run/tool_groups/list_domain_tools）
 *    = 61，算术依据 PRD 测试决策 4）；
 * - CONTEXT.md 的 15 域基线与 registry 的 COMMAND_DOMAINS 一致。
 *
 * 基线更新规则：CONTEXT.md 命令域或工具总数基线变化时，须同步修改下方
 * EXPECTED_DOMAIN_COUNT / EXPECTED_TOTAL_TOOLS 常量并更新注释来源。
 */

import { describe, it, expect } from "vitest";
import {
  builtinTools,
  COMMAND_DOMAINS,
} from "../../src/registry.js";

/** 命令域基线数：15。来源：CONTEXT.md 术语表「命令域」（ADR-0006 成域闸门）。 */
const EXPECTED_DOMAIN_COUNT = 15;

/** 内置工具总数锚点：61。来源：registry 实测（= tests/integration/server.test.ts 的 EXPECTED_TOOL_COUNT）；工单 11-03 新增 2 个 meta 后由 59 抬到 61（58 域 + 3 meta）。 */
const EXPECTED_TOTAL_TOOLS = 61;

/** 合法 domain 枚举值全集：15 命令域 + meta 名额。 */
const VALID_DOMAINS: readonly string[] = [...COMMAND_DOMAINS, "meta"];

describe("工单 01 域护栏：domain 元数据", () => {
  it(`COMMAND_DOMAINS 含 ${EXPECTED_DOMAIN_COUNT} 个命令域（CONTEXT.md 基线）`, () => {
    expect(COMMAND_DOMAINS.length).toBe(EXPECTED_DOMAIN_COUNT);
  });

  it(`builtinTools 总数为 ${EXPECTED_TOTAL_TOOLS}`, () => {
    expect(builtinTools.length).toBe(EXPECTED_TOTAL_TOOLS);
  });

  it('"meta" 不是命令域（不占域名额）', () => {
    expect(COMMAND_DOMAINS).not.toContain("meta");
  });

  // 全量遍历：每个工具的 domain 非空且在枚举内
  describe("全量遍历：domain 非空且在枚举内", () => {
    for (const tool of builtinTools) {
      it(`${tool.name} 声明了非空 domain`, () => {
        expect(tool.domain, `${tool.name} 应声明 domain`).toBeTruthy();
        expect(typeof tool.domain, `${tool.name} domain 应为字符串`).toBe(
          "string",
        );
      });

      it(`${tool.name}.domain 在「15 域 | meta」枚举内（实际: ${String(tool.domain)}）`, () => {
        expect(
          VALID_DOMAINS,
          `${tool.name}.domain=${String(tool.domain)} 不在合法枚举内`,
        ).toContain(tool.domain);
      });
    }
  });

  it("15 个命令域每个至少有 1 个工具", () => {
    for (const domain of COMMAND_DOMAINS) {
      const count = builtinTools.filter((t) => t.domain === domain).length;
      expect(count, `域 ${domain} 应至少有 1 个工具`).toBeGreaterThan(0);
    }
  });

  it("batch_run 标记为 meta（编排类元工具不占域名额）", () => {
    const batch = builtinTools.find((t) => t.name === "batch_run");
    expect(batch, "batch_run 应已注册").toBeDefined();
    expect(batch?.domain).toBe("meta");
  });

  it("tool_groups / list_domain_tools 标记为 meta（域导航元工具不占域名额，工单 11-03）", () => {
    for (const name of ["tool_groups", "list_domain_tools"] as const) {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `${name} 应已注册`).toBeDefined();
      expect(tool?.domain, `${name} 应标记 meta`).toBe("meta");
      // 只读护栏（guard-mutating 断言 readOnlyHint===true）之外的语义补充：
      // 导航元工具不得归属任何命令域。
      expect(COMMAND_DOMAINS).not.toContain(tool?.domain);
    }
  });

  it("域计数总和 + 现存 meta 数 = 内置工具总数（无未归域/漏计工具）", () => {
    const domainToolSum = COMMAND_DOMAINS.reduce(
      (sum, domain) =>
        sum + builtinTools.filter((t) => t.domain === domain).length,
      0,
    );
    const metaCount = builtinTools.filter((t) => t.domain === "meta").length;
    // 03 号已落地的现状基线：58 域工具 + 3 meta = 61（PRD 测试决策 4）。
    expect(domainToolSum + metaCount).toBe(builtinTools.length);
    expect(domainToolSum + metaCount).toBe(EXPECTED_TOTAL_TOOLS);
  });
});
