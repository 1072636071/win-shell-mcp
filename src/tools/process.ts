/**
 * process 工具集：process_list / process_kill。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 极简输出：默认只含 AI 决策所需最小字段
 * - verbose：需要完整数据时开启
 * - 统一错误码：PROC_NOT_FOUND/PROC_KILL_FAIL/EACCES/EINVAL
 *
 * 跨平台：
 * - Windows：tasklist / taskkill
 * - unix（Linux/macOS）：ps / process.kill
 */

import { z } from "zod";
import {
  ok,
  fail,
  withVerbose,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode, toErrorMessage } from "../contract/errors.js";
import { decodeBuffer } from "../encoding/detect.js";
import { execFileAsync } from "../exec/run.js";
import { IS_WIN } from "../utils/platform.js";
import type { Tool } from "../registry.js";

/** Windows taskkill 错误关键词（进程不存在）。 */
const TASKKILL_NOT_FOUND_PATTERNS = ["找不到", "not found", "no such process"];
/** Windows taskkill 错误关键词（权限拒绝）。 */
const TASKKILL_ACCESS_DENIED_PATTERNS = ["access is denied", "拒绝访问"];

// ===================== process_list =====================

/** process_list 输入 schema。 */
export const processListInputSchema = z.object({
  filter: z.string().optional().describe("includes 匹配，大小写不敏感"),
  verbose: z.boolean().optional().describe("尽力而为"),
  maxResults: z.number().int().positive().optional(),
});

/** 进程条目（极简）。 */
interface ProcessEntry {
  pid: number;
  name: string;
}

/** 进程条目（verbose，含内存与命令行）。 */
interface ProcessEntryVerbose extends ProcessEntry {
  memory?: number;
  cmdline?: string;
}

/** process_list 输出（极简）。 */
interface ProcessListResult {
  processes: ProcessEntry[];
  truncated: boolean;
}

/** process_list 输出（verbose）。 */
interface ProcessListResultVerbose {
  processes: ProcessEntryVerbose[];
  truncated: boolean;
}

/**
 * 解析 tasklist CSV 行（Windows）。
 *
 * tasklist /FO CSV /NH 输出形如：
 *   "System Idle Process","0","Services","0","8 KBytes"
 *   "cmd.exe","1234","Console","1","5,120 KBytes"
 *
 * 列顺序：映像名,PID,会话名,会话#,内存使用
 * 内存字段格式 "5,120 KBytes"（含千分位逗号与单位）。
 *
 * @param line CSV 行
 * @returns 解析后的进程条目（含可选 memory）；解析失败返回 null
 */
export function parseTasklistLine(line: string): ProcessEntryVerbose | null {
  if (line.length === 0) return null;
  // 简易 CSV 解析：字段以逗号分隔，每个字段可能被双引号包围
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // 引号字段
      const end = line.indexOf('"', i + 1);
      if (end === -1) return null;
      fields.push(line.slice(i + 1, end));
      i = end + 1;
      // 跳过逗号
      if (line[i] === ",") i++;
    } else {
      // 无引号字段
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        i = line.length;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }

  // 至少需要映像名与 PID
  if (fields.length < 2) return null;
  const name = fields[0]!;
  const pid = Number(fields[1]);
  if (!Number.isInteger(pid) || pid < 0) return null;

  const entry: ProcessEntryVerbose = { pid, name };

  // 第 5 列为内存使用（"5,120 KBytes"）
  if (fields.length >= 5) {
    const memStr = fields[4]!;
    // 提取数字部分（去掉逗号与单位）
    const memMatch = /([\d,]+)/.exec(memStr);
    if (memMatch) {
      const memNum = Number(memMatch[1]!.replace(/,/g, ""));
      if (Number.isFinite(memNum)) {
        // tasklist 单位为 KBytes，转换为字节
        entry.memory = memNum * 1024;
      }
    }
  }

  return entry;
}

/**
 * 解析 ps 行（unix）。
 *
 * ps -eo pid=,comm= 输出形如：
 *   "  1 /sbin/init"
 *   " 1234 node"
 *
 * @param line ps 行
 * @returns 解析后的进程条目；解析失败返回 null
 */
