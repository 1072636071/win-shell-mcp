/**
 * 工具注册表。
 *
 * 维护所有已注册工具，提供查询接口供 server 层使用。
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

/** 工具定义。 */
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
 * 按名称查找工具。
 *
 * @param name 工具名
 * @returns 工具定义或 undefined
 */
export function findTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * 重置注册表（仅供测试使用）。
 *
 * @internal
 */
export function resetRegistry(): void {
  tools.length = 0;
}

// 注册内置工具（共 40 个，按域分组）
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