/**
 * pkg 工具集：pkg_detect / pkg_run。
 *
 * pkg_detect：检测各包管理器（npm/yarn/pnpm/bun/pip/pip3/cargo/go/python/python3）可用性。
 * pkg_run：执行指定包管理器命令，返回 { exitCode, stdout, stderr }。
 *
 * 跨平台：Windows 上 npm/yarn/pnpm 等是 .cmd 文件，需要经 shell 执行让系统查找。
 * 子进程机器（收集、超时、进程树终止、解码）委托给命令执行深模块（src/exec/run.ts）。
 * 非零退出码是正常结果（不是工具失败）。
 *
 * 极简输出：{ exitCode, stdout, stderr }
 * verbose 输出：额外 { pid, duration }
 */

import { z } from "zod";
import { ok, fail, truncate, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { runCommand } from "../exec/run.js";
import type { Tool } from "../registry.js";

/** 默认检测的包管理器列表。 */
const DEFAULT_MANAGERS = [
  "npm",
  "yarn",
  "pnpm",
  "bun",
  "pip",
  "pip3",
  "cargo",
  "go",
  "python",
  "python3",
] as const;

// ===================== pkg_detect =====================

/** pkg_detect 输入 schema。 */
export const pkgDetectInputSchema = z.object({
  managers: z.array(z.string().min(1)).optional().describe("默认检测全部"),
});

/** pkg_detect 输入类型。 */
export type PkgDetectInput = z.infer<typeof pkgDetectInputSchema>;

/** pkg_detect 输出。 */
interface PkgDetectResult {
  available: Record<string, boolean>;
  checked: string[];
}

/**
 * 检测单个包管理器是否可用。
 *
 * 经 shell 执行 `<manager> --version`（Windows 上找到 .cmd/.bat 后缀），
 * exitCode=0 则视为可用；启动失败或非零退出码都算不可用。
 *
 * @param manager 包管理器名
 * @returns true 表示可用
 */
async function detectManager(manager: string): Promise<boolean> {
  const outcome = await runCommand(manager, ["--version"], { shell: true });
  return outcome.spawnError === undefined && outcome.exitCode === 0;
}

/**
 * pkg_detect handler：检测可用的包管理器。
 *
 * 返回 `{ available: Record<string, boolean>, checked: string[] }`。
 * 检测失败的管理器返回 false，不是工具失败（handler 永远返回 ok）。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约（始终为 ok）
 */
export async function pkgDetectHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const rawManagers = args["managers"];
  const checked: string[] =
    Array.isArray(rawManagers) &&
    rawManagers.every((m) => typeof m === "string" && m.length > 0)
      ? (rawManagers as string[])
      : [...DEFAULT_MANAGERS];

  // 并行检测所有管理器
  const entries = await Promise.all(
    checked.map(async (m) => [m, await detectManager(m)] as const),
  );
  const available: Record<string, boolean> = {};
  for (const [m, v] of entries) {
    available[m] = v;
  }

  const result: PkgDetectResult = { available, checked };
  return ok(result);
}

/** pkg_detect 输出 schema：各包管理器可用性检测结果。 */
export const pkgDetectOutputSchema = z.object({
  available: z.record(z.string(), z.boolean()),
  checked: z.array(z.string()),
});

/** pkg_detect 工具定义。 */
export const pkgDetectTool: Tool = {
  name: "pkg_detect",
  description:
    "检测包管理器可用性（npm/yarn/pnpm/pip/cargo 等）。返回 {available, checked}。",
  inputSchema: pkgDetectInputSchema,
  outputSchema: pkgDetectOutputSchema,
  annotations: { readOnlyHint: true },
  handler: pkgDetectHandler,
};

// ===================== pkg_run =====================

/** pkg_run 输入 schema。 */
export const pkgRunInputSchema = z.object({
  manager: z.string().min(1).describe("如 npm/pnpm/pip"),
  args: z.array(z.string()).optional().describe('如 ["install","lodash"]'),
  cwd: z.string().optional(),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("超时毫秒，超时杀子进程并返回 EXEC_TIMEOUT"),
  verbose: z.boolean().optional().describe("额外返回 pid/duration"),
});

