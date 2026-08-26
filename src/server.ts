/**
 * MCP Server 创建与工具调用逻辑。
 *
 * 用 @modelcontextprotocol/sdk 的低级 Server API：
 * - ListToolsRequestSchema handler 返回工具列表
 * - CallToolRequestSchema handler 分发到对应工具
 *
 * 工具列表作为依赖传入（默认 `builtinTools`）——无全局注册状态，
 * 测试可直接传入子集。工具结果（ToolResult）序列化为 MCP text content（JSON）。
 */

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { fail, isFail, type AnyToolResult } from "./contract/output.js";
import { ErrorCode, toErrorCode, toErrorMessage } from "./contract/errors.js";
import { builtinTools, type Tool } from "./registry.js";

/** Server 信息。 */
const SERVER_INFO = {
  name: "win-shell-mcp",
  version: "0.2.0",
} as const;

/**
 * 列出所有工具的 MCP 描述（name、description、inputSchema JSON schema）。
 *
 * outputSchema 与 annotations 条件透传：工具声明了才附上。
 * 全部 59 个工具均由 guard-mutating.test.ts 强制声明 outputSchema 与
 * annotations.readOnlyHint，此处条件透传为防御性编程，不依赖回退默认值。
 *
 * 供 ListTools handler 与测试使用。
 *
 * @param tools 工具列表，默认内置全部工具
 */
export function listTools(tools: readonly Tool[] = builtinTools): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: import("./registry.js").ToolAnnotations;
}> {
  return tools.map((tool) => {
    const entry: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      annotations?: import("./registry.js").ToolAnnotations;
    } = {
      name: tool.name,
      description: tool.description,
      inputSchema: toJsonSchemaCompat(tool.inputSchema as never) as Record<
        string,
        unknown
      >,
    };
    if (tool.outputSchema) {
      entry.outputSchema = toJsonSchemaCompat(
        tool.outputSchema as never,
      ) as Record<string, unknown>;
    }
    if (tool.annotations) {
      entry.annotations = tool.annotations;
    }
    return entry;
  });
}

/**
 * 调用一个工具并返回统一输出契约。
 *
 * 职责：查找工具 → 验证参数 → 调用 handler → 捕获异常。
 * 供 CallTool handler 与测试使用。
 *
 * @param name 工具名
 * @param args 原始参数（未验证）
 * @param tools 工具列表，默认内置全部工具
 * @returns 统一输出契约
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  tools: readonly Tool[] = builtinTools,
): Promise<AnyToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return fail(ErrorCode.EINVAL, `Unknown tool: ${name}`);
  }

  // 验证参数
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    return fail(
      ErrorCode.EINVAL,
      `Invalid arguments: ${toErrorMessage(parsed.error)}`,
    );
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
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: isFail(result),
  };
}

/**
 * 创建 MCP Server 实例（注册 ListTools 与 CallTool handler）。
 *
 * 不连接 transport，供测试与入口使用。
 *
 * @param tools 工具列表，默认内置全部工具
 */
export function createServer(tools: readonly Tool[] = builtinTools): Server {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const listed = listTools(tools);
    return { tools: listed } as never;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const result = await callTool(name, args, tools);
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
  const server = createServer(builtinTools);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
