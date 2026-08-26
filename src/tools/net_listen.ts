/**
 * net_listen 工具：列出本机监听端口及占用进程。
 *
 * 跨平台：
 * - Windows：netstat -ano，解析 LISTENING 行
 * - unix：lsof -i -P -n（解析 LISTEN），失败回退 ss -tlnp
 *
 * 返回 { ports: [{ port, protocol, address, pid }] }。
 */

import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode, toErrorMessage } from "../contract/errors.js";
import { runCommand } from "../exec/run.js";
import { IS_WIN } from "../utils/platform.js";
import type { Tool } from "../registry.js";

/** net_listen 输入 schema。 */
export const netListenInputSchema = z.object({
  filter: z.string().optional().describe("含子串，大小写不敏感"),
});

/** 监听端口条目。 */
interface ListenEntry {
  port: number;
  protocol: string;
  address: string;
  pid: number;
  name?: string;
}

/** net_listen 输出。 */
interface NetListenResult {
  ports: ListenEntry[];
}

/**
 * 解析 Windows netstat -ano 的 LISTENING 行。
 *
 * 行格式：`  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING        1234`
 */
export function parseNetstatLine(line: string): ListenEntry | null {
  const trimmed = line.trim();
  if (!trimmed.toUpperCase().includes("LISTENING")) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) return null;
  const protocol = parts[0]!;
  const local = parts[1]!;
  const pid = Number(parts[parts.length - 1]);
  if (!Number.isInteger(pid) || pid < 0) return null;
  // local 形如 0.0.0.0:135 或 [::]:135 或 [::1]:135
  const colonIdx = local.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const port = Number(local.slice(colonIdx + 1));
  if (!Number.isInteger(port) || port < 0) return null;
  const address = local.slice(0, colonIdx).replace(/^\[|\]$/g, "");
  return { port, protocol, address, pid };
}

/**
 * 解析 tasklist CSV 行，返回 pid 与进程名。
 *
 * 列顺序：映像名,PID,...
 */
function parseTasklistNameLine(
  line: string,
): { pid: number; name: string } | null {
  if (line.length === 0) return null;
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      if (end === -1) return null;
      fields.push(line.slice(i + 1, end));
      i = end + 1;
      if (line[i] === ",") i++;
    } else {
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
  if (fields.length < 2) return null;
  const name = fields[0]!;
  const pid = Number(fields[1]);
  if (!Number.isInteger(pid) || pid < 0) return null;
  return { pid, name };
}

/**
 * 获取 Windows pid → 进程名映射。
 */
