/**
 * system_info 工具：返回当前系统信息。
 *
 * 极简输出（默认）：os、arch、platform、hostname、cwd、node
 * verbose 输出：额外 uptime、loadavg、cpus、totalmem、freemem
 */

import os from 'node:os';
import { statfs, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { ok, fail, withVerbose, type AnyToolResult } from '../contract/output.js';
import { toErrorCode, toErrorMessage } from '../contract/errors.js';
import type { Tool } from '../registry.js';

/** 输入 schema：verbose 可选布尔。 */
export const systemInfoInputSchema = z.object({
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回完整系统信息（含 uptime、内存、CPU 等）'),
});

/** system_info 输入类型。 */
export type SystemInfoInput = z.infer<typeof systemInfoInputSchema>;

/** 极简输出字段。 */
interface SystemInfoMinimal {
  os: string;
  arch: string;
  platform: string;
  hostname: string;
  cwd: string;
  node: string;
}

/** verbose 输出字段。 */
interface SystemInfoFull extends SystemInfoMinimal {
  uptime: number;
  loadavg: number[];
  cpus: number;
  totalmem: number;
  freemem: number;
}

/**
 * system_info handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemInfoHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const verbose = args['verbose'] === true;

  const minimal: SystemInfoMinimal = {
    os: os.type(),
    arch: os.arch(),
    platform: os.platform(),
    hostname: os.hostname(),
    cwd: process.cwd(),
    node: process.version,
  };

  const full: SystemInfoFull = {
    ...minimal,
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    cpus: os.cpus().length,
    totalmem: os.totalmem(),
    freemem: os.freemem(),
  };

  // 接口类型无索引签名，需经 unknown 中转赋给 AnyToolResult
  return ok(withVerbose(minimal, full, verbose)) as unknown as AnyToolResult;
}

/** system_info 工具定义。 */
export const systemInfoTool: Tool = {
  name: 'system_info',
  description:
    '获取当前系统信息（os、arch、platform、hostname、cwd、node 版本）。开启 verbose 时返回完整信息（uptime、loadavg、cpus、内存）。',
  inputSchema: systemInfoInputSchema,
  handler: systemInfoHandler,
};

// ---------------------------------------------------------------------------
// system_disk：磁盘用量
// ---------------------------------------------------------------------------

/**
 * system_disk 工具：返回指定路径所在文件系统的磁盘用量。
 *
 * 跨平台：使用 fs.promises.statfs（Node 18.15+ 提供）。
 * 返回 { total, free, used, path }，单位字节。
 */

/** 输入 schema：path 可选，默认 process.cwd()。 */
export const systemDiskInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('挂载点或目录路径，默认当前工作目录'),
});

/** system_disk 输入类型。 */
export type SystemDiskInput = z.infer<typeof systemDiskInputSchema>;

/** system_disk 输出字段。 */
interface SystemDiskResult {
  total: number;
  free: number;
  used: number;
  path: string;
}

/**
 * system_disk handler。
 *
 * @param args 已验证的参数（含可选 path）
 * @returns 统一输出契约；path 不存在时返回 ENOENT
 */
export async function systemDiskHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const rawPath = args['path'];
  const path = typeof rawPath === 'string' && rawPath.length > 0 ? rawPath : process.cwd();

  try {
    const stats = await statfs(path);
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;
    const used = total - free;
    const result: SystemDiskResult = { total, free, used, path };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return fail(toErrorCode(err), toErrorMessage(err));
  }
}

/** system_disk 工具定义。 */
export const systemDiskTool: Tool = {
  name: 'system_disk',
  description:
    '获取磁盘用量（total/free/used，字节）。path 指定挂载点或目录，默认当前工作目录。',
  inputSchema: systemDiskInputSchema,
  handler: systemDiskHandler,
};

// ---------------------------------------------------------------------------
// system_memory：内存信息
// ---------------------------------------------------------------------------

/**
 * system_memory 工具：返回系统内存信息。
 *
 * 极简输出（默认）：total、free（字节）
 * verbose 输出：额外 used、swapTotal?、swapFree?
 */

/** 输入 schema：verbose 可选布尔。 */
export const systemMemoryInputSchema = z.object({
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回完整内存信息（含 used、swap）'),
});

