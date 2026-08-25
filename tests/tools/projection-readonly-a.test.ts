/**
 * MCP 投影抽样测试（工单 02 批次 A）：从 listTools() 输出中抽样 3 个工具，
 * 断言其 outputSchema 非空且 annotations.readOnlyHint === true。
 *
 * 抽样选取 fs_stat / text_grep / search_glob，分别代表 fs / text / search 三域，
 * 验证 server.ts listTools 的 outputSchema 与 annotations 条件透传链路。
 */

import { describe, it, expect } from "vitest";
import { listTools } from "../../src/server.js";

/** 抽样工具名（覆盖 fs/text/search 三域各一）。 */
const SAMPLE_TOOLS: readonly string[] = ["fs_stat", "text_grep", "search_glob"];

describe("工单 02 批次 A：MCP 投影抽样", () => {
  const listed = listTools();

  // 抽样工具全部出现在 listTools 输出中
  it("抽样工具全部出现在 listTools 输出中", () => {
    const names = new Set(listed.map((t) => t.name));
    for (const name of SAMPLE_TOOLS) {
      expect(names.has(name), `listTools 应含: ${name}`).toBe(true);
    }
  });

  for (const name of SAMPLE_TOOLS) {
    describe(`工具 ${name}`, () => {
      const entry = listed.find((t) => t.name === name);

      it("outputSchema 非空", () => {
        expect(entry, `listTools 应含: ${name}`).toBeDefined();
        expect(
          entry?.outputSchema,
          `${name} outputSchema 应透传`,
        ).toBeDefined();
        // outputSchema 应为 JSON schema 对象（type 字段存在）
        const schema = entry?.outputSchema as
          | Record<string, unknown>
          | undefined;
        expect(
          schema?.["type"],
          `${name} outputSchema 应是 JSON schema 对象`,
        ).toBeDefined();
      });

      it("annotations.readOnlyHint === true", () => {
        expect(entry, `listTools 应含: ${name}`).toBeDefined();
        expect(
          entry?.annotations?.readOnlyHint,
          `${name} readOnlyHint 应为 true`,
        ).toBe(true);
      });
    });
  }

  // 抽样数为 3
  it("抽样工具数为 3", () => {
    expect(SAMPLE_TOOLS.length).toBe(3);
  });
});
