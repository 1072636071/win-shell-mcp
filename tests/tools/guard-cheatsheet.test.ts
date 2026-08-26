/**
 * 护栏测试（工单 13-02）：速查表与 registry 结构对账。
 *
 * 解析 `docs/ai-tool-cheatsheet.md` 的全部工具表格行（15 命令域 + meta 节），
 * 与 registry `builtinTools` 逐一对账四组事实：
 * - 域节标题集合 == 15 命令域 + meta
 * - 正名集合 == registry 正名集合
 * - 每行别名列 == 该工具在 registry 中的 aliases（无别名为 `—`）
 * - 表格行数 == builtinTools 数
 *
 * 只锁结构一致性，不锁一句话用途措辞（01 号工单放行人工措辞演化）。
 * 模式沿用 guard-mutating.test.ts 的全集遍历护栏；仓库无 CI，漂移防线放在测试里。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtinTools, COMMAND_DOMAINS } from "../../src/registry.js";

/** 速查表路径。 */
const CHEATSHEET_PATH = join(process.cwd(), "docs", "ai-tool-cheatsheet.md");

/** 15 命令域 + meta 节标题集合（域节标题期望集合）。 */
const DOMAIN_SECTIONS = new Set<string>([...COMMAND_DOMAINS, "meta"]);

/** 无别名标记（速查表别名列空值约定）。 */
const NO_ALIASES_MARK = "—";

/** 速查表解析行。 */
interface CheatsheetRow {
  /** 工具正名（去反引号）。 */
  name: string;
  /** 别名集合（去反引号；无别名为空数组）。 */
  aliases: string[];
  /** 所属域节标题。 */
  section: string;
}

/**
 * 解析速查表：返回所有工具表格行（仅 15 域 + meta 节下的表格行）。
 *
 * 跳过环境变量节（`## 环境变量`）——该节表格列语义不同，不计入对账。
 */
function parseCheatsheet(): { rows: CheatsheetRow[]; sections: string[] } {
  const text = readFileSync(CHEATSHEET_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const rows: CheatsheetRow[] = [];
  const sections: string[] = [];
  let currentSection: string | null = null;

  for (const line of lines) {
    // 节标题：## <title>
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = heading[1]!.trim();
      if (DOMAIN_SECTIONS.has(title)) {
        currentSection = title;
        sections.push(title);
      } else {
        // 环境变量节等非域节，跳过其表格
        currentSection = null;
      }
      continue;
    }

    // 表格行：以 | 开头且以 | 结尾
    if (currentSection && line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.length !== 4) continue;
      const c0 = cells[0]!;
      const c3 = cells[3]!;
      // 跳过分隔行（如 |------|-----------|---------|------|）
      if (c0.startsWith("-")) continue;
      // 跳过表头行（正名｜一句话用途｜关键参数｜别名）
      if (c0 === "正名") continue;

      rows.push({
        name: stripBackticks(c0),
        aliases: parseAliases(c3),
        section: currentSection,
      });
    }
  }

  return { rows, sections };
}

/** 去除反引号并 trim。 */
function stripBackticks(s: string): string {
  return s.replace(/`/g, "").trim();
}

/** 解析别名列：`—` 表示无别名，否则按逗号分割去反引号。 */
function parseAliases(cell: string): string[] {
  const trimmed = cell.trim();
  if (trimmed === NO_ALIASES_MARK) return [];
  return trimmed
    .split(",")
    .map((p) => stripBackticks(p))
    .filter((p) => p.length > 0);
}

describe("工单 13-02 速查表与 registry 结构对账", () => {
  const { rows, sections } = parseCheatsheet();

  it("速查表文件存在且可解析", () => {
    expect(rows.length, "应解析出工具表格行").toBeGreaterThan(0);
  });

  it("域节标题集合 == 15 命令域 + meta", () => {
    expect(new Set(sections)).toEqual(DOMAIN_SECTIONS);
  });

  it("域节标题无重复（恰好 16 个）", () => {
    expect(sections.length).toBe(DOMAIN_SECTIONS.size);
  });

  it("表格行数 == builtinTools 数（61）", () => {
    expect(rows.length).toBe(builtinTools.length);
  });

  it("正名集合 == registry 正名集合", () => {
    const cheatsheetNames = new Set(rows.map((r) => r.name));
    const registryNames = new Set(builtinTools.map((t) => t.name));
    // 速查表中每个正名都应已注册
    for (const name of cheatsheetNames) {
      expect(
        registryNames.has(name),
        `速查表中的 ${name} 应在 registry 中`,
      ).toBe(true);
    }
    // registry 中每个正名都应在速查表里
    for (const name of registryNames) {
      expect(cheatsheetNames.has(name), `已注册的 ${name} 应在速查表中`).toBe(
        true,
      );
    }
  });

  it("速查表内正名无重复", () => {
    const names = rows.map((r) => r.name);
    expect(new Set(names).size, "正名不应重复").toBe(names.length);
  });

  // 每行别名列与 registry aliases 逐一对账
  describe("每行别名列 == registry aliases", () => {
    for (const row of rows) {
      it(`${row.name} 别名对账`, () => {
        const tool = builtinTools.find((t) => t.name === row.name);
        expect(tool, `速查表中的 ${row.name} 应在 registry 中`).toBeDefined();
        const registryAliases = (tool?.aliases ?? []).slice().sort();
        const cheatsheetAliases = row.aliases.slice().sort();
        expect(cheatsheetAliases).toEqual(registryAliases);
      });
    }
  });
});