export function parsePsLine(line: string): ProcessEntry | null {
  // 去除首尾空白后按空白拆分：第一段为 pid，剩余为 comm
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) return null;
  const pidStr = trimmed.slice(0, spaceIdx);
  const name = trimmed.slice(spaceIdx).trim();
  const pid = Number(pidStr);
  if (!Number.isInteger(pid) || pid < 0) return null;
  if (name.length === 0) return null;
  return { pid, name };
}

/**
 * 列出 Windows 进程（tasklist）。
 *
 * @returns 进程条目列表（含可选 memory）
 */
async function listWindowsProcesses(): Promise<ProcessEntryVerbose[]> {
  // /FO CSV：CSV 格式；/NH：无表头
  const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"], {
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const result: ProcessEntryVerbose[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const entry = parseTasklistLine(line);
    if (entry) result.push(entry);
  }
  return result;
}

/* c8 ignore start */
/**
 * 列出 unix 进程（ps）。
 * 仅在非 Windows 平台执行，当前 CI 仅 Windows，故排除出覆盖率统计。
 *
 * @returns 进程条目列表
 */
async function listUnixProcesses(): Promise<ProcessEntry[]> {
  // pid=,comm= 去除表头（赋空标题）
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,comm="], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const result: ProcessEntry[] = [];
  for (const line of stdout.split("\n")) {
    const entry = parsePsLine(line);
    if (entry) result.push(entry);
  }
  return result;
}

/**
 * 列出 Windows 进程（verbose）。
 *
 * tasklist 拿基础列表（含 memory）。cmdline 在 Windows 上依赖 WMI/PowerShell，
 * 与 ADR-0005 纯 Node 原则冲突，故 verbose 在 Windows 仅返回 memory，不返回 cmdline。
 */
async function listWindowsProcessesVerbose(): Promise<ProcessEntryVerbose[]> {
  return listWindowsProcesses();
}

/**
 * 列出 unix 进程（verbose，含 cmdline）。
 *
 * ps -ww -o pid=,comm=,args=：ww 不截断宽度，comm 为进程名（不含空格），args 为完整命令行。
 */
async function listUnixProcessesVerbose(): Promise<ProcessEntryVerbose[]> {
  const { stdout } = await execFileAsync(
    "ps",
    ["-ww", "-o", "pid=,comm=,args="],
    {
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const result: ProcessEntryVerbose[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const sp1 = trimmed.search(/\s/);
    if (sp1 === -1) continue;
    const pidStr = trimmed.slice(0, sp1);
    const pid = Number(pidStr);
    if (!Number.isInteger(pid) || pid < 0) continue;
    const rest = trimmed.slice(sp1).trimStart();
    const sp2 = rest.search(/\s/);
    const name = sp2 === -1 ? rest : rest.slice(0, sp2);
    if (name.length === 0) continue;
    const cmdline = sp2 === -1 ? "" : rest.slice(sp2).trimStart();
    result.push({ pid, name, cmdline });
  }
  return result;
}

/**
 * 收集 unix 进程树后代（含自身）。
 *
 * ps -eo pid=,ppid= 拿全表，建 ppid → children 映射，DFS 收集 root 的所有后代。
 *
 * @param rootPid 根进程 pid
 * @returns 后代 pid 列表（含 rootPid，root 在前）
 */
async function collectUnixDescendants(rootPid: number): Promise<number[]> {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid="], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const children = new Map<number, number[]>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    if (!Number.isInteger(pid) || pid < 0) continue;
    if (!Number.isInteger(ppid) || ppid < 0) continue;
    const arr = children.get(ppid) ?? [];
    arr.push(pid);
    children.set(ppid, arr);
  }
  const result: number[] = [];
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    result.push(pid);
    const kids = children.get(pid) ?? [];
    for (const k of kids) stack.push(k);
  }
  return result;
}

