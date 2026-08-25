/**
 * 只读工具批量 B MCP 投影抽样测试（工单 03）。
 *
 * 从 listTools() 输出抽样 3 个工具（system_info、git_status、net_dns），
 * 断言 outputSchema 非空且 annotations.readOnlyHint === true。
 *
 * 验证 server.ts listTools 的条件透传：工具声明了 outputSchema/annotations 时
 * 附在 MCP 工具条目上。抽样 3 个代表不同域（system/git/net），覆盖透传链路。
 *
 * 与工单 02 的 projection-readonly-a.test.ts 独立，抽样不同工具。
 */

import { describe, it, expect } from "vitest";
import { listTools } from "../../src/server.js";

/** 抽样工具名（覆盖 system/git/net 三个域）。 */
const SAMPLE_TOOLS = ["system_info", "git_status", "net_dns"] as const;

describe("只读工具批量 B MCP 投影抽样", () => {
  const listed = listTools();
  const byName = new Map(listed.map((t) => [t.name, t]));

  it("listTools 返回非空工具列表", () => {
    expect(listed.length).toBeGreaterThan(0);
  });

  for (const name of SAMPLE_TOOLS) {
    describe(`抽样 ${name}`, () => {
      it("出现在 listTools 输出中", () => {
        expect(byName.has(name), `${name} 应在 listTools 输出中`).toBe(true);
      });

      it("outputSchema 非空（条件透传）", () => {
        const entry = byName.get(name);
        expect(
          entry!.outputSchema,
          `${name} outputSchema 应透传`,
        ).toBeDefined();
        // outputSchema 应为 JSON schema 对象（含 type 或 properties）
        const schema = entry!.outputSchema as Record<string, unknown>;
        expect(typeof schema).toBe("object");
        expect(schema["type"]).toBe("object");
        expect(schema["properties"]).toBeDefined();
      });

      it("annotations.readOnlyHint === true（条件透传）", () => {
        const entry = byName.get(name);
        expect(entry!.annotations, `${name} annotations 应透传`).toBeDefined();
        expect(entry!.annotations!.readOnlyHint).toBe(true);
      });
    });
  }
});
