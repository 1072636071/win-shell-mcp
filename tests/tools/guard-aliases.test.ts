/**
 * 别名护栏测试（工单 14-02）。
 *
 * 断言：
 * - 别名全集 ∩ 正名全集 = ∅（无别名遮蔽正名）
 * - 别名全集内部无重复（同一别名不指向两个工具）
 * - ListTools 长度不变（别名不出现在条目中，listTools 仅按 tool.name 列出）
 * - 7 个新别名声明存在且指向正确正名
 * - callTool 经新别名调用到达正名工具，结果与正名调用一致
 * - batch_run 步骤用新别名正常执行
 *
 * 先例：tests/tools/guard-mutating.test.ts（全集遍历护栏）。
 */

import { describe, it, expect, afterEach } from "vitest";
import { builtinTools, findTool } from "../../src/registry.js";
import { listTools, callTool } from "../../src/server.js";
import { isOk } from "../../src/contract/output.js";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

/** 收集全部别名及其指向的正名。 */
const aliasEntries: ReadonlyArray<{ alias: string; canonical: string }> =
  builtinTools.flatMap((t) =>
    (t.aliases ?? []).map((alias) => ({ alias, canonical: t.name })),
  );

const allAliases = aliasEntries.map((e) => e.alias);
const allCanonicals = builtinTools.map((t) => t.name);

/** 7 个新别名 → 正名映射（工单 14-02）。 */
const NEW_ALIASES: ReadonlyArray<{ alias: string; canonical: string }> = [
  { alias: "rm", canonical: "fs_rm" },
  { alias: "mv", canonical: "fs_mv" },
  { alias: "cp", canonical: "fs_cp" },
  { alias: "grep", canonical: "text_grep" },
  { alias: "wc", canonical: "text_wc" },
  { alias: "df", canonical: "system_disk" },
  { alias: "ps", canonical: "process_list" },
];

// mv/cp 临时文件清理
const tmpFiles: string[] = [];
afterEach(() => {
  for (const f of tmpFiles) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* 忽略 */
    }
  }
  tmpFiles.length = 0;
});

describe("工单 14-02：别名护栏", () => {
  it("别名全集 ∩ 正名全集 = ∅（无别名遮蔽正名）", () => {
    const canonicalSet = new Set(allCanonicals);
    for (const alias of allAliases) {
      expect(
        canonicalSet.has(alias),
        `别名 "${alias}" 不得与任何正名重名`,
      ).toBe(false);
    }
  });

  it("别名全集内部无重复（同一别名唯一指向一个正名）", () => {
    const seen = new Map<string, string>();
    for (const { alias, canonical } of aliasEntries) {
      const prev = seen.get(alias);
      expect(
        prev,
        `别名 "${alias}" 同时指向 ${prev} 与 ${canonical}——重复`,
      ).toBeUndefined();
      seen.set(alias, canonical);
    }
  });

  it("ListTools 长度不变（别名不出现在条目中）", () => {
    const listed = listTools();
    expect(listed.length).toBe(builtinTools.length);
    const listedNames = new Set(listed.map((t) => t.name));
    for (const alias of allAliases) {
      expect(
        listedNames.has(alias),
        `别名 "${alias}" 不应出现在 ListTools 条目中`,
      ).toBe(false);
    }
  });

  describe("7 个新别名声明存在且指向正确正名", () => {
    for (const { alias, canonical } of NEW_ALIASES) {
      it(`findTool("${alias}")?.name === "${canonical}"`, () => {
        const tool = findTool(alias);
        expect(tool, `别名 ${alias} 应解析到工具`).toBeDefined();
        expect(tool?.name).toBe(canonical);
      });
    }
  });

  describe("callTool 经新别名调用到达正名，结果与正名一致", () => {
    // 只读别名：结果与正名调用深度相等
    it("grep → text_grep（只读，结果一致）", async () => {
      const args = { path: "README.md", pattern: "win-shell" };
      const aliasResult = await callTool("grep", args);
      const canonicalResult = await callTool("text_grep", args);
      expect(isOk(aliasResult)).toBe(true);
      expect(aliasResult).toEqual(canonicalResult);
    });

    it("wc → text_wc（只读，结果一致）", async () => {
      const args = { path: "README.md" };
      const aliasResult = await callTool("wc", args);
      const canonicalResult = await callTool("text_wc", args);
      expect(isOk(aliasResult)).toBe(true);
      expect(aliasResult).toEqual(canonicalResult);
    });

    it("df → system_disk（只读，结果一致）", async () => {
      const args = {};
      const aliasResult = await callTool("df", args);
      const canonicalResult = await callTool("system_disk", args);
      expect(isOk(aliasResult)).toBe(true);
      expect(aliasResult).toEqual(canonicalResult);
    });

    it("ps → process_list（进程列表动态，只断言 ok=true）", async () => {
      const aliasResult = await callTool("ps", {});
      expect(isOk(aliasResult)).toBe(true);
    });

    // 变更别名：ok=true
    it("rm → fs_rm（force 模式删除不存在文件，ok=true）", async () => {
      const result = await callTool("rm", {
        path: "nonexistent_guard_aliases_xyz.tmp",
        force: true,
      });
      expect(isOk(result)).toBe(true);
    });

    it("cp → fs_cp（复制 README.md 到临时文件，ok=true）", async () => {
      const dest = path.join(
        os.tmpdir(),
        `guard-aliases-cp-${process.pid}-${Date.now()}.md`,
      );
      tmpFiles.push(dest);
      const result = await callTool("cp", { src: "README.md", dest });
      expect(isOk(result)).toBe(true);
    });

    it("mv → fs_mv（移动临时文件，ok=true）", async () => {
      const src = path.join(
        os.tmpdir(),
        `guard-aliases-mv-src-${process.pid}-${Date.now()}.txt`,
      );
      const dest = path.join(
        os.tmpdir(),
        `guard-aliases-mv-dest-${process.pid}-${Date.now()}.txt`,
      );
      tmpFiles.push(src, dest);
      fs.writeFileSync(src, "test");
      const result = await callTool("mv", { src, dest });
      expect(isOk(result)).toBe(true);
    });
  });

  it("batch_run 步骤用新别名 ps 正常执行", async () => {
    const result = await callTool("batch_run", {
      steps: [
        { id: "disk", tool: "df", args: {} },
        { id: "procs", tool: "ps", args: {} },
      ],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.allOk).toBe(true);
    }
  });
});