/**
 * process_list handler：列出运行中进程。
 *
 * 极简返回 `{ processes: [{ pid, name }], truncated }`。
 * verbose 时每个进程额外含 `memory`（尽力而为）。
 * filter 按进程名 includes 匹配。
 * maxResults 截断并标记 truncated。
 *
 * 错误：命令执行失败→EXEC_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function processListHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filter = args["filter"];
  const verbose = args["verbose"] === true;
  const maxResults = args["maxResults"];

  let entries: ProcessEntryVerbose[];
  try {
    if (IS_WIN) {
      entries = verbose
        ? await listWindowsProcessesVerbose()
        : await listWindowsProcesses();
    } else {
      entries = verbose
        ? await listUnixProcessesVerbose()
        : ((await listUnixProcesses()) as ProcessEntryVerbose[]);
    }
  } catch (err) {
    return fail(
      ErrorCode.EXEC_FAIL,
      `执行进程列表命令失败: ${toErrorMessage(err)}`,
    );
  }

  // filter 按进程名 includes 匹配（大小写不敏感）
  let filtered: ProcessEntryVerbose[];
  if (typeof filter === "string" && filter.length > 0) {
    const lower = filter.toLowerCase();
    filtered = entries.filter((e) => e.name.toLowerCase().includes(lower));
  } else {
    filtered = entries;
  }

  // maxResults 截断
  const limit =
    typeof maxResults === "number" && maxResults > 0
      ? Math.floor(maxResults)
      : null;
  let truncated = false;
  if (limit !== null && filtered.length > limit) {
    filtered = filtered.slice(0, limit);
    truncated = true;
  }

  // verbose 控制是否输出 memory：极简版剥离 memory，verbose 版保留
  const minimal: ProcessListResult = {
    processes: filtered.map((e) => ({ pid: e.pid, name: e.name })),
    truncated,
  };
  const full: ProcessListResultVerbose = {
    processes: filtered,
    truncated,
  };
  const result = withVerbose(minimal, full, verbose);
  return ok(result);
}

/**
 * process_list 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ processes: [{ pid, name }], truncated }`；
 * verbose 时每个进程额外含 `memory?` 与 `cmdline?`（尽力而为）。
 * 用 optional 字段表达最通用形状。
 */
export const processListOutputSchema = z.object({
  processes: z.array(
    z.object({
      pid: z.number().int().nonnegative(),
      name: z.string(),
      memory: z.number().optional(),
      cmdline: z.string().optional(),
    }),
  ),
  truncated: z.boolean(),
});

/** process_list 工具定义。 */
export const processListTool: Tool = {
  name: "process_list",
  domain: "process",
  description:
    "列出运行中进程（≈ ps）。返回 { processes: [{ pid, name }], truncated }。verbose 含内存与命令行（Windows 仅内存）。maxResults 截断。",
  inputSchema: processListInputSchema,
  outputSchema: processListOutputSchema,
  annotations: { readOnlyHint: true },
  aliases: ["ps"],
  handler: processListHandler,
};

// ===================== process_kill =====================

/** process_kill 输入 schema。 */
export const processKillInputSchema = z.object({
  pid: z.number().int().optional().describe("pid 与 name 至少提供其一"),
  name: z.string().optional().describe("按名称终止所有匹配"),
  signal: z.string().optional().describe("unix 信号名"),
  force: z.boolean().optional(),
  tree: z.boolean().optional(),
});

/** process_kill 输出。 */
interface ProcessKillResult {
  killed: boolean;
  pid: number;
}

/**
 * 终止 Windows 进程（taskkill）。
 *
 * @param pid 进程 ID
 * @param force 是否强制
 * @param tree 是否连同子进程（/T）
 * @throws NodeJS.ErrnoException 退出码非 0 时
 */
async function killWindowsProcess(
  pid: number,
  force: boolean,
  tree: boolean,
): Promise<void> {
  const args = ["/PID", String(pid)];
  if (force) args.unshift("/F");
  if (tree) args.unshift("/T");
  // 用 encoding: 'buffer' 获取原始字节，再用 decodeBuffer 自动识别 GBK/UTF-8
  // taskkill 退出码非 0 时 execFile 抛错；message 含命令文本，stderr 含中文/英文提示
  await execFileAsync("taskkill", args, {
    windowsHide: true,
    encoding: "buffer",
  });
}

/**
 * 终止 unix 进程（process.kill）。
 *
 * @param pid 进程 ID
 * @param signal 信号名
 * @throws Error 进程不存在或无权限时
 */
function killUnixProcess(pid: number, signal: string): void {
  // process.kill 在进程不存在时抛 ESRCH，无权限时抛 EPERM
  // Node 将 ESRCH/EPERM 暴露为 error.code
  process.kill(pid, signal);
}
/* c8 ignore stop */

