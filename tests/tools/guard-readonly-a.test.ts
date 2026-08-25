/**
 * Guard test（工单 02 批次 A）：覆盖 fs/text/search 域只读工具。
 *
 * 断言本批次每个工具：
 * - outputSchema 非空（defined）
 * - annotations.readOnlyHint === true（显式 true，不是 undefined）
 *
 * 遍历本批次工具名列表，从 builtinTools 中查找并断言，避免漏盖。
 */

import { describe, it, expect } from "vitest";
import { builtinTools } from "../../src/registry.js";

/**
 * 本批次工具名（按 Tool.name 字段）。
 *
 * 注：text_cat 的正名是 `cat`（aliases 含 `text_cat`），故此处用 `cat`。
 */
const BATCH_A_TOOLS: readonly string[] = [
  // fs 域
  "fs_read",
  "fs_stat",
  "fs_list",
  "fs_du",
  // text 域（cat 的正名即 cat，aliases 含 text_cat）
  "cat",
  "text_head",
  "text_tail",
  "text_grep",
  "text_wc",
  "text_diff",
  // search 域
  "search_glob",
  "search_content",
  "search_which",
];

describe("工单 02 批次 A：只读工具 guard", () => {
  // 先断言本批次工具全部存在于 builtinTools，避免名称漂移导致静默漏盖
  it("本批次工具全部注册于 builtinTools", () => {
    for (const name of BATCH_A_TOOLS) {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `工具应存在: ${name}`).toBeDefined();
    }
  });

  // 逐工具断言 outputSchema 非空 + readOnlyHint 显式 true
  for (const name of BATCH_A_TOOLS) {
    describe(`工具 ${name}`, () => {
      const tool = builtinTools.find((t) => t.name === name);

      it("outputSchema 非空", () => {
        expect(tool, `工具应存在: ${name}`).toBeDefined();
        expect(tool?.outputSchema, `${name} 应声明 outputSchema`).toBeDefined();
      });

      it("annotations.readOnlyHint === true（显式 true）", () => {
        expect(tool, `工具应存在: ${name}`).toBeDefined();
        expect(
          tool?.annotations?.readOnlyHint,
          `${name} readOnlyHint 应为显式 true`,
        ).toBe(true);
      });
    });
  }

  // 汇总断言：本批次工具数符合预期（防止列表意外增删）
  it("本批次工具数为 13", () => {
    expect(BATCH_A_TOOLS.length).toBe(13);
  });
});
