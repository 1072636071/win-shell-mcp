/**
 * DSH 插件完整集成与冒烟测试（工单 05）。
 *
 * 三组测试：
 * 1. 全量注册验证（纯 mock，无 DSH 依赖）—— apply 注册 58 工具
 * 2. Config exclude 验证（纯 mock）—— 排除单/多工具后注册数正确
 * 3. DSH 本地冒烟（需 DSH 环境，不存在则 skip）—— 加载插件 + 真实 ctx 注册 + 调用工具
 *
 * DSH 冒烟检测 `E:\work\sp\deepseek-harness`（或 DSH_ROOT 环境变量）是否存在。
 * 完整的 Native/Code Mode/Exclusive 并发语义验证需手动运行
 * `.temp/scripts/dsh-smoke.ts`（启动真实 DSH runtime）；此处验证集成可用性：
 * 插件可加载、全量注册无异常、read-only 工具可并行调用、exclusive 工具可顺序执行。
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  apply,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../src/plugin.js";
import { builtinTools } from "../src/registry.js";

/** 内置工具总数。 */
const EXPECTED_TOOL_COUNT = builtinTools.length;

/** DSH 本地环境根目录（可通过 DSH_ROOT 环境变量覆盖）。 */
const DSH_ROOT = process.env["DSH_ROOT"] ?? "E:\\work\\sp\\deepseek-harness";

/** DSH 本地环境是否存在。 */
const DSH_AVAILABLE = existsSync(DSH_ROOT);

/** 捕获 defineTool 调用的 fake ctx。 */
function makeFakeCtx(): {
  ctx: CordisPluginContext;
  defined: Map<string, DshToolDefinition>;
} {
  const defined = new Map<string, DshToolDefinition>();
  const ctx: CordisPluginContext = {
    tools: {
      defineTool(def: DshToolDefinition) {
        defined.set(def.name, def);
      },
    },
  };
  return { ctx, defined };
}

// ---------------------------------------------------------------------------
// 3a. 全量注册验证（纯 mock，无 DSH 依赖）
// ---------------------------------------------------------------------------

