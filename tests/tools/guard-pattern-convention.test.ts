/**
 * pattern 双模语义的表述归属护栏（单一事实源）。
 *
 * 「pattern 默认字面量、`/…/` 为正则」这一事实此前在 text_grep、search_content、
 * text_replace 三条工具描述里各写一遍，措辞三样，且与各自的 `pattern` 参数说明
 * 重复——同一工具内两次表述、跨工具三次漂移。本护栏把归属固定下来：
 *
 * 1. 该事实只写在 `pattern` 参数说明里，且三条都等于 `patternConvention(flags)`
 *    的输出（flags 白名单一变，说明随之变，不留过期副本）；
 * 2. 工具描述里不得再次出现「字面量」字样，即不得复述该约定。
 */
import { describe, it, expect } from "vitest";
import { builtinTools } from "../../src/registry.js";
import {
  patternConvention,
  REPLACE_PATTERN_FLAGS,
  SEARCH_PATTERN_FLAGS,
} from "../../src/utils/pattern.js";

/** 声明 `pattern` 参数且走双模解析的工具 → 其合法 flags 白名单。 */
const DUAL_MODE_TOOLS: ReadonlyArray<[string, readonly string[]]> = [
  ["text_grep", SEARCH_PATTERN_FLAGS],
  ["search_content", SEARCH_PATTERN_FLAGS],
  ["text_replace", REPLACE_PATTERN_FLAGS],
];

function toolOf(name: string) {
  const tool = builtinTools.find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`工具 ${name} 未注册`);
  return tool;
}

function patternDescribe(name: string): string {
  const shape = (toolOf(name).inputSchema as unknown as {
    shape: Record<string, { description?: string }>;
  }).shape;
  return shape["pattern"]?.description ?? "";
}

describe("pattern 双模语义归属", () => {
  it.each(DUAL_MODE_TOOLS.map(([name, flags]) => [name, flags] as const))(
    "%s 的 pattern 参数说明等于 patternConvention(flags) 输出",
    (name, flags) => {
      const describe_ = patternDescribe(name);
      expect(describe_.startsWith(patternConvention(flags))).toBe(true);
    },
  );

  it("两个搜索工具的说明逐字相同，替换工具只在尾部加本工具口径", () => {
    expect(patternDescribe("text_grep")).toBe(patternDescribe("search_content"));
    expect(patternDescribe("text_replace")).toBe(
      patternConvention(REPLACE_PATTERN_FLAGS, "g 表全量"),
    );
  });

  it.each(DUAL_MODE_TOOLS.map(([name]) => [name] as const))(
    "%s 的工具描述不复述该约定",
    (name) => {
      expect(toolOf(name).description).not.toContain("字面量");
    },
  );
});