/**
 * 按给定参数终止单个 pid（跨平台）。
 *
 * 供按 PID 与按名称两个路径共用，消除重复的 IS_WIN 分支终止逻辑。
 *
 * @param pid 进程 ID
 * @param force 是否强制
 * @param signal 信号名（unix）
 * @param tree 是否连同子进程
 */
async function killPid(
  pid: number,
  force: boolean,
  signal: string,
  tree: boolean,
): Promise<void> {
  if (IS_WIN) {
    await killWindowsProcess(pid, force, tree);
  } else {
    if (tree) {
      const descendants = await collectUnixDescendants(pid);
      // 反序 kill：先后代后根，避免孤儿；忽略已退出的 ESRCH
      const errors: unknown[] = [];
      for (let i = descendants.length - 1; i >= 0; i--) {
        const d = descendants[i]!;
        try {
          killUnixProcess(d, signal);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
            errors.push(err);
          }
        }
      }
      if (errors.length > 0) throw errors[0]!;
    } else {
      killUnixProcess(pid, signal);
    }
  }
}

/**
 * 判断进程名是否与查询名匹配。
 *
 * Windows：大小写不敏感，忽略 '.exe' 后缀。
 * unix：comm 与查询名精确匹配（等值，避免误杀名称以查询串结尾的无关注程）。
 * 含平台专属分支，当前 CI 仅 Windows，故排除出覆盖率统计。
 */
/* c8 ignore start */
function matchProcessName(entryName: string, query: string): boolean {
  if (IS_WIN) {
    const norm = (s: string) => s.toLowerCase().replace(/\.exe$/i, "");
    return norm(entryName) === norm(query);
  }
  return entryName === query;
}
/* c8 ignore stop */

/**
 * 统一映射 kill 错误到错误码。命中时返回 fail，未命中返回 null。
 *
 * @param err 捕获的错误
 * @param target 目标描述（pid 或进程名），用于错误信息
 * @returns fail 结果；无映射时返回 null
 */
