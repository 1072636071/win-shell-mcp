/**
 * net_ping（工单 07）：对目标主机执行 ping 网络诊断。
 *
 * 纯 Node 实现（不依赖系统 ping 二进制）：ICMP 需要原始套接字（仅 root），
 * 因此采用务实方案 —— 对目标 host:port 发起 TCP 连接（类似 net_tcp），
 * 逐次测量连接耗时（视为往返时间），计算成功率与 min/max/avg。
 *
 * 返回 `{ host, sent, received, loss, min, max, avg, alive }`：
 * - 时间单位毫秒；无可达探测时为 0
 * - `alive = received > 0`
 * - 目标不可达属于数据而非错误，返回 ok（received=0, loss=1, alive=false），
 *   与 net_tcp 的 reachable 语义保持一致
 *
 * 错误仅用于参数非法（EINVAL）。
 */

import { createConnection, type Socket } from "node:net";
import { z } from "zod";
import {
  ok,
  fail,
  withVerbose,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import type { Tool } from "../registry.js";

/** 默认探测次数。 */
const DEFAULT_PING_COUNT = 4;

/** 默认探测端口。 */
const DEFAULT_PING_PORT = 80;

/** 默认单次探测超时（毫秒）。 */
const DEFAULT_PING_TIMEOUT_MS = 3000;

/** ping 极简输出。 */
interface PingMinimal {
  host: string;
  sent: number;
  received: number;
  loss: number;
  min: number;
  max: number;
  avg: number;
  alive: boolean;
}

/** ping verbose 输出：附加每次探测明细。 */
interface PingProbe {
  index: number;
  rtt: number;
  ok: boolean;
}

interface PingFull extends PingMinimal {
  probes: PingProbe[];
}

/** net_ping 输入 schema。 */
export const netPingInputSchema = z.object({
  host: z.string().describe("目标主机名或 IP"),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("探测次数（1-20），默认 4"),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("探测端口（1-65535），默认 80"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("单次探测超时（毫秒），默认 3000"),
  verbose: z
    .boolean()
    .optional()
    .describe("若为 true，返回每次探测的 rtt 明细"),
});

/** net_ping 输入类型。 */
export type NetPingInput = z.infer<typeof netPingInputSchema>;

/**
 * 对目标 host:port 发起单次 TCP 探测，测量连接耗时。
 *
 * @param host 目标主机
 * @param port 目标端口
 * @param timeoutMs 超时毫秒
 * @returns 成功返回往返耗时（毫秒），失败/超时返回 null
 */
function probeOnce(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    const start = Date.now();
    let socket: Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      if (socket !== undefined) {
        socket.removeAllListeners();
        socket.destroy();
      }
    };

    const finish = (rtt: number | null): void => {
      cleanup();
      resolve(rtt);
    };

    timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    try {
      socket = createConnection({ host, port });
      socket.once("connect", () => {
        finish(Date.now() - start);
      });
      socket.once("error", () => {
        finish(null);
      });
    } catch {
      finish(null);
    }
  });
}

/**
 * net_ping handler：TCP 连通性诊断。
 *
 * 返回 `{ host, sent, received, loss, min, max, avg, alive }`。
 * 目标不可达返回 ok（received=0, loss=1, alive=false）。
 * verbose 额外返回 `{ probes }`（每次探测索引与 rtt）。
 *
 * 错误：
 * - 非法 host → EINVAL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function netPingHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const host = args["host"];
  const count =
    typeof args["count"] === "number" ? args["count"] : DEFAULT_PING_COUNT;
  const port =
    typeof args["port"] === "number" ? args["port"] : DEFAULT_PING_PORT;
  const timeoutMs =
    typeof args["timeoutMs"] === "number" && args["timeoutMs"] > 0
      ? args["timeoutMs"]
      : DEFAULT_PING_TIMEOUT_MS;
  const verbose = args["verbose"] === true;

  if (typeof host !== "string" || host.length === 0) {
    return fail(ErrorCode.EINVAL, "host 必须是非空字符串");
  }

  // 逐次探测
  const probes: PingProbe[] = [];
  for (let i = 0; i < count; i++) {
    const rtt = await probeOnce(host, port, timeoutMs);
    probes.push({ index: i, rtt: rtt ?? 0, ok: rtt !== null });
  }

  // 汇总统计
  const received = probes.filter((p) => p.ok).length;
  const loss =
    probes.length === 0 ? 1 : (probes.length - received) / probes.length;
  const rtts = probes.filter((p) => p.ok).map((p) => p.rtt);
  const min = rtts.length > 0 ? Math.min(...rtts) : 0;
  const max = rtts.length > 0 ? Math.max(...rtts) : 0;
  const avg =
    rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0;
  const alive = received > 0;

  const minimal: PingMinimal = {
    host,
    sent: count,
    received,
    loss,
    min,
    max,
    avg,
    alive,
  };
  const full: PingFull = { ...minimal, probes };
  return ok(withVerbose(minimal, full, verbose)) as unknown as AnyToolResult;
}

/**
 * net_ping 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ host, sent, received, loss, min, max, avg, alive }`；
 * verbose 额外返回 `{ probes: [{ index, rtt, ok }] }`。
 */
export const netPingOutputSchema = z.object({
  host: z.string(),
  sent: z.number().int().nonnegative(),
  received: z.number().int().nonnegative(),
  loss: z.number().min(0).max(1),
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  avg: z.number().nonnegative(),
  alive: z.boolean(),
  probes: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        rtt: z.number().nonnegative(),
        ok: z.boolean(),
      }),
    )
    .optional(),
});

/** net_ping 工具定义。 */
export const netPingTool: Tool = {
  name: "ping",
  description:
    "对目标主机执行 ping 网络诊断（TCP 探测）。返回 { host, sent, received, loss, min, max, avg, alive }。时间单位毫秒。目标不可达返回 ok（received=0，alive=false）。count 默认 4，port 默认 80，timeoutMs 默认 3000。verbose 含每次探测 rtt。",
  inputSchema: netPingInputSchema,
  outputSchema: netPingOutputSchema,
  annotations: { readOnlyHint: true },
  handler: netPingHandler,
  aliases: ["net_ping"],
};
