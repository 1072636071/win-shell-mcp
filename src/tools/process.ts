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

import { z } from 'zod';
import { ok, fail, withVerbose, type AnyToolResult } from '../contract/output.js';
import { ErrorCode, toErrorMessage } from '../contract/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
import { execFileAsync } from '../exec/run.js';
import { IS_WIN } from '../utils/platform.js';
import type { Tool } from '../registry.js';

/** Windows taskkill 错误关键词（进程不存在）。 */
const TASKKILL_NOT_FOUND_PATTERNS = ['找不到', 'not found', 'no such process'];
/** Windows taskkill 错误关键词（权限拒绝）。 */
const TASKKILL_ACCESS_DENIED_PATTERNS = ['access is denied', '拒绝访问'];

// ===================== process_list =====================

/** process_list 输入 schema。 */
export const processListInputSchema = z.object({
  filter: z
    .string()
    .optional()
    .describe('按进程名过滤（includes 匹配，大小写敏感）'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回每个进程的内存使用（尽力而为）'),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('返回结果上限，超出则截断并标记 truncated'),
});

/** 进程条目（极简）。 */
interface ProcessEntry {
  pid: number;
  name: string;
}

/** 进程条目（verbose，含内存）。 */
interface ProcessEntryVerbose extends ProcessEntry {
  memory?: number;
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
function parseTasklistLine(line: string): ProcessEntryVerbose | null {
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
      if (line[i] === ',') i++;
    } else {
      // 无引号字段
      const end = line.indexOf(',', i);
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
      const memNum = Number(memMatch[1]!.replace(/,/g, ''));
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
function parsePsLine(line: string): ProcessEntry | null {
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
  const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], {
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

/**
 * 列出 unix 进程（ps）。
 *
 * @returns 进程条目列表
 */
async function listUnixProcesses(): Promise<ProcessEntry[]> {
  // pid=,comm= 去除表头（赋空标题）
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,comm='], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const result: ProcessEntry[] = [];
  for (const line of stdout.split('\n')) {
    const entry = parsePsLine(line);
    if (entry) result.push(entry);
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
export async function processListHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const filter = args['filter'];
  const verbose = args['verbose'] === true;
  const maxResults = args['maxResults'];

  let entries: ProcessEntryVerbose[];
  try {
    if (IS_WIN) {
      entries = await listWindowsProcesses();
    } else {
      entries = (await listUnixProcesses()) as ProcessEntryVerbose[];
    }
  } catch (err) {
    return fail(ErrorCode.EXEC_FAIL, `执行进程列表命令失败: ${toErrorMessage(err)}`);
  }

  // filter 按进程名 includes 匹配
  let filtered: ProcessEntryVerbose[];
  if (typeof filter === 'string' && filter.length > 0) {
    filtered = entries.filter((e) => e.name.includes(filter));
  } else {
    filtered = entries;
  }

  // maxResults 截断
  const limit = typeof maxResults === 'number' && maxResults > 0 ? Math.floor(maxResults) : null;
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

/** process_list 工具定义。 */
export const processListTool: Tool = {
  name: 'process_list',
  description:
    '列出运行中进程。返回 { processes: [{ pid, name }], truncated }。filter 按进程名过滤；verbose 含内存；maxResults 截断。',
  inputSchema: processListInputSchema,
  handler: processListHandler,
};

// ===================== process_kill =====================

/** process_kill 输入 schema。 */
export const processKillInputSchema = z.object({
  pid: z.number().int().describe('进程 ID'),
  signal: z
    .string()
    .optional()
    .describe('信号名（unix），默认 SIGTERM；force 为 true 时覆盖为 SIGKILL'),
  force: z.boolean().optional().describe('若为 true，强制终止（unix 用 SIGKILL，Windows 加 /F）'),
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
 * @throws NodeJS.ErrnoException 退出码非 0 时
 */
async function killWindowsProcess(pid: number, force: boolean): Promise<void> {
  const args = ['/PID', String(pid)];
  if (force) args.unshift('/F');
  // 用 encoding: 'buffer' 获取原始字节，再用 decodeBuffer 自动识别 GBK/UTF-8
  // taskkill 退出码非 0 时 execFile 抛错；message 含命令文本，stderr 含中文/英文提示
  await execFileAsync('taskkill', args, { windowsHide: true, encoding: 'buffer' });
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

/**
 * process_kill handler：按 PID 终止进程。
 *
 * signal 默认 'SIGTERM'；force 为 true 时 unix 用 'SIGKILL'，Windows 加 /F。
 * 返回 `{ killed: true, pid }`。
 *
 * 错误：
 * - pid 非法（非整数）→ EINVAL
 * - PID 不存在 → PROC_NOT_FOUND（unix ESRCH 映射到 PROC_NOT_FOUND）
 * - 无权限 → EACCES（unix EPERM 映射到 EACCES）
 * - 命令执行失败 → PROC_KILL_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function processKillHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const rawPid = args['pid'];
  const force = args['force'] === true;
  const rawSignal = args['signal'];

  // pid 非法检查
  if (typeof rawPid !== 'number' || !Number.isInteger(rawPid)) {
    return fail(ErrorCode.EINVAL, 'pid 必须是整数');
  }
  const pid = rawPid;

  // signal 决定：force 优先 SIGKILL，否则用显式 signal，否则默认 SIGTERM
  let signal: string;
  if (force) {
    signal = 'SIGKILL';
  } else if (typeof rawSignal === 'string' && rawSignal.length > 0) {
    signal = rawSignal;
  } else {
    signal = 'SIGTERM';
  }

  try {
    if (IS_WIN) {
      await killWindowsProcess(pid, force);
    } else {
      killUnixProcess(pid, signal);
    }
  } catch (err) {
    // 映射错误码
    const code = (err as NodeJS.ErrnoException).code;
    const msg = toErrorMessage(err);
    // unix: ESRCH（进程不存在）→ PROC_NOT_FOUND；EPERM（无权限）→ EACCES
    if (code === 'ESRCH') return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${pid}`);
    if (code === 'EPERM') return fail(ErrorCode.EACCES, `无权限终止进程: ${pid}`);
    if (code === 'EINVAL') return fail(ErrorCode.EINVAL, `pid 或信号非法: ${msg}`);

    // Windows taskkill 错误识别：
    // - code 为数字退出码（128=找不到进程，1=通用失败）
    // - stderr 为 GBK 编码中文，需用 decodeBuffer 解码后匹配关键词
    if (IS_WIN) {
      const stderrBuf = (err as { stderr?: Buffer }).stderr;
      const stderrText = Buffer.isBuffer(stderrBuf)
        ? decodeBuffer(stderrBuf)
        : typeof stderrBuf === 'string'
          ? stderrBuf
          : '';
      const text = stderrText.toLowerCase();

      // 退出码 128 → 进程不存在
      if (Number(code) === 128) return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${pid}`);
      // 中文/英文关键词匹配
      if (TASKKILL_NOT_FOUND_PATTERNS.some((p) => text.includes(p))) {
        return fail(ErrorCode.PROC_NOT_FOUND, `进程不存在: ${pid}`);
      }
      if (TASKKILL_ACCESS_DENIED_PATTERNS.some((p) => text.includes(p))) {
        return fail(ErrorCode.EACCES, `无权限终止进程: ${pid}`);
      }
      // "无法终止" / "只能强制终止" → 需 force，视为终止失败
      if (text.includes('无法终止') || text.includes('强制终止')) {
        return fail(ErrorCode.PROC_KILL_FAIL, `无法终止进程（可能需要 force=true）: ${pid}`);
      }
    }

    // 其他执行错误
    return fail(ErrorCode.PROC_KILL_FAIL, `终止进程失败: ${msg}`);
  }

  const result: ProcessKillResult = { killed: true, pid };
  return ok(result);
}

/** process_kill 工具定义。 */
export const processKillTool: Tool = {
  name: 'process_kill',
  description:
    '按 PID 终止进程。signal 默认 SIGTERM；force 为 true 时 unix 用 SIGKILL，Windows 加 /F。返回 { killed, pid }。',
  inputSchema: processKillInputSchema,
  handler: processKillHandler,
};