/** system_memory 输入类型。 */
export type SystemMemoryInput = z.infer<typeof systemMemoryInputSchema>;

/** 极简输出字段。 */
interface SystemMemoryMinimal {
  total: number;
  free: number;
}

/** verbose 输出字段。 */
interface SystemMemoryFull extends SystemMemoryMinimal {
  used: number;
  swapTotal?: number;
  swapFree?: number;
}

/**
 * 读取 Linux swap 信息（从 /proc/meminfo）。其他平台返回空对象。
 *
 * /proc/meminfo 中 SwapTotal/SwapFree 单位为 kB，转换为字节。
 *
 * @returns { swapTotal?, swapFree? }，单位字节；不可读时为空对象
 */
async function readSwapInfo(): Promise<{ swapTotal?: number; swapFree?: number }> {
  if (os.platform() !== 'linux') return {};
  try {
    const content = await readFile('/proc/meminfo', 'utf8');
    let swapTotal: number | undefined;
    let swapFree: number | undefined;
    for (const line of content.split('\n')) {
      const m = /^(\w+):\s+(\d+)/.exec(line);
      if (!m) continue;
      const key = m[1]!;
      // /proc/meminfo 单位为 kB，转换为字节
      const value = Number(m[2]!) * 1024;
      if (key === 'SwapTotal') swapTotal = value;
      else if (key === 'SwapFree') swapFree = value;
    }
    return { swapTotal, swapFree };
  } catch {
    return {};
  }
}

/**
 * system_memory handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemMemoryHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const verbose = args['verbose'] === true;
  const total = os.totalmem();
  const free = os.freemem();

  const minimal: SystemMemoryMinimal = { total, free };

  const used = total - free;
  const swap = await readSwapInfo();
  const full: SystemMemoryFull = { total, free, used, ...swap };
  return ok(withVerbose(minimal, full, verbose)) as unknown as AnyToolResult;
}

/** system_memory 工具定义。 */
export const systemMemoryTool: Tool = {
  name: 'system_memory',
  description:
    '获取系统内存信息（total/free，字节）。开启 verbose 时返回 used 与 swap 信息。',
  inputSchema: systemMemoryInputSchema,
  handler: systemMemoryHandler,
};

// ---------------------------------------------------------------------------
// system_path：PATH 条目列表
// ---------------------------------------------------------------------------

/**
 * system_path 工具：返回 PATH 环境变量条目列表。
 *
 * 极简输出（默认）：entries（string[]）
 * verbose 输出：额外 count、existing（实际存在的目录数）
 */

/** 输入 schema：verbose 可选布尔。 */
export const systemPathInputSchema = z.object({
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回 count 与 existing 统计'),
});

/** system_path 输入类型。 */
export type SystemPathInput = z.infer<typeof systemPathInputSchema>;

/** 极简输出字段。 */
interface SystemPathMinimal {
  entries: string[];
}

/** verbose 输出字段。 */
interface SystemPathFull extends SystemPathMinimal {
  count: number;
  existing: number;
}

/** PATH 分隔符：Windows 用 ;，unix 用 :。 */
const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';

/**
 * 获取 PATH 环境变量（跨平台兼容 Path/PATH 大小写）。
 *
 * @returns PATH 字符串，未设置时为空串
 */
function getPathEnv(): string {
  const env = process.env;
  return env['PATH'] ?? env['Path'] ?? '';
}

/**
 * system_path handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemPathHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const verbose = args['verbose'] === true;
  const pathStr = getPathEnv();
  const entries = pathStr.length > 0 ? pathStr.split(PATH_SEPARATOR) : [];

  const minimal: SystemPathMinimal = { entries };

  let existing = 0;
  for (const entry of entries) {
    if (entry.length > 0 && existsSync(entry)) existing++;
  }
  const full: SystemPathFull = { entries, count: entries.length, existing };
  return ok(withVerbose(minimal, full, verbose)) as unknown as AnyToolResult;
}

/** system_path 工具定义。 */
export const systemPathTool: Tool = {
  name: 'system_path',
  description:
    '获取 PATH 环境变量条目列表。开启 verbose 时返回 count 与 existing（实际存在的目录数）。',
  inputSchema: systemPathInputSchema,
  handler: systemPathHandler,
};