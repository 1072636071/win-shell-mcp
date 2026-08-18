/**
 * MCP Server 创建与工具调用逻辑。
 *
 * 用 @modelcontextprotocol/sdk 的低级 Server API：
 * - ListToolsRequestSchema handler 返回工具列表
 * - CallToolRequestSchema handler 分发到对应工具
 *
 * 工具结果（ToolResult）序列化为 MCP text content（JSON）。
 */

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { fail, isFail, type AnyToolResult } from './contract/output.js';
import { ErrorCode, toErrorCode, toErrorMessage } from './contract/errors.js';
import { findTool, getAllTools } from './registry.js';

/** Server 信息。 */
const SERVER_INFO = {
  name: 'win-shell-mcp',
  version: '0.1.0',
} as const;

/**
 * 列出所有工具的 MCP 描述（name、description、inputSchema JSON schema）。
 *
 * 供 ListTools handler 与测试使用。
 */
export function listTools(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchemaCompat(tool.inputSchema as never) as Record<string, unknown>,
  }));
}

/**
 * 调用一个工具并返回统一输出契约。
 *
 * 职责：查找工具 → 验证参数 → 调用 handler → 捕获异常。
 * 供 CallTool handler 与测试使用。
 *
 * @param name 工具名
 * @param args 原始参数（未验证）
 * @returns 统一输出契约
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const tool = findTool(name);
  if (!tool) {
    return fail(ErrorCode.EINVAL, `Unknown tool: ${name}`);
  }

  // 验证参数
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    return fail(ErrorCode.EINVAL, `Invalid arguments: ${toErrorMessage(parsed.error)}`);
  }

  try {
    return await tool.handler(parsed.data as Record<string, unknown>);
  } catch (err) {
    return fail(toErrorCode(err), toErrorMessage(err));
  }
}

/**
 * 将 ToolResult 序列化为 MCP CallToolResult content。
 *
 * 结果以 JSON 字符串放入 text content；失败时 isError=true。
 */
function toMcpContent(result: AnyToolResult): {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    isError: isFail(result),
  };
}

/**
 * 创建 MCP Server 实例（注册 ListTools 与 CallTool handler）。
 *
 * 不连接 transport，供测试与入口使用。
 */
export function createServer(): Server {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = listTools();
    return { tools } as never;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const result = await callTool(name, args);
    return toMcpContent(result) as never;
  });

  return server;
}

/**
 * 启动 stdio MCP Server（入口用）。
 *
 * 创建 server、连接 StdioServerTransport。
 */
export async function startStdioServer(): Promise<Server> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}