async function getWindowsProcessNames(): Promise<Map<number, string>> {
  try {
    const outcome = await runCommand("tasklist", ["/FO", "CSV", "/NH"]);
    if (outcome.spawnError !== undefined) return new Map();
    const text = outcome.stdout;
    const map = new Map<number, string>();
    for (const line of text.split(/\r?\n/)) {
      const entry = parseTasklistNameLine(line);
      if (entry) map.set(entry.pid, entry.name);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * 解析 unix lsof -i -P -n 的 LISTEN 行。
 *
 * 行格式：`node     1234  user   6u  IPv4   0x1234      0t0  TCP *:3000 (LISTEN)`
 */
export function parseLsofLine(line: string): ListenEntry | null {
  if (!line.includes("LISTEN")) return null;
  const parts = line.split(/\s+/);
  if (parts.length < 9) return null;
  const pid = Number(parts[1]);
  if (!Number.isInteger(pid) || pid < 0) return null;
  const name = parts[0] ?? "";
  // NAME 列形如 *:3000 (LISTEN) 或 127.0.0.1:3000 (LISTEN)
  const namePart = parts.find(
    (p) => p.includes(":") && (p.startsWith("*") || p.includes(".")),
  );
  if (!namePart) return null;
  const colonIdx = namePart.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const port = Number(namePart.slice(colonIdx + 1));
  if (!Number.isInteger(port) || port < 0) return null;
  const address = namePart.slice(0, colonIdx).replace(/^\*$/, "0.0.0.0");
  const protocol = parts[parts.length - 3] ?? "tcp";
  return { port, protocol: protocol.toLowerCase(), address, pid, name };
}

/**
 * 列出 Windows 监听端口（netstat -ano）。
 */
async function listWindowsListen(): Promise<ListenEntry[]> {
  const [outcome, names] = await Promise.all([
    runCommand("netstat", ["-ano"]),
    getWindowsProcessNames(),
  ]);
  if (outcome.spawnError !== undefined) return [];
  const text = outcome.stdout;
  const result: ListenEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = parseNetstatLine(line);
    if (entry) {
      const name = names.get(entry.pid);
      if (name) entry.name = name;
      result.push(entry);
    }
  }
  return result;
}

/**
 * 解析 ss -tlnp 的 LISTEN 行。
 *
 * 行格式：`LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=21))`
 */
export function parseSsLine(line: string): ListenEntry | null {
  if (!line.startsWith("LISTEN")) return null;
  const parts = line.split(/\s+/);
  if (parts.length < 5) return null;
  // ss -tlnp 列：State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
  const local = parts[3]!;
  const colonIdx = local.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const port = Number(local.slice(colonIdx + 1));
  if (!Number.isInteger(port) || port < 0) return null;
  const address = local.slice(0, colonIdx).replace(/^\*$/, "0.0.0.0");
  // 提取 pid 与 name：users:(("node",pid=1234,fd=21))
  const pidMatch = /pid=(\d+)/.exec(line);
  const pid = pidMatch ? Number(pidMatch[1]) : 0;
  const nameMatch = /users:\(\("([^"]+)"/.exec(line);
  const name = nameMatch ? nameMatch[1] : "";
  return { port, protocol: "tcp", address, pid, name };
}

/* c8 ignore start */
/**
 * 列出 unix 监听端口（lsof，失败回退 ss）。
 * 仅在非 Windows 平台执行，当前 CI 仅 Windows，故排除出覆盖率统计。
 */
async function listUnixListen(): Promise<ListenEntry[]> {
  try {
    const outcome = await runCommand("lsof", ["-i", "-P", "-n"]);
    if (outcome.spawnError === undefined && outcome.exitCode === 0) {
      const result: ListenEntry[] = [];
      for (const line of outcome.stdout.split("\n")) {
        const entry = parseLsofLine(line);
        if (entry) result.push(entry);
      }
      return result;
    }
  } catch {
    // lsof 不可用或无权限，回退 ss
  }
  const outcome = await runCommand("ss", ["-tlnp"]);
  const result: ListenEntry[] = [];
  for (const line of outcome.stdout.split("\n")) {
    const entry = parseSsLine(line);
    if (entry) result.push(entry);
  }
  return result;
}
/* c8 ignore stop */

/**
 * net_listen handler：列出本机监听端口。
 *
 * 错误：命令执行失败 → EXEC_FAIL
 */
export async function netListenHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filter = args["filter"] as string | undefined;

  try {
    const entries = IS_WIN ? await listWindowsListen() : await listUnixListen();

    // 去重（同一端口可能多次出现）
    const seen = new Set<string>();
    let unique = entries.filter((e) => {
      const key = `${e.port}:${e.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // filter 按端口或进程名（含子串，大小写不敏感）
    if (typeof filter === "string" && filter.length > 0) {
      const lower = filter.toLowerCase();
      unique = unique.filter(
        (e) =>
          String(e.port).includes(lower) ||
          e.protocol.toLowerCase().includes(lower) ||
          e.address.toLowerCase().includes(lower) ||
          (e.name ?? "").toLowerCase().includes(lower),
      );
    }

    unique.sort((a, b) => a.port - b.port);

    const result: NetListenResult = { ports: unique };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return fail(
      ErrorCode.EXEC_FAIL,
      `列出监听端口失败: ${toErrorMessage(err)}`,
    );
  }
}

/** net_listen 输出 schema：本机监听端口列表。 */
export const netListenOutputSchema = z.object({
  ports: z.array(
    z.object({
      port: z.number().int().nonnegative(),
      protocol: z.string(),
      address: z.string(),
      pid: z.number().int().nonnegative(),
      name: z.string().optional(),
    }),
  ),
});

/** net_listen 工具定义。 */
export const netListenTool: Tool = {
  name: "net_listen",
  description:
    "列出本机监听端口及占用进程（≈ lsof -i / netstat）。返回 { ports: [{ port, protocol, address, pid, name? }] }。filter 按端口/协议/地址/进程名过滤。",
  inputSchema: netListenInputSchema,
  outputSchema: netListenOutputSchema,
  annotations: { readOnlyHint: true },
  handler: netListenHandler,
  aliases: ["listen_ports"],
};
