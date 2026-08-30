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
 * 工单 09/10（2026-08-26）：batch_run 新增 verbose 输入与 steps?/failedStep?
 * 输出超集（schema 增长），同时 description 四段式改写并移出豁免清单
 * （回到 ≤150 软上限），净增后重取基线实测 50516；放宽经用户确认授权，
 * 后续工单可继续收紧。
 * 工单 11-03（2026-08-26）：新增 tool_groups / list_domain_tools 两个 meta
 * 导航工具（各含非空 outputSchema，防漂移护栏强制项），重取基线实测 52607。
 * 工单 15-01（2026-08-26）：batch_run outputSchema 的 error 对象增加可选
 * hint 字段（错误可操作提示），重取基线实测 52657。
 * 工单 18 后未随中间 schema 增长重取基线，护栏已在 HEAD 失效（实测 53075）。
 * 工单 20（2026-08-28）：架构深化批量改动，net_download 超时错误文案
 * EXEC_TIMEOUT→NET_TIMEOUT（-1 字符），重取基线实测 53074。
 * 提示词工程改造（2026-08-28）：text_grep / text_replace / search_content 的
 * 双模语义收敛到 pattern 参数说明（单一来源），工具描述去掉复述与实现叙述，
 * 重取基线实测 52836。
 */
const METADATA_BUDGET = 52836;

/** description 长度软上限（字符）。 */
const DESCRIPTION_MAX = 150;

/**
 * 超长 description 显式豁免清单（工具名 → 豁免理由）。
 *
 * 原则：仅当字段名 + 类型表达不了的陷阱语义确实需要保留时才豁免；
 * 豁免工具必须真实超长（下方有防死豁免断言），精简后应立即移除。
 *
 * 清空记录：text_replace 曾因双模陷阱语义豁免（237 字符）；该事实改由
 * `pattern` 参数说明承载（src/utils/pattern.ts 的 patternConvention），
 * 描述降至 100 字符后按规则移除豁免。
 */
const DESCRIPTION_EXCEPTIONS: Readonly<Record<string, string>> = {};

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

  describe("batch_run 引导语义护栏（工单 10）", () => {
    // 经 listTools() 投影断言外部可观察形态（工单 10-02 指定 seam，与 AI 实际所见一致）
    const description = listTools().find(
      (t) => t.name === "batch_run",
    )?.description;

    it("batch_run 存在且 description 非空", () => {
      expect(description).toBeDefined();
      expect(description!.length).toBeGreaterThan(0);
    });

    it("description 含引导关键词「优先」「一次」（钉住引导存在，不快照全文）", () => {
      expect(description).toContain("优先");
      expect(description).toContain("一次");
    });

    it("description 含场景要素（读文件/替换/写回 流程示例的最小关键词）", () => {
      expect(description).toContain("读文件");
      expect(description).toContain("替换");
      expect(description).toContain("写回");
    });

    it("description 长度满足预算护栏：≤150 软上限（工单 10 改写后不在豁免清单）", () => {
      expect(DESCRIPTION_EXCEPTIONS["batch_run"]).toBeUndefined();
      const len = description?.length ?? 0;
      expect(len, `batch_run description ${len} 字符超限`).toBeLessThanOrEqual(
        DESCRIPTION_MAX,
      );
    });
  });
});
