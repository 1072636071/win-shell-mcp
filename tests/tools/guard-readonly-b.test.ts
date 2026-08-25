/**
 * 只读工具批量 B guard test（工单 03）。
 *
 * 断言本批次全部工具（system/env/core/net/pkg/process/git/hash/json 共 18 个）：
 * - outputSchema 非空（已补全输出 zod schema）
 * - annotations.readOnlyHint === true（显式声明只读）
 *
 * 与工单 02 的 guard-readonly-a.test.ts 独立，覆盖不同工具集，避免文件名/断言冲突。
 */

import { describe, it, expect } from "vitest";
import { builtinTools } from "../../src/registry.js";

/** 本批次工具名清单（18 个）。 */
const BATCH_B_TOOLS = [
  // system 域
  "system_info",
  "system_disk",
  "system_memory",
  "system_path",
  // env 域
  "env_get",
  // core 域
  "pwd",
  "echo",
  // net 域
  "net_dns",
  "net_tcp",
  "net_listen",
  "ping",
  // pkg 域
  "pkg_detect",
  // process 域
  "process_list",
  // git 只读子命令
  "git_status",
  "git_log",
  "git_branch",
  "git_diff",
  // hash / json
  "hash_file",
  "json_get",
] as const;

describe("只读工具批量 B guard：outputSchema 与 readOnlyHint", () => {
  it("本批次工具清单完整（19 个）", () => {
    expect(BATCH_B_TOOLS.length).toBe(19);
  });

  it("本批次工具均在注册表中注册", () => {
    const registered = new Set(builtinTools.map((t) => t.name));
    for (const name of BATCH_B_TOOLS) {
      expect(registered.has(name), `工具 ${name} 应已注册`).toBe(true);
    }
  });

  // 逐工具断言 outputSchema 非空且 readOnlyHint === true
  for (const name of BATCH_B_TOOLS) {
    describe(`工具 ${name}`, () => {
      const tool = builtinTools.find((t) => t.name === name);

      it("outputSchema 非空", () => {
        expect(tool, `工具 ${name} 应存在`).toBeDefined();
        expect(tool!.outputSchema, `${name} 应补全 outputSchema`).toBeDefined();
      });

      it("annotations.readOnlyHint === true", () => {
        expect(tool!.annotations, `${name} 应声明 annotations`).toBeDefined();
        expect(
          tool!.annotations!.readOnlyHint,
          `${name} readOnlyHint 应为 true`,
        ).toBe(true);
      });
    });
  }
});
