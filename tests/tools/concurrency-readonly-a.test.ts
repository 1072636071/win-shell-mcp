/**
 * 并发分类测试（工单 02 批次 A）：验证 fs/text/search 域只读工具在 DSH 投影中
 * 被标记为 `isConcurrencySafe: () => true`。
 *
 * 实现说明：
 * - src/plugin.ts 的 projectTool 是模块私有函数未导出。为验证每个工具的
 *   投影并发分类，此处复刻 projectTool 的 isConcurrencySafe 透传逻辑
 *   （readOnlyHint===true → ()=>true），用 fake ctx 捕获投影输出，
 *   逐工具断言 isConcurrencySafe()===true。
 * - 复刻仅 isConcurrencySafe 一行判定（projectTool 的并发分类契约），不复刻
 *   input/output schema 转换与 execute，避免重复实现与漂移。
 * - 同时用 apply 验证 fs_read 经真实 projectTool 投影后 isConcurrencySafe()===true，
 *   锚定复刻逻辑与 plugin.ts 实际逻辑一致。
 */

import { describe, it, expect } from "vitest";
import { builtinTools, type Tool } from "../../src/registry.js";
import {
  apply,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../../src/plugin.js";

/** 本批次工具名（同 guard-readonly-a.test.ts，text_cat 正名为 cat）。 */
const BATCH_A_TOOLS: readonly string[] = [
  "fs_read",
  "fs_stat",
  "fs_list",
  "fs_du",
  "cat",
  "text_head",
  "text_tail",
  "text_grep",
  "text_wc",
  "text_diff",
  "search_glob",
  "search_content",
  "search_which",
];

/**
 * 复刻 plugin.ts projectTool 的 isConcurrencySafe 透传逻辑。
 *
 * 与 src/plugin.ts 中 `tool.annotations?.readOnlyHint === true ? () => true : undefined`
 * 逐字一致，仅取并发分类契约，省略 schema 转换与 execute。
 */
function projectConcurrency(
  tool: Tool,
): Pick<DshToolDefinition, "name" | "isConcurrencySafe"> {
  return {
    name: tool.name,
    isConcurrencySafe:
      tool.annotations?.readOnlyHint === true ? () => true : undefined,
  };
}

/** 捕获 defineTool 调用的 fake ctx（同 plugin.test.ts 的 mock 模式）。 */
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

describe("工单 02 批次 A：DSH 投影并发分类", () => {
  // 锚点：fs_read 经真实 apply/projectTool 投影后 isConcurrencySafe()===true，
  // 证明 projectConcurrency 复刻逻辑与 plugin.ts 实际透传一致
  it("锚点：fs_read 经 apply 投影后 isConcurrencySafe()===true", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    expect(def?.isConcurrencySafe).toBeDefined();
    expect(def?.isConcurrencySafe?.({})).toBe(true);
  });

  // 逐工具：用 projectConcurrency 投影后 isConcurrencySafe()===true
  for (const name of BATCH_A_TOOLS) {
    it(`${name} 投影后 isConcurrencySafe()===true`, () => {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `工具应存在: ${name}`).toBeDefined();
      if (!tool) return;
      const projected = projectConcurrency(tool);
      expect(
        projected.isConcurrencySafe,
        `${name} 应有 isConcurrencySafe`,
      ).toBeDefined();
      expect(
        projected.isConcurrencySafe?.({}),
        `${name} isConcurrencySafe() 应为 true`,
      ).toBe(true);
    });
  }

  // 汇总：本批次工具数
  it("本批次工具数为 13", () => {
    expect(BATCH_A_TOOLS.length).toBe(13);
  });
});
