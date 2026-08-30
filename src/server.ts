/**
 * MCP Server 创建与工具调用逻辑。
 *
 * 用 @modelcontextprotocol/sdk 的低级 Server API：
 * - ListToolsRequestSchema handler 返回工具列表
 * - CallToolRequestSchema handler 分发到对应工具
 *
 * 工具列表作为依赖传入（默认 `builtinTools`）——无全局注册状态，
 * 测试可直接传入子集。工具结果（ToolResult）序列化为 MCP text content（JSON）。
 *
 * 部署/列出工具表的装配语义（白名单裁剪、懒 × 白名单组合、meta 三件套豁免、
 * 列出面投影）收敛在 deploy 深模块；工具→条目投影收敛在 projectToolEntry 叶子
 * ——本模块只做 MCP shell 与调用分发。
 * 工单 11-04 起支持列出面/分发面双表注入（懒模式基石），见 CreateServerOptions。
 */

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  fail,
  isFail,
  setTruncateLimit,
  type AnyToolResult,
} from "./contract/output.js";
import { ErrorCode, toErrorCode, toErrorMessage } from "./contract/errors.js";
import { builtinTools, findTool, findToolIn, type Tool } from "./registry.js";
import {
  ENV_WIN_SHELL_TOOLS,
  ENV_WIN_SHELL_LAZY,
  ENV_WIN_SHELL_TRUNCATE,
  ENV_WIN_SHELL_CWD,
  notExposedMessage,
  parseLazyMode,
  parseTruncateLimit,
  parseCwdOverride,
} from "./config/env.js";
import { setDefaultCwd } from "./config/cwd.js";
import { projectToolEntry, type ToolMcpEntry } from "./project.js";
import {
  scopeMetaToolsToDeployment,
  assembleDeployment,
} from "./deploy.js";

/** Server 信息。 */
const SERVER_INFO = {
  name: "win-shell-mcp",
  version: "0.2.0",
} as const;

/**
 * 列出所有工具的 MCP 描述（name、description、inputSchema JSON schema）。
 *
 * outputSchema 与 annotations 条件透传：工具声明了才附上。
 * 全部内置工具均由 guard-mutating.test.ts 强制声明 outputSchema 与
 * annotations.readOnlyHint，此处条件透传为防御性编程，不依赖回退默认值。
 *
 * 与 list_domain_tools 共用 {@link projectToolEntry} 同一投影（断环：投影是
 * 叶子模块，两个调用点通过它共用实现，彼此不互相依赖）。
 *
 * 供 ListTools handler 与测试使用。
 *
 * @param tools 工具列表，默认内置全部工具
 */