/** pkg_run 输入类型。 */
export type PkgRunInput = z.infer<typeof pkgRunInputSchema>;

/** 极简输出字段。 */
interface PkgRunMinimal {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** verbose 输出字段。 */
interface PkgRunFull extends PkgRunMinimal {
  pid: number;
  duration: number;
}

/**
 * pkg_run handler：执行包管理器命令。
 *
 * 经 shell 执行 `<manager> <args...>`（Windows 上找到 .cmd/.bat 后缀）。
 * 极简返回 `{ exitCode, stdout, stderr }`，verbose 额外返回 `{ pid, duration }`。
 *
 * 错误：
 * - manager 非法 → EINVAL
 * - manager 不存在（ENOENT）→ EXEC_FAIL
 * - 超时 → EXEC_TIMEOUT
 * - 非零退出码是正常结果（不是工具失败）
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function pkgRunHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const manager = args["manager"];
  if (typeof manager !== "string" || manager.length === 0) {
    return fail(ErrorCode.EINVAL, "manager 必须是非空字符串");
  }

  const rawArgs = args["args"];
  const cmdArgs: string[] =
    Array.isArray(rawArgs) && rawArgs.every((a) => typeof a === "string")
      ? (rawArgs as string[])
      : [];

  const cwd = args["cwd"];
  const timeout = args["timeout"];
  const verbose = args["verbose"] === true;

  const cwdOpt = typeof cwd === "string" && cwd.length > 0 ? cwd : undefined;
  const timeoutMs =
    typeof timeout === "number" && timeout > 0 ? timeout : undefined;

  const outcome = await runCommand(manager, cmdArgs, {
    cwd: cwdOpt,
    timeoutMs,
    shell: true,
  });

  const cmdLabel = `${manager} ${cmdArgs.join(" ")}`.trim();

  if (outcome.spawnError !== undefined) {
    if (outcome.spawnError.code === "ENOENT") {
      return fail(ErrorCode.EXEC_FAIL, `包管理器不存在: ${manager}`);
    }
    return fail(ErrorCode.EXEC_FAIL, `执行失败: ${outcome.spawnError.message}`);
  }

  if (outcome.timedOut) {
    return fail(
      ErrorCode.EXEC_TIMEOUT,
      `命令超时（${timeoutMs}ms）: ${cmdLabel}`,
    );
  }

  const minimal: PkgRunMinimal = {
    exitCode: outcome.exitCode,
    stdout: truncate(outcome.stdout),
    stderr: truncate(outcome.stderr),
  };

  if (!verbose) {
    return ok(minimal);
  }

  const full: PkgRunFull = {
    ...minimal,
    pid: outcome.pid,
    duration: outcome.duration,
  };
  return ok(full);
}

/**
 * pkg_run 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ exitCode, stdout, stderr }`；verbose 额外返回 `{ pid, duration }`。
 */
export const pkgRunOutputSchema = z.object({
  exitCode: z.number().int().describe("非零是正常结果，不是工具失败"),
  stdout: z.string().describe("可能截断"),
  stderr: z.string().describe("可能截断"),
  pid: z.number().int().optional().describe("verbose 时返回"),
  duration: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("verbose 时返回"),
});

/** pkg_run 工具定义。 */
export const pkgRunTool: Tool = {
  name: "pkg_run",
  description:
    "执行包管理器命令（≈ npm run/pip install）。返回 {exitCode,stdout,stderr}。非零退出码是正常结果。",
  inputSchema: pkgRunInputSchema,
  outputSchema: pkgRunOutputSchema,
  // 执行任意包管理器命令（install/uninstall/run 等），副作用不可控且可能改变文件系统/依赖树，
  // readOnlyHint: false；destructiveHint 省略（副作用类型由子命令决定，无法静态裁决）
  annotations: { readOnlyHint: false },
  handler: pkgRunHandler,
};