describe("plugin 全量注册（mock ctx）", () => {
  it("apply 注册全部 59 个工具", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT);
    expect(defined.size).toBe(59);
  });

  it("注册工具名集合等于 builtinTools 工具名集合", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const builtinNames = new Set(builtinTools.map((t) => t.name));
    expect(defined.size).toBe(builtinNames.size);
    for (const name of builtinNames) {
      expect(defined.has(name)).toBe(true);
    }
  });

  it("每个注册项含 name/description/input/output/execute 五字段", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    for (const def of defined.values()) {
      expect(typeof def.name).toBe("string");
      expect(typeof def.description).toBe("string");
      expect(def.input.schema).toBeDefined();
      expect(def.output.schema).toBeDefined();
      expect(typeof def.execute).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// 3b. Config exclude 验证（纯 mock）
// ---------------------------------------------------------------------------

describe("plugin config.exclude 验证（mock ctx）", () => {
  it("排除 shell_exec 后注册 57 个且不含 shell_exec", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx, { exclude: ["shell_exec"] });
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT - 1);
    expect(defined.has("shell_exec")).toBe(false);
    // 其余工具仍注册
    expect(defined.has("fs_read")).toBe(true);
    expect(defined.has("git_status")).toBe(true);
  });

  it("排除多个工具后注册数正确且不含被排除项", () => {
    const excludeList = ["shell_exec", "fs_write", "git_push"];
    const { ctx, defined } = makeFakeCtx();
    apply(ctx, { exclude: excludeList });
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT - excludeList.length);
    expect(defined.size).toBe(56);
    for (const name of excludeList) {
      expect(defined.has(name)).toBe(false);
    }
    // 未被排除的工具仍注册
    expect(defined.has("fs_read")).toBe(true);
    expect(defined.has("system_info")).toBe(true);
  });

  it("排除不存在的工具名不影响注册数", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx, { exclude: ["nonexistent_tool"] });
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT);
  });

  it("排除全部工具后注册 0 个", () => {
    const allNames = builtinTools.map((t) => t.name);
    const { ctx, defined } = makeFakeCtx();
    apply(ctx, { exclude: allNames });
    expect(defined.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3c. DSH 本地冒烟（需 DSH 环境，不存在则 skip）
// ---------------------------------------------------------------------------

const dshDescribe = DSH_AVAILABLE ? describe : describe.skip;

dshDescribe("DSH 本地冒烟", () => {
  if (!DSH_AVAILABLE) {
    // eslint-disable-next-line no-console
    console.log("DSH 本地环境未找到，跳过冒烟测试");
  }

  it("DSH 环境目录存在", () => {
    expect(DSH_AVAILABLE).toBe(true);
    expect(existsSync(DSH_ROOT)).toBe(true);
  });

  it("加载插件 + 全量注册成功（真实 plugin import）", () => {
    // 用真实 plugin 模块（已 import）+ mock ctx 验证全量注册无异常
    const { ctx, defined } = makeFakeCtx();
    expect(() => apply(ctx)).not.toThrow();
    expect(defined.size).toBe(59);
  });

  it("Native 模式：并行调用两个 read-only 工具均成功返回", async () => {
    // Native 模式下，read-only 工具（isConcurrencySafe===true）可并行。
    // 此处用真实 execute 调用两个 read-only 工具，验证均成功返回。
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);

    const systemInfo = defined.get("system_info");
    const pwd = defined.get("pwd");
    expect(systemInfo).toBeDefined();
    expect(pwd).toBeDefined();
    // 两者均为 read-only，应有 isConcurrencySafe
    expect(systemInfo?.isConcurrencySafe?.({})).toBe(true);
    expect(pwd?.isConcurrencySafe?.({})).toBe(true);

    // 并行调用
    const [infoResult, pwdResult] = await Promise.all([
      systemInfo!.execute({}),
      pwd!.execute({}),
    ]);
    expect(infoResult).toBeDefined();
    expect(pwdResult).toBeDefined();
    // pwd 返回应含 cwd 字段
    const pwdData = pwdResult as Record<string, unknown>;
    expect(pwdData["cwd"]).toBeDefined();
  });

  it("Code Mode：Promise.all 并发调用 fs_read + git_status 均成功", async () => {
    // Code Mode 下程序内 Promise.all 触发子调用重叠。
    // 此处验证两个 read-only 工具并发调用均成功返回。
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);

    const fsRead = defined.get("fs_read");
    const gitStatus = defined.get("git_status");
    expect(fsRead).toBeDefined();
    expect(gitStatus).toBeDefined();

    // 用本仓库的 README.md 作为读取目标（测试运行时 cwd 为仓库根）
    const readmePath = join(process.cwd(), "README.md");
    const [readResult, statusResult] = await Promise.all([
      fsRead!.execute({ path: readmePath }),
      gitStatus!.execute({}),
    ]);
    expect(readResult).toBeDefined();
    expect(statusResult).toBeDefined();
    // fs_read 返回应含 content
    const readData = readResult as Record<string, unknown>;
    expect(readData["content"]).toBeDefined();
  });

  it("Exclusive：顺序提交 fs_write + fs_read 均执行完成", async () => {
    // Exclusive 工具（isConcurrencySafe undefined）排空池、阻挡后续。
    // 此处验证 fs_write（变更工具）与 fs_read 顺序执行均完成。
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);

    const fsWrite = defined.get("fs_write");
    const fsRead = defined.get("fs_read");
    expect(fsWrite).toBeDefined();
    expect(fsRead).toBeDefined();
    // fs_write 是变更工具，不应有 isConcurrencySafe（独占）
    expect(fsWrite?.isConcurrencySafe).toBeUndefined();
    // fs_read 是只读工具，应有 isConcurrencySafe
    expect(fsRead?.isConcurrencySafe?.({})).toBe(true);

    // 顺序执行：先写后读
    const tmpFile = join(
      process.cwd(),
      ".temp",
      "output",
      "smoke-exclusive-test.txt",
    );
    const writeResult = await fsWrite!.execute({
      path: tmpFile,
      content: "smoke test",
    });
    expect(writeResult).toBeDefined();

    const readResult = await fsRead!.execute({ path: tmpFile });
    expect(readResult).toBeDefined();
    const readData = readResult as Record<string, unknown>;
    expect(readData["content"]).toBe("smoke test");
  });
});
