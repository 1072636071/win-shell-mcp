/**
 * 只读工具批量 B 并发分类测试（工单 03）。
 *
 * 验证本批次工具在 DSH 投影中被标记为 parallel（isConcurrencySafe()===true）。
 *
 * 实现说明：
 * plugin.ts 的 projectTool 是模块私有函数未导出。故采用组合验证：
 * - (a) 本批次每个工具 annotations.readOnlyHint === true
 * - (b) 通过 apply(fs_read) 用 mock ctx 捕获 projectTool 输出，
 *       验证 readOnlyHint===true 的工具投影后 isConcurrencySafe()===true
 * - projectTool 对所有工具用同一决策行：
 *       `tool.annotations?.readOnlyHint === true ? () => true : undefined`
 *   (a) + (b) ⇒ 本批次工具投影 isConcurrencySafe()===true
 *
 * 与工单 02 的 concurrency-readonly-a.test.ts 独立，覆盖不同工具集。
 */

import { describe, it, expect } from "vitest";
import { builtinTools } from "../../src/registry.js";
import {
  apply,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../../src/plugin.js";

/** 本批次工具名清单（18 个）。 */
const BATCH_B_TOOLS = [
  "system_info",
  "system_disk",
  "system_memory",
  "system_path",
  "env_get",
  "pwd",
  "echo",
  "net_dns",
  "net_tcp",
  "net_listen",
  "ping",
  "pkg_detect",
  "process_list",
  "git_status",
  "git_log",
  "git_branch",
  "git_diff",
  "hash_file",
  "json_get",
] as const;

/** 捕获 defineTool 调用的 fake ctx（复用 plugin.test.ts 的 mock 模式）。 */
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

describe("只读工具批量 B 并发分类", () => {
  // (a) 本批次工具的 readOnlyHint 均为 true
  for (const name of BATCH_B_TOOLS) {
    it(`${name} annotations.readOnlyHint === true（并发安全输入）`, () => {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `工具 ${name} 应存在`).toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBe(true);
    });
  }

  // (b) projectTool 把 readOnlyHint===true 透传为 isConcurrencySafe: ()=>true
  // 通过 apply 的 fs_read 验证决策逻辑（与本批次工具走同一 projectTool 代码路径）
  describe("projectTool isConcurrencySafe 透传（经 fs_read 样例验证）", () => {
    it("readOnlyHint===true 的工具投影后 isConcurrencySafe()===true", () => {
      const { ctx, defined } = makeFakeCtx();
      apply(ctx);
      const def = defined.get("fs_read");
      expect(def, "fs_read 应被 apply 注册").toBeDefined();
      expect(
        def!.isConcurrencySafe,
        "readOnlyHint 工具应有 isConcurrencySafe",
      ).toBeDefined();
      expect(def!.isConcurrencySafe!({})).toBe(true);
    });

    it("apply 全量注册（工单 05 移除白名单后，本批次工具均已注册）", () => {
      const { ctx, defined } = makeFakeCtx();
      apply(ctx);
      // 工单 05 移除白名单后全量注册，fs_read 与 system_info 均注册
      expect(defined.has("fs_read")).toBe(true);
      expect(defined.has("system_info")).toBe(true);
    });
  });

  // 组合结论：本批次工具投影后均应 isConcurrencySafe()===true
  it("组合结论：本批次 19 个工具投影后均 isConcurrencySafe()===true", () => {
    // projectTool 决策行：tool.annotations?.readOnlyHint === true ? () => true : undefined
    // 已由上方 (a) 确认本批次工具 readOnlyHint 全为 true，
    // 由 (b) 确认 projectTool 对 readOnlyHint===true 透传 isConcurrencySafe: ()=>true。
    // 故本批次工具投影后 isConcurrencySafe()===true。
    const allReadOnly = BATCH_B_TOOLS.every((name) => {
      const tool = builtinTools.find((t) => t.name === name);
      return tool?.annotations?.readOnlyHint === true;
    });
    expect(allReadOnly, "本批次工具应全部 readOnlyHint===true").toBe(true);
    expect(BATCH_B_TOOLS.length).toBe(19);
  });
});
