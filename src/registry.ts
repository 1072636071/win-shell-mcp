/**
 * 工具注册表。
 *
 * 内置 40 个工具以纯常量列表 `builtinTools` 暴露——无全局可变状态，
 * 无加载即注册的副作用。server 层接受工具列表作为依赖（见 server.ts），
 * 测试可直接传入子集。
 *
 * 工单 12：注册全部 40 个工具。
 */

import type { z } from 'zod';
import type { AnyToolResult } from './contract/output.js';
import {
  systemInfoTool,
  systemDiskTool,
  systemMemoryTool,
  systemPathTool,
} from './tools/system.js';
import { fsListTool, fsReadTool, fsStatTool } from './tools/fs_read.js';
import {
  fsWriteTool,
  fsMkdirTool,
  fsRmTool,
  fsCpTool,
  fsMvTool,
  fsTouchTool,
} from './tools/fs_write.js';
import {
  textGrepTool,
  textHeadTool,
  textTailTool,
  textWcTool,
  textDiffTool,
  textReplaceTool,
} from './tools/text.js';
import { searchGlobTool, searchContentTool, searchWhichTool } from './tools/search.js';
import { processListTool, processKillTool } from './tools/process.js';
import { shellExecTool } from './tools/shell_exec.js';
import { envGetTool, envSetTool, envUnsetTool } from './tools/env.js';
import { netGetTool, netPostTool, netDnsTool, netTcpTool } from './tools/net.js';
import { pkgDetectTool, pkgRunTool } from './tools/pkg.js';
import {
  gitStatusTool,
  gitLogTool,
  gitBranchTool,
  gitDiffTool,
  gitAddTool,
  gitCommitTool,
} from './tools/git.js';

/**
 * 工具定义。
 *
 * handler 接收 `Record<string, unknown>`：callTool 已用 zod 校验，但各工具
 * 测试会直接以非法类型调用 handler 验证 EINVAL 防御，故 handler 保留防御性
 * 类型检查。成功结果经 `ok()` 统一收窄为输出契约，调用点无需强转。
 */
export interface Tool {
  /** 工具名（唯一标识，AI 调用时使用）。 */
  name: string;
  /** 工具描述（供 AI 理解工具用途）。 */
  description: string;
  /** 输入参数的 zod schema（用于验证）。 */
  inputSchema: z.ZodType;
  /** 处理函数，接收已验证参数，返回统一输出契约。 */
  handler: (args: Record<string, unknown>) => Promise<AnyToolResult> | AnyToolResult;
}

/** 内置工具列表（共 40 个，按域分组）。纯常量，无副作用。 */
export const builtinTools: readonly Tool[] = [
  // system 域
  systemInfoTool,
  systemDiskTool,
  systemMemoryTool,
  systemPathTool,
  // fs_read 域
  fsListTool,
  fsReadTool,
  fsStatTool,
  // fs_write 域
  fsWriteTool,
  fsMkdirTool,
  fsRmTool,
  fsCpTool,
  fsMvTool,
  fsTouchTool,
  // text 域
  textGrepTool,
  textHeadTool,
  textTailTool,
  textWcTool,
  textDiffTool,
  textReplaceTool,
  // search 域
  searchGlobTool,
  searchContentTool,
  searchWhichTool,
  // process 域
  processListTool,
  processKillTool,
  // shell_exec 域
  shellExecTool,
  // env 域
  envGetTool,
  envSetTool,
  envUnsetTool,
  // net 域
  netGetTool,
  netPostTool,
  netDnsTool,
  netTcpTool,
  // pkg 域
  pkgDetectTool,
  pkgRunTool,
  // git 域
  gitStatusTool,
  gitLogTool,
  gitBranchTool,
  gitDiffTool,
  gitAddTool,
  gitCommitTool,
];
