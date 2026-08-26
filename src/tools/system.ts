/**
 * system_info 工具：返回当前系统信息。
 *
 * 极简输出（默认）：os、arch、platform、hostname、cwd、node
 * verbose 输出：额外 uptime、loadavg、cpus、totalmem、freemem
 */

import os from "node:os";
import { statfs, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { ok, withVerbose, type AnyToolResult } from "../contract/output.js";
import { toFail } from "../utils/errors.js";
import { IS_WIN } from "../utils/platform.js";
import type { Tool } from "../registry.js";

/** 输入 schema：verbose 可选布尔。 */
export const systemInfoInputSchema = z.object({
  verbose: z.boolean().optional().describe("额外返回 uptime/内存/CPU"),
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
  time: string;
}

/** verbose 输出字段。 */
interface SystemInfoFull extends SystemInfoMinimal {
  uptime: number;
  loadavg: number[];
  cpus: number;
  cpuModel?: string;
  cpuUsage?: number;
  cpuUsagePerCore?: number[];
  totalmem: number;
  freemem: number;
}

/**
 * 采样 CPU 使用率（尽力而为）。
 *
 * 对 os.cpus().times 进行两次采样，计算 idle/total 增量，得出平均使用率。
 *
 * @param delayMs 两次采样间隔
 * @returns { cpuUsage: 平均使用率 0-100, cpuUsagePerCore: 每核使用率 }
 */
async function sampleCpuUsage(
  delayMs = 80,
): Promise<{ cpuUsage: number; cpuUsagePerCore: number[] }> {
  const readTimes = () => os.cpus().map((c) => c.times);
  const first = readTimes();
  await new Promise((r) => setTimeout(r, delayMs));
  const second = readTimes();

  const perCore = second.map((t2, i) => {
    const t1 = first[i];
    if (!t1) return 0;
    const idleDelta = t2.idle - t1.idle;
    const totalDelta =
      t2.user -
      t1.user +
      (t2.nice - t1.nice) +
      (t2.sys - t1.sys) +
      idleDelta +
      (t2.irq - t1.irq);
    if (totalDelta <= 0) return 0;
    const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.max(0, Math.min(100, usage));
  });

  const cpuUsage = perCore.length
    ? perCore.reduce((a, b) => a + b, 0) / perCore.length
    : 0;
  return { cpuUsage, cpuUsagePerCore: perCore };
}

/**
 * system_info handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemInfoHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const verbose = args["verbose"] === true;

  const minimal: SystemInfoMinimal = {
    os: os.type(),
    arch: os.arch(),
    platform: os.platform(),
    hostname: os.hostname(),
    cwd: process.cwd(),
    node: process.version,
    time: new Date().toISOString(),
  };

  const cpus = os.cpus();
  const cpuUsage = verbose ? await sampleCpuUsage() : undefined;
  const full: SystemInfoFull = {
    ...minimal,
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model,
    ...(cpuUsage ?? {}),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
  };

  // 接口类型无索引签名，需经 unknown 中转赋给 AnyToolResult
  return ok(withVerbose(minimal, full, verbose));
}

/**
 * system_info 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ os, arch, platform, hostname, cwd, node, time }`；
 * verbose 额外返回 `{ uptime, loadavg, cpus, cpuModel?, cpuUsage?, cpuUsagePerCore?, totalmem, freemem }`。
 * verbose 专属字段用 optional 表达最通用形状。
 */
export const systemInfoOutputSchema = z.object({
  os: z.string(),
  arch: z.string(),
  platform: z.string(),
  hostname: z.string(),
  cwd: z.string(),
  node: z.string(),
  time: z.string(),
  uptime: z.number().optional(),
  loadavg: z.array(z.number()).optional(),
  cpus: z.number().int().nonnegative().optional(),
  cpuModel: z.string().optional(),
  cpuUsage: z.number().optional(),
  cpuUsagePerCore: z.array(z.number()).optional(),
  totalmem: z.number().optional(),
  freemem: z.number().optional(),
});

/** system_info 工具定义。 */
export const systemInfoTool: Tool = {
  name: "system_info",
  domain: "system",
  description:
    "获取系统信息（os/arch/hostname/cwd/node）。verbose 时额外返回 uptime/cpus/内存。",
  inputSchema: systemInfoInputSchema,
  outputSchema: systemInfoOutputSchema,
  annotations: { readOnlyHint: true },
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

/** 输入 schema：path 可选，默认 process.cwd()；all 可选，枚举所有磁盘。 */
export const systemDiskInputSchema = z.object({
  path: z.string().optional().describe("默认当前工作目录"),
  all: z.boolean().optional().describe("枚举所有盘，返回 {disks}"),
});

/** system_disk 输入类型。 */
export type SystemDiskInput = z.infer<typeof systemDiskInputSchema>;

/** system_disk 单条目输出字段。 */
interface SystemDiskEntry {
  total: number;
  free: number;
  used: number;
  path: string;
  type: string;
}

/** system_disk 单路径输出字段。 */
interface SystemDiskResult {
  total: number;
  free: number;
  used: number;
  path: string;
}

/** system_disk 多盘输出字段。 */
interface SystemDiskAllResult {
  disks: SystemDiskEntry[];
}

/**
 * 从 statfs 结果构造单盘条目。
 *
 * @param stats statfs 结果
 * @param path 挂载点/盘符
 * @param type 文件系统类型（尽力而为，未知时为空串）
 * @returns 单盘条目
 */
function buildDiskEntry(
  stats: Awaited<ReturnType<typeof statfs>>,
  path: string,
  type: string,
): SystemDiskEntry {
  // statfs 的 bsize/blocks/bfree 类型为 number | bigint，用 Number 归一为 number
  const bsize = Number(stats.bsize);
  const blocks = Number(stats.blocks);
  const bfree = Number(stats.bfree);
  const total = bsize * blocks;
  const free = bsize * bfree;
  const used = total - free;
  return { total, free, used, path, type };
}

/**
 * 枚举 Windows 存在的盘符根目录（A:-Z:）。
 *
 * 用 existsSync 探测每个盘符根是否存在。
 *
 * @returns 存在的盘符根列表（如 ['C:\\', 'D:\\']）
 */
function enumerateWindowsDrives(): string[] {
  const roots: string[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      if (existsSync(root)) roots.push(root);
    } catch {
      /* c8 ignore next */
      // 忽略访问异常的盘符
    }
  }
  return roots;
}

/**
 * 枚举 unix 挂载点。
 * 仅在非 Windows 平台执行，当前 CI 仅 Windows，故排除出覆盖率统计。
 *
 * Linux：解析 /proc/mounts，过滤伪文件系统；macOS：尽力而为仅探测根挂载。
 *
 * @returns 磁盘条目列表
 */
/* c8 ignore start */
async function enumerateUnixDisks(): Promise<SystemDiskEntry[]> {
  const entries: SystemDiskEntry[] = [];
  if (os.platform() === "linux") {
    const skip = new Set([
      "proc",
      "sysfs",
      "devpts",
      "tmpfs",
      "devtmpfs",
      "cgroup",
      "cgroup2",
      "overlay",
      "securityfs",
      "mqueue",
      "hugetlbfs",
      "pstore",
      "bpf",
      "debugfs",
      "tracefs",
      "fusectl",
      "configfs",
      "autofs",
      "binfmt_misc",
    ]);
    try {
      const content = await readFile("/proc/mounts", "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split(/\s+/);
        const mountPoint = parts[1];
        const fstype = parts[2];
        if (!mountPoint || !fstype || skip.has(fstype)) continue;
        try {
          const stats = await statfs(mountPoint);
          entries.push(buildDiskEntry(stats, mountPoint, fstype));
        } catch {
          // 跳过不可访问的挂载点
        }
      }
    } catch {
      // 读 /proc/mounts 失败则返回空
    }
  } else {
    // macOS 及其他平台：尽力而为，仅探测根挂载
    try {
      const stats = await statfs("/");
      entries.push(buildDiskEntry(stats, "/", ""));
    } catch {
      // 忽略
    }
  }
  return entries;
}
/* c8 ignore stop */

/**
 * 枚举所有磁盘/挂载点。
 *
 * Windows：盘符 A:-Z: 探测存在后逐个 statfs；unix：见 enumerateUnixDisks。
 *
 * @returns 磁盘条目列表
 */
async function enumerateDisks(): Promise<SystemDiskEntry[]> {
  if (IS_WIN) {
    const entries: SystemDiskEntry[] = [];
    for (const root of enumerateWindowsDrives()) {
      try {
        const stats = await statfs(root);
        entries.push(buildDiskEntry(stats, root, ""));
      } catch {
        // 跳过不可访问的盘符
      }
    }
    return entries;
  }
  /* c8 ignore next */
  return enumerateUnixDisks();
}

/**
 * system_disk handler。
 *
 * @param args 已验证的参数（含可选 path 与 all）
 * @returns 统一输出契约；all=true 返回 { disks: [...] }；path 不存在时返回 ENOENT
 */
export async function systemDiskHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const rawPath = args["path"];
  const all = args["all"] === true;

  // all=true：枚举多盘
  if (all) {
    const disks = await enumerateDisks();
    const result: SystemDiskAllResult = { disks };
    return ok(result) as unknown as AnyToolResult;
  }

  const path =
    typeof rawPath === "string" && rawPath.length > 0 ? rawPath : process.cwd();

  try {
    const stats = await statfs(path);
    const { total, free, used } = buildDiskEntry(stats, path, "");
    const result: SystemDiskResult = { total, free, used, path };
    return ok(result);
  } catch (err) {
    return toFail(err);
  }
}

/**
 * system_disk 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 单盘模式返回 `{ total, free, used, path }`；
 * all=true 模式返回 `{ disks: [{ total, free, used, path, type }] }`。
 * 两种形状互斥，用 optional 字段表达最通用形状。
 */
export const systemDiskOutputSchema = z.object({
  total: z.number().optional(),
  free: z.number().optional(),
  used: z.number().optional(),
  path: z.string().optional(),
  disks: z
    .array(
      z.object({
        total: z.number(),
        free: z.number(),
        used: z.number(),
        path: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
});

/** system_disk 工具定义。 */
export const systemDiskTool: Tool = {
  name: "system_disk",
  domain: "system",
  description:
    "获取磁盘用量（total/free/used，字节，≈ df）。all=true 枚举所有盘返回 {disks}。",
  inputSchema: systemDiskInputSchema,
  outputSchema: systemDiskOutputSchema,
  annotations: { readOnlyHint: true },
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
  verbose: z.boolean().optional().describe("额外返回 used/swap"),
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
async function readSwapInfo(): Promise<{
  swapTotal?: number;
  swapFree?: number;
}> {
  if (os.platform() !== "linux") return {};
  /* c8 ignore start */
  try {
    const content = await readFile("/proc/meminfo", "utf8");
    let swapTotal: number | undefined;
    let swapFree: number | undefined;
    for (const line of content.split("\n")) {
      const m = /^(\w+):\s+(\d+)/.exec(line);
      if (!m) continue;
      const key = m[1]!;
      // /proc/meminfo 单位为 kB，转换为字节
      const value = Number(m[2]!) * 1024;
      if (key === "SwapTotal") swapTotal = value;
      else if (key === "SwapFree") swapFree = value;
    }
    return { swapTotal, swapFree };
  } catch {
    return {};
  }
  /* c8 ignore stop */
}

/**
 * system_memory handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemMemoryHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const verbose = args["verbose"] === true;
  const total = os.totalmem();
  const free = os.freemem();

  const minimal: SystemMemoryMinimal = { total, free };

  const used = total - free;
  const swap = await readSwapInfo();
  const full: SystemMemoryFull = { total, free, used, ...swap };
  return ok(withVerbose(minimal, full, verbose));
}

/**
 * system_memory 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ total, free }`；verbose 额外返回 `{ used, swapTotal?, swapFree? }`。
 */
export const systemMemoryOutputSchema = z.object({
  total: z.number(),
  free: z.number(),
  used: z.number().optional(),
  swapTotal: z.number().optional(),
  swapFree: z.number().optional(),
});

/** system_memory 工具定义。 */
export const systemMemoryTool: Tool = {
  name: "system_memory",
  domain: "system",
  description:
    "获取内存信息（total/free，字节，≈ free）。verbose 时额外返回 used/swap。",
  inputSchema: systemMemoryInputSchema,
  outputSchema: systemMemoryOutputSchema,
  annotations: { readOnlyHint: true },
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
  verbose: z.boolean().optional().describe("额外返回 count/existing"),
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
const PATH_SEPARATOR = process.platform === "win32" ? ";" : ":";

/**
 * 获取 PATH 环境变量（跨平台兼容 Path/PATH 大小写）。
 *
 * @returns PATH 字符串，未设置时为空串
 */
function getPathEnv(): string {
  const env = process.env;
  return env["PATH"] ?? env["Path"] ?? "";
}

/**
 * system_path handler。
 *
 * @param args 已验证的参数（含 verbose 开关）
 * @returns 统一输出契约
 */
export async function systemPathHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const verbose = args["verbose"] === true;
  const pathStr = getPathEnv();
  const entries = pathStr.length > 0 ? pathStr.split(PATH_SEPARATOR) : [];

  const minimal: SystemPathMinimal = { entries };

  let existing = 0;
  for (const entry of entries) {
    if (entry.length > 0 && existsSync(entry)) existing++;
  }
  const full: SystemPathFull = { entries, count: entries.length, existing };
  return ok(withVerbose(minimal, full, verbose));
}

/**
 * system_path 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ entries: string[] }`；verbose 额外返回 `{ count, existing }`。
 */
export const systemPathOutputSchema = z.object({
  entries: z.array(z.string()),
  count: z.number().int().nonnegative().optional(),
  existing: z.number().int().nonnegative().optional(),
});

/** system_path 工具定义。 */
export const systemPathTool: Tool = {
  name: "system_path",
  domain: "system",
  description:
    "获取 PATH 条目列表。verbose 时额外返回 count 与 existing（实际存在的目录数）。",
  inputSchema: systemPathInputSchema,
  outputSchema: systemPathOutputSchema,
  annotations: { readOnlyHint: true },
  handler: systemPathHandler,
};
