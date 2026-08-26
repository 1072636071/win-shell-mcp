/**
 * 工具注册表。
 *
 * 维护所有已注册工具，提供查询接口供 server 层使用。
 * 工单 12：注册全部 59 个工具（含 02/03 新增的 pwd/echo/run_command 与各域新增 find/cat/ping）。
 *
 * 别名机制（工单 02）：Tool 可声明 aliases，findTool 在精确名匹配失败后回退到别名匹配，
 * 因此 `ls` / `list_directory` 等短名/别名调用与正名返回一致结果。
 */

import type { z } from "zod";
import type { AnyToolResult } from "./contract/output.js";
import {
  systemInfoTool,
  systemDiskTool,
  systemMemoryTool,
  systemPathTool,
} from "./tools/system.js";
import { fsListTool, fsReadTool, fsStatTool } from "./tools/fs_read.js";
import {
  fsWriteTool,
  fsMkdirTool,
  fsRmTool,
  fsCpTool,
  fsMvTool,
  fsTouchTool,
} from "./tools/fs_write.js";
import {
  textGrepTool,
  textHeadTool,
  textTailTool,
  textWcTool,
  textDiffTool,
  textReplaceTool,
} from "./tools/text.js";
import {
  searchGlobTool,
  searchContentTool,
  searchWhichTool,
} from "./tools/search.js";
import { processListTool, processKillTool } from "./tools/process.js";
import { shellExecTool } from "./tools/shell_exec.js";
import { envGetTool, envSetTool, envUnsetTool } from "./tools/env.js";
import {
  netGetTool,
  netPostTool,
  netDnsTool,
  netTcpTool,
} from "./tools/net.js";
import { pkgDetectTool, pkgRunTool } from "./tools/pkg.js";
import {
  gitStatusTool,
  gitLogTool,
  gitBranchTool,
  gitDiffTool,
  gitAddTool,
  gitCommitTool,
  gitCheckoutTool,
  gitPushTool,
  gitPullTool,
  gitCloneTool,
  gitStashTool,
} from "./tools/git.js";
import { pwdTool, echoTool } from "./tools/core.js";
import { runCommandTool } from "./tools/run_command.js";
import { fsFindTool } from "./tools/fs_find.js";
import { textCatTool } from "./tools/text_cat.js";
import { netPingTool } from "./tools/net_ping.js";
import { hashFileTool } from "./tools/hash.js";
import { fsDuTool } from "./tools/fs_du.js";
import { jsonGetTool } from "./tools/json.js";
import { netListenTool } from "./tools/net_listen.js";
import { netDownloadTool } from "./tools/net_download.js";
import { archiveCreateTool, archiveExtractTool } from "./tools/archive.js";
import { batchRunTool } from "./tools/batch.js";

/**
 * 工具注解（对齐 MCP 标准 ToolAnnotations）。
 *
 * 用于向宿主（MCP 客户端 / DSH Code Mode）声明工具行为特征，便于宿主做
 * 只读检测、并发分类与 UI 提示。所有字段可选，由各工具按需显式裁决。
 */
export interface ToolAnnotations {
  /** 只读：不改变外部世界状态（可并发执行）。 */
  readOnlyHint?: boolean;
  /** 破坏性：可能不可逆地改变状态（如 rm）。 */
  destructiveHint?: boolean;
  /** 幂等：相同参数重复调用结果一致。 */
  idempotentHint?: boolean;
  /** 开放世界：工具与外部实体交互（网络、系统资源等）。 */
  openWorldHint?: boolean;
}

/**
 * 工具定义。
 *
 * handler 接收 `Record<string, unknown>`：callTool 已用 zod 校验，但各工具
 * 测试会直接以非法类型调用 handler 验证 EINVAL 防御，故 handler 保留防御性
 * 类型检查。成功结果经 `ok()` 统一收窄为输出契约，调用点无需强转。
 *
 * outputSchema / annotations 类型上可选，但由 guard-mutating.test.ts
 * 运行时强制：全部 59 个工具均声明非空 outputSchema 与显式 readOnlyHint。
 * 该 guard test 是防漂移护栏，保留可选类型以避免大量类型断言噪音。
 */
