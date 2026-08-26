/**
 * 元数据预算护栏（工单 01）。
 *
 * 断言每个工具：
 * - description 非空且 ≤150 字符（软上限）；长陷阱语义工具在 DESCRIPTION_EXCEPTIONS 中显式豁免
 * - `JSON.stringify(listTools())` 总量 ≤ METADATA_BUDGET 预算常量
 *
 * 预算常量先取实测现状基线（防漂移），02 号精简工单收紧至基线 ×0.7。
 * 基线测量与收紧记录见 `.scratch/08-tool-metadata-slimming/issues/01` 评论区。
 */

import { describe, it, expect } from "vitest";
import { listTools } from "../../src/server.js";
import { builtinTools } from "../../src/registry.js";

/**
 * 元数据总预算：`JSON.stringify(listTools())` 字符数。
 *
 * 基线：2026-08-26 精简前实测 56277。
 * 02 号精简工单目标 基线 ×0.7（≤39393）；实测 49769（降幅 11.56%），
 * 未达 30% 目标，用户已同意放宽基线至实测值，后续工单可继续收紧。
 */
const METADATA_BUDGET = 49769;

/** description 长度软上限（字符）。 */
const DESCRIPTION_MAX = 150;

/**
 * 超长 description 显式豁免清单（工具名 → 豁免理由）。
 *
 * 原则：仅当字段名 + 类型表达不了的陷阱语义确实需要保留时才豁免；
 * 豁免工具必须真实超长（下方有防死豁免断言），精简后应立即移除。
 */
const DESCRIPTION_EXCEPTIONS: Readonly<Record<string, string>> = {
  text_replace: "双模（literal/regex）陷阱语义，字段名表达不了",
  batch_run: "PRD-10 引导语，多工具编排语义无法压缩至 150 内",
};

describe("工单 01 元数据预算护栏", () => {
  it("JSON.stringify(listTools()) 长度 ≤ 预算常量", () => {
    const serialized = JSON.stringify(listTools());
    expect(
      serialized.length,
      `元数据总量 ${serialized.length} 超出预算 ${METADATA_BUDGET}`,
    ).toBeLessThanOrEqual(METADATA_BUDGET);
  });

  describe("description 软上限", () => {
    for (const tool of builtinTools) {
      it(`${tool.name} description 非空`, () => {
        expect(tool.description.length).toBeGreaterThan(0);
      });

      it(`${tool.name} description ≤ ${DESCRIPTION_MAX} 字符（或在豁免清单）`, () => {
        if (tool.name in DESCRIPTION_EXCEPTIONS) return;
        expect(
          tool.description.length,
          `${tool.name} description ${tool.description.length} 字符超限，若确需保留请加入 DESCRIPTION_EXCEPTIONS`,
        ).toBeLessThanOrEqual(DESCRIPTION_MAX);
      });
    }
  });

  it("豁免清单中的工具确实超长（防止死豁免）", () => {
    for (const [name] of Object.entries(DESCRIPTION_EXCEPTIONS)) {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `豁免工具 ${name} 应存在`).toBeDefined();
      expect(
        tool!.description.length,
        `${name} 已不超长，应从豁免清单移除`,
      ).toBeGreaterThan(DESCRIPTION_MAX);
    }
  });
});