export function listTools(tools: readonly Tool[] = builtinTools): ToolMcpEntry[] {
  return tools.map(projectToolEntry);
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
  // 工单 14-01：复用 findToolIn（正名优先、别名回退），消除 callTool 与
  // batch_run 的双实现。别名经 MCP tools/call 直接可用，与 batch_run 步骤
  // 解析语义一致（findToolIn 即 batch_run 受限步骤所用同一查找函数）。
  const tool = findToolIn(tools, name);
  if (!tool) {
    // 错误区分（工单 12-02）：注入部署子表时，内置注册表仍能命中的
    // 正名/别名 = 被白名单裁剪，归因"未在当前部署暴露"；全量注入（含默认）
    // 维持既有 Unknown tool 语义，行为零破坏。findTool 在全量注册表中查找，
    // 命中即说明该名字（正名或别名）存在但被裁，归因到未暴露。
    if (tools !== builtinTools && findTool(name)) {
      return fail(
        ErrorCode.EINVAL,
        notExposedMessage(name),
        "调 tool_groups 查看当前暴露工具",
      );
    }
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
 * 工单 18：成功响应回填 `structuredContent`——与 text content 同源的整体
 * 契约（深度相等由测试钉死）。声明了 outputSchema 的工具，规范客户端在
 * listTools 缓存 schema 后强制校验成功响应必须携带该字段（缺失即 -32600
 * 整包拒绝）；失败响应按规范不含此字段。
 */
function toMcpContent(result: AnyToolResult): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
  structuredContent?: Record<string, unknown>;
} {
  const payload = {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: isFail(result),
    ...(isFail(result) ? {} : { structuredContent: { ...result } }),
  };
  return payload;
}

/**
 * createServer 的双表注入选项：列出面与分发面分离。
 *
 * listedTools 缺省 = tools，即历史单表行为（全量模式零破坏）；懒模式下
 * 调用方传 deploy 模块装配的列出表、全量表作为分发表，实现「ListTools 只见
 * 3 个 meta、CallTool 针对全部已注册工具」。
 */
export interface CreateServerOptions {
  /** 分发工具表：CallTool 分发针对这张表。缺省 builtinTools。 */
  tools?: readonly Tool[];
  /** 列出工具表：ListTools 返回这张表。缺省 = tools（含其 batch_run 受限副本替换后的数组）。 */
  listedTools?: readonly Tool[];
  /** 是否懒模式：注入 tool_groups 副本的可见性判定（visible:false 标注），
   *  使 tool_groups 不再直读 process.env。缺省 false。 */
  lazy?: boolean;
}

/**
 * 创建 MCP Server 实例（注册 ListTools 与 CallTool handler）。
 *
 * 不连接 transport，供测试与入口使用。注入部署子表（白名单过滤结果）时，
 * batch_run 自动替换为受限副本，调用归因与列表裁剪一致；注入全量内置表
 * （默认）时行为与历史版本逐字节一致。
 *
 * 工单 11-04 起支持双表注入：
 * - 兼容形态：`createServer(tools)` / `createServer()` —— 单表同时服务两个面，
 *   行为不变。
 * - 双表形态：`createServer({ tools, listedTools })` —— ListTools 用列出表、
 *   CallTool 用分发表。这是懒模式的基石：列出集 ⊂ 分发集时，未列出工具仍可
 *   正常调用（调用不设门禁），不会因裁剪列出表而得到 Unknown tool。
 *
 * @param toolsOrOptions 工具列表（兼容形态）或双表选项
 */
export function createServer(
  toolsOrOptions: readonly Tool[] | CreateServerOptions = builtinTools,
): Server {
  // Array.isArray 对 readonly 数组联合类型收窄不完整，此处按形态显式断言：
  // 数组 = 兼容单表形态；对象 = 双表选项。
  const options: CreateServerOptions = Array.isArray(toolsOrOptions)
    ? { tools: toolsOrOptions as readonly Tool[] }
    : (toolsOrOptions as CreateServerOptions);
  const dispatchTools = options.tools ?? builtinTools;
  // 分发面沿用既有白名单语义：非全量注入的部署子表，meta 三件套替换为
  // 口径受限副本（batch_run 步骤边界 / 导航工具统计口径，12-02 + 11-05）。
  // 装配接缝在 deploy 深模块，此处仅消费其纯函数。纯懒模式（无白名单，
  // 分发表即全量表）也需替换 tool_groups 为 lazy 绑定副本——懒模式判定经
  // 装配注入而非 env 直读，env 读取收敛于 stdio 入口。
  const lazy = options.lazy ?? false;
  const deployed =
    dispatchTools === builtinTools && !lazy
      ? dispatchTools
      : scopeMetaToolsToDeployment(dispatchTools, lazy);
  // 列出面：显式注入（懒模式三件套等）则原样使用；缺省 = 分发表（历史行为）。
  const listedTools = options.listedTools ?? deployed;
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const listed = listTools(listedTools);
    return { tools: listed } as never;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    // 调用不设门禁（工单 11-04）：分发恒针对全部分发表，未在列出面的工具照常执行。
    const result = await callTool(name, args, deployed);
    return toMcpContent(result) as never;
  });

  return server;
}

/**
 * 启动 stdio MCP Server（入口用）。
 *
 * env 原始读取点收敛于 stdio 入口链路：`WIN_SHELL_TOOLS`（白名单）与
 * `WIN_SHELL_LAZY`（懒模式）经配置模块纯函数解析后，交 deploy 深模块的
 * {@link assembleDeployment} 一次产出分发表 + 列出表；本函数是 server 层
 * 唯一的原始读取处。
 *
 * 组合语义见 deploy 模块：
 * - 纯懒模式（无白名单）：分发表 = 全量表，列出表 = 三件套。
 * - 纯白名单模式（懒关闭）：分发表 = 列出表 = 部署子表，meta 亦受约束。
 * - 组合模式：分发表豁免补齐三件套，列出表 = 三件套，导航统计限于部署子表。
 * 运行期注册集不变，不发 listChanged 通知。
 *
 * @throws 白名单含未知工具条目时抛出并列出全部非法条目原文（入口 catch 打印退出）
 */
export async function startStdioServer(): Promise<Server> {
  // 工单 15-02：WIN_SHELL_TRUNCATE 解析与注入（fail-fast，非法值启动失败）。
  const truncateResult = parseTruncateLimit(
    process.env[ENV_WIN_SHELL_TRUNCATE],
  );
  if (!truncateResult.ok) {
    throw new Error(truncateResult.reason);
  }
  setTruncateLimit(truncateResult.limit);

  // WIN_SHELL_CWD：相对路径基准。未设置时不注入，基准继续实时取 process.cwd()。
  const cwdOverride = parseCwdOverride(process.env[ENV_WIN_SHELL_CWD]);
  if (cwdOverride !== undefined) {
    setDefaultCwd(cwdOverride);
  }

  const lazy = parseLazyMode(process.env[ENV_WIN_SHELL_LAZY]);
  const tables = assembleDeployment({
    rawWhitelist: process.env[ENV_WIN_SHELL_TOOLS],
    lazy,
  });
  const server = createServer({
    tools: tables.dispatchTable,
    listedTools: tables.listedTools,
    lazy,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}