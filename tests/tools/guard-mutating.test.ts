/**
 * Guard test（工单 04 最终防线；基线经工单 11-03 抬至 61）：覆盖全部 61 个工具。
 *
 * 断言每个工具：
 * - outputSchema 非空（defined）
 * - annotations.readOnlyHint 为显式 true 或显式 false（不能是 undefined）
 *
 * 分两批断言：
 * - 只读工具（readOnlyHint === true）：36 个
 * - 变更工具（readOnlyHint === false）：25 个
 *
 * 另断言 builtinTools 总数为 61，且两批工具名的并集与 builtinTools 完全一致，
 * 防止新增工具时静默漏盖。
 *
 * 本文件与 guard-readonly-a/b.test.ts 互补：那两个文件分批覆盖只读工具的细节，
 * 本文件是工单 04 收尾的全量 guard，确保全部工具都有元数据。
 */

import { describe, it, expect } from "vitest";
import { builtinTools } from "../../src/registry.js";

/**
 * 只读工具清单（readOnlyHint === true）。
 *
 * 来源：
 * - 工单 02 批次 A（13 个）：fs/text/search 域只读
 * - 工单 03 批次 B（19 个）：system/env/core/net/pkg/process/git/hash/json 域只读
 * - 工单 04 补全（1 个）：net_get（语义只读 HTTP GET，与 net_dns/net_tcp 同归只读）
 * - 工单 11-03 新增（2 个）：tool_groups/list_domain_tools（域导航 meta，语义只读）
 */
const READONLY_TOOLS: readonly string[] = [
  // 工单 02 批次 A
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
  // 工单 03 批次 B
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
  // 工单 04 补全（net_get 语义只读）
  "net_get",
  // 工单 04 补全（find 递归搜索只读）
  "find",
  // 工单 11-03 新增（域导航 meta 工具，语义只读）
  "tool_groups",
  "list_domain_tools",
];

/**
 * 变更工具清单（readOnlyHint === false）。
 *
 * 来源（工单 04）：
 * - fs 变更域（6）
 * - text 变更域（1）
 * - archive 域（2）
 * - net 变更域（2）
 * - env 变更域（2）
 * - process 域（1）
 * - pkg 域（1）
 * - git 变更子命令（7）
 * - 执行域（2）
 * - batch_run（1，工单 01-02-03-04）
 */
const MUTATING_TOOLS: readonly string[] = [
  // fs 变更域
  "fs_write",
  "fs_mkdir",
  "fs_rm",
  "fs_cp",
  "fs_mv",
  "fs_touch",
  // text 变更域
  "text_replace",
  // archive 域
  "archive_create",
  "archive_extract",
  // net 变更域
  "net_post",
  "net_download",
  // env 变更域
  "env_set",
  "env_unset",
  // process 域
  "process_kill",
  // pkg 域
  "pkg_run",
  // git 变更子命令
  "git_add",
  "git_commit",
  "git_checkout",
  "git_push",
  "git_pull",
  "git_clone",
  "git_stash",
  // 执行域
  "shell_exec",
  "run_command",
  // batch_run（工单 01-02-03-04）
  "batch_run",
];

describe("工单 04 最终 guard：全部 61 工具 outputSchema 与 readOnlyHint", () => {
  it("builtinTools 总数为 61", () => {
    expect(builtinTools.length).toBe(61);
  });

  it("只读工具清单数为 36", () => {
    expect(READONLY_TOOLS.length).toBe(36);
  });

  it("变更工具清单数为 25", () => {
    expect(MUTATING_TOOLS.length).toBe(25);
  });

  it("两批工具名无重复", () => {
    const all = [...READONLY_TOOLS, ...MUTATING_TOOLS];
    const set = new Set(all);
    expect(set.size, "应无重复工具名").toBe(all.length);
  });

  it("两批工具名的并集与 builtinTools 完全一致", () => {
    const listed = new Set([...READONLY_TOOLS, ...MUTATING_TOOLS]);
    const registered = new Set(builtinTools.map((t) => t.name));
    // 列表中每个名字都应已注册
    for (const name of listed) {
      expect(registered.has(name), `列表中的 ${name} 应已注册`).toBe(true);
    }
    // 注册表中每个名字都应在列表里
    for (const name of registered) {
      expect(listed.has(name), `已注册的 ${name} 应在列表里`).toBe(true);
    }
    expect(listed.size).toBe(61);
  });

  // 只读工具：outputSchema 非空 + readOnlyHint === true
  describe("只读工具（readOnlyHint === true）", () => {
    for (const name of READONLY_TOOLS) {
      describe(`工具 ${name}`, () => {
        const tool = builtinTools.find((t) => t.name === name);

        it("outputSchema 非空", () => {
          expect(tool, `工具应存在: ${name}`).toBeDefined();
          expect(
            tool?.outputSchema,
            `${name} 应声明 outputSchema`,
          ).toBeDefined();
        });

        it("annotations.readOnlyHint === true（显式 true）", () => {
          expect(
            tool?.annotations?.readOnlyHint,
            `${name} readOnlyHint 应为显式 true`,
          ).toBe(true);
        });
      });
    }
  });

  // 变更工具：outputSchema 非空 + readOnlyHint === false（显式 false，不是 undefined）
  describe("变更工具（readOnlyHint === false）", () => {
    for (const name of MUTATING_TOOLS) {
      describe(`工具 ${name}`, () => {
        const tool = builtinTools.find((t) => t.name === name);

        it("outputSchema 非空", () => {
          expect(tool, `工具应存在: ${name}`).toBeDefined();
          expect(
            tool?.outputSchema,
            `${name} 应声明 outputSchema`,
          ).toBeDefined();
        });

        it("annotations.readOnlyHint === false（显式 false，非 undefined）", () => {
          expect(
            tool?.annotations?.readOnlyHint,
            `${name} readOnlyHint 应为显式 false`,
          ).toBe(false);
        });
      });
    }
  });

  // 全量遍历兜底：builtinTools 中每个工具都有非空 outputSchema 与显式 readOnlyHint
  describe("全量兜底遍历", () => {
    for (const tool of builtinTools) {
      it(`${tool.name} 有非空 outputSchema`, () => {
        expect(
          tool.outputSchema,
          `${tool.name} 应声明 outputSchema`,
        ).toBeDefined();
      });

      it(`${tool.name} 有显式 readOnlyHint（true 或 false，非 undefined）`, () => {
        expect(
          tool.annotations?.readOnlyHint,
          `${tool.name} readOnlyHint 不应为 undefined`,
        ).toBeDefined();
        expect(
          typeof tool.annotations?.readOnlyHint,
          `${tool.name} readOnlyHint 应为 boolean`,
        ).toBe("boolean");
      });
    }
  });
});