export interface Tool {
  /** 工具名（唯一标识，AI 调用时使用）。 */
  name: string;
  /** 工具描述（供 AI 理解工具用途）。 */
  description: string;
  /** 输入参数的 zod schema（用于验证）。 */
  inputSchema: z.ZodType;
  /** 处理函数，接收已验证参数，返回统一输出契约。 */
  handler: (
    args: Record<string, unknown>,
  ) => Promise<AnyToolResult> | AnyToolResult;
  /** 别名（短名/同义名）；tools/call 可通过别名调用，返回与正名一致的结果。 */
  aliases?: string[];
  /** 输出参数的 zod schema（描述 success data 结构，不含 ok 包装）。 */
  outputSchema?: z.ZodType;
  /** 工具注解（readOnlyHint 等，供宿主做并发分类与 UI 提示）。 */
  annotations?: ToolAnnotations;
}

/** 内部工具存储。 */
const tools: Tool[] = [];

/**
 * 注册一个工具。
 *
 * @param tool 工具定义
 */
export function registerTool(tool: Tool): void {
  tools.push(tool);
}

/**
 * 获取所有已注册工具（返回副本，避免外部修改）。
 */
export function getAllTools(): Tool[] {
  return [...tools];
}

/**
 * 按名称查找工具。优先精确匹配工具名，失败则回退到别名匹配。
 *
 * @param name 工具名或别名
 * @returns 工具定义或 undefined
 */
export function findTool(name: string): Tool | undefined {
  const exact = tools.find((t) => t.name === name);
  if (exact) return exact;
  return tools.find((t) => t.aliases?.includes(name));
}

/**
 * 重置注册表（仅供测试使用）。
 *
 * @internal
 */
export function resetRegistry(): void {
  tools.length = 0;
}

// 注册内置工具（共 59 个，按域分组）
// system 域
registerTool(systemInfoTool);
registerTool(systemDiskTool);
registerTool(systemMemoryTool);
registerTool(systemPathTool);
// fs_read 域
registerTool(fsListTool);
registerTool(fsReadTool);
registerTool(fsStatTool);
// fs_write 域
registerTool(fsWriteTool);
registerTool(fsMkdirTool);
registerTool(fsRmTool);
registerTool(fsCpTool);
registerTool(fsMvTool);
registerTool(fsTouchTool);
// text 域
registerTool(textGrepTool);
registerTool(textHeadTool);
registerTool(textTailTool);
registerTool(textWcTool);
registerTool(textDiffTool);
registerTool(textReplaceTool);
// search 域
registerTool(searchGlobTool);
registerTool(searchContentTool);
registerTool(searchWhichTool);
// process 域
registerTool(processListTool);
registerTool(processKillTool);
// shell_exec 域
registerTool(shellExecTool);
// env 域
registerTool(envGetTool);
registerTool(envSetTool);
registerTool(envUnsetTool);
// net 域
registerTool(netGetTool);
registerTool(netPostTool);
registerTool(netDnsTool);
registerTool(netTcpTool);
// pkg 域
registerTool(pkgDetectTool);
registerTool(pkgRunTool);
// git 域
registerTool(gitStatusTool);
registerTool(gitLogTool);
registerTool(gitBranchTool);
registerTool(gitDiffTool);
registerTool(gitAddTool);
registerTool(gitCommitTool);
registerTool(gitCheckoutTool);
registerTool(gitPushTool);
registerTool(gitPullTool);
registerTool(gitCloneTool);
registerTool(gitStashTool);
// core 域（工单 02）
registerTool(pwdTool);
registerTool(echoTool);
// run_command（工单 03）
registerTool(runCommandTool);
// 各域新增工具（桩由对应 agent 完善）
registerTool(fsFindTool);
registerTool(textCatTool);
registerTool(netPingTool);
// 工单 02 新增命令
registerTool(fsDuTool);
registerTool(hashFileTool);
registerTool(jsonGetTool);
registerTool(netListenTool);
registerTool(netDownloadTool);
registerTool(archiveCreateTool);
registerTool(archiveExtractTool);
// batch_run（工单 01-02-03-04）
registerTool(batchRunTool);

/** server 层装载的不可变工具清单（快照自 registerTool 注册结果）。 */
export const builtinTools: readonly Tool[] = [...tools];