function mapKillError(err: unknown, target: string): AnyToolResult | null {
  const code = (err as NodeJS.ErrnoException).code;
  const msg = toErrorMessage(err);

  // unix: ESRCH（进程不存在）→ PROC_NOT_FOUND；EPERM（无权限）→ EACCES
  if (code === "ESRCH")
    return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${target}`);
  if (code === "EPERM")
    return fail(ErrorCode.EACCES, `无权限终止进程: ${target}`);
  if (code === "EINVAL")
    return fail(ErrorCode.EINVAL, `pid 或信号非法: ${msg}`);

  // Windows taskkill 错误识别：
  // - code 为数字退出码（128=找不到进程，1=通用失败）
  // - stderr 为 GBK 编码中文，需用 decodeBuffer 解码后匹配关键词
  if (IS_WIN) {
    const stderrBuf = (err as { stderr?: Buffer }).stderr;
    const stderrText = Buffer.isBuffer(stderrBuf)
      ? decodeBuffer(stderrBuf)
      : typeof stderrBuf === "string"
        ? stderrBuf
        : "";
    const text = stderrText.toLowerCase();

    // 退出码 128 → 进程不存在
    if (Number(code) === 128)
      return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${target}`);
    // 中文/英文关键词匹配
    if (TASKKILL_NOT_FOUND_PATTERNS.some((p) => text.includes(p))) {
      return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${target}`);
    }
    if (TASKKILL_ACCESS_DENIED_PATTERNS.some((p) => text.includes(p))) {
      return fail(ErrorCode.EACCES, `无权限终止进程: ${target}`);
    }
    // "无法终止" / "只能强制终止" → 需 force，视为终止失败
    if (text.includes("无法终止") || text.includes("强制终止")) {
      return fail(
        ErrorCode.PROC_KILL_FAIL,
        `无法终止进程（可能需要 force=true）: ${target}`,
      );
    }
  }

  // 其他执行错误
  return fail(ErrorCode.PROC_KILL_FAIL, `终止进程失败: ${msg}`);
}

/**
 * 按名称终止进程（pid 未提供时）。
 *
 * 扫描进程列表，匹配所有同名进程并逐个终止。
 * Windows：对每个命中 pid 执行 taskkill /PID；unix：对每个命中 pid 执行 process.kill。
 * 无命中 → PROC_NOT_FOUND。
 *
 * @param name 进程名
 * @param force 是否强制
 * @param signal 信号名（unix）
 * @returns 统一输出契约
 */
async function killProcessesByName(
  name: string,
  force: boolean,
  signal: string,
  tree: boolean,
): Promise<AnyToolResult> {
  let entries: ProcessEntry[];
  try {
    entries = IS_WIN ? await listWindowsProcesses() : await listUnixProcesses();
  } catch (err) {
    return fail(
      ErrorCode.EXEC_FAIL,
      `执行进程扫描失败: ${toErrorMessage(err)}`,
    );
  }

  const matched = entries.filter((e) => matchProcessName(e.name, name));
  if (matched.length === 0) {
    return fail(ErrorCode.PROC_NOT_FOUND, `未找到名为 ${name} 的进程`);
  }
  const pids = matched.map((p) => p.pid);
  const firstPid = pids[0]!;

  try {
    for (const pid of pids) {
      await killPid(pid, force, signal, tree);
    }
  } catch (err) {
    const mapped = mapKillError(err, name);
    if (mapped) return mapped;
    return fail(
      ErrorCode.PROC_KILL_FAIL,
      `终止进程失败: ${toErrorMessage(err)}`,
    );
  }

  const result: ProcessKillResult = { killed: true, pid: firstPid };
  return ok(result) as unknown as AnyToolResult;
}

/**
 * process_kill handler：按 PID 或进程名终止进程。
 *
 * signal 默认 'SIGTERM'；force 为 true 时 unix 用 'SIGKILL'，Windows 加 /F。
 * pid 提供 → 按 PID 终止（原路径）；仅 name 提供 → 按名称终止所有匹配进程。
 * 返回 `{ killed: true, pid }`。
 *
 * 错误：
 * - pid 与 name 均未提供 → EINVAL
 * - pid 非法（非整数）→ EINVAL
 * - PID/进程名不存在 → PROC_NOT_FOUND（unix ESRCH 映射到 PROC_NOT_FOUND）
 * - 无权限 → EACCES（unix EPERM 映射到 EACCES）
 * - 命令执行失败 → PROC_KILL_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function processKillHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const rawPid = args["pid"];
  const rawName = args["name"];
  const force = args["force"] === true;
  const tree = args["tree"] === true;
  const rawSignal = args["signal"];

  // signal 决定：force 优先 SIGKILL，否则用显式 signal，否则默认 SIGTERM
  let signal: string;
  if (force) {
    signal = "SIGKILL";
  } else if (typeof rawSignal === "string" && rawSignal.length > 0) {
    signal = rawSignal;
  } else {
    signal = "SIGTERM";
  }

  // 按名称终止：pid 未提供但提供了 name
  if (
    typeof rawPid !== "number" &&
    typeof rawName === "string" &&
    rawName.length > 0
  ) {
    return killProcessesByName(rawName, force, signal, tree);
  }

  // pid 非法检查（pid 与 name 均未提供时也归入此处 → EINVAL）
  if (typeof rawPid !== "number" || !Number.isInteger(rawPid)) {
    return fail(ErrorCode.EINVAL, "pid 必须是整数，或用 name 指定进程名");
  }
  const pid = rawPid;

  try {
    await killPid(pid, force, signal, tree);
  } catch (err) {
    const mapped = mapKillError(err, String(pid));
    if (mapped) return mapped;
    return fail(
      ErrorCode.PROC_KILL_FAIL,
      `终止进程失败: ${toErrorMessage(err)}`,
    );
  }

  const result: ProcessKillResult = { killed: true, pid };
  return ok(result);
}

/**
 * process_kill 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ killed, pid }`：是否终止成功与首个匹配 pid。
 */
export const processKillOutputSchema = z.object({
  killed: z.boolean(),
  pid: z.number().int().describe("按名称终止时为首个匹配"),
});

/** process_kill 工具定义。 */
export const processKillTool: Tool = {
  name: "process_kill",
  domain: "process",
  description:
    "按 PID 或进程名终止进程（≈ kill）。pid 或 name 至少提供其一。signal 默认 SIGTERM；force=true 时 unix SIGKILL/Windows /F；tree=true 时连子进程（Windows /T，unix 递归）。",
  inputSchema: processKillInputSchema,
  outputSchema: processKillOutputSchema,
  // 终止进程不可逆，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: processKillHandler,
};
