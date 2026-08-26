/**
 * MCP Server 创建与工具调用逻辑。
 *
 * 用 @modelcontextprotocol/sdk 的低级 Server API：
 * - ListToolsRequestSchema handler 返回工具列表
 * - CallToolRequestSchema handler 分发到对应工具
 *
 * 工具列表作为依赖传入（默认 `builtinTools`）——无全局注册状态，
 * 测试可直接传入子集。工具结果（ToolResult）序列化为 MCP text content（JSON）。
 * 工单 11-04 起支持列出面/分发面双表注入（懒模式基石），见 CreateServerOptions。
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
import { builtinTools, findTool, type Tool } from "./registry.js";
import {
  ENV_WIN_SHELL_TOOLS,
  ENV_WIN_SHELL_LAZY,
  notExposedMessage,
  parseLazyMode,
  parseToolsWhitelist,
} from "./config/env.js";
import { createScopedBatchRunTool } from "./tools/batch.js";
import { createScopedToolGroupsTool } from "./tools/tool_groups.js";
import { createScopedListDomainToolsTool } from "./tools/list_domain_tools.js";

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
    // 错误区分（工单 12-02）：注入部署子表时，内置注册表仍能命中的
    // 正名/别名 = 被白名单裁剪，归因"未在当前部署暴露"；全量注入（含默认）
    // 维持既有 Unknown tool 语义，行为零破坏。别名的正常解析由 14 号工单落地，
    // 此处 findTool 命中仅用于归因，不改变调用语义。
    if (tools !== builtinTools && findTool(name)) {
      return fail(ErrorCode.EINVAL, notExposedMessage(name));
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
 * 将部署子表中的 meta 三件套替换为口径限于该子表的副本（工单 11-05 扩展）。
 *
 * - batch_run（12-02）：步骤引用被裁工具即该步失败并归因"未在当前部署暴露"。
 * - tool_groups / list_domain_tools（11-05）：域概览与明细只反映裁剪后仍可见
 *   的集合，被裁空的域不出现。子表不含对应工具时跳过该工具；全量注入不经
 *   过本函数，零破坏。副本仅替换 handler，listTools 输出不变。
 */
function scopeMetaToolsToDeployment(tools: readonly Tool[]): readonly Tool[] {
  const metaNames = new Set<string>(LAZY_LISTED_TOOL_NAMES);
  if (!tools.some((t) => metaNames.has(t.name))) return tools;
  return tools.map((t) => {
    if (t.name === "batch_run") return createScopedBatchRunTool(tools);
    if (t.name === "tool_groups") return createScopedToolGroupsTool(tools);
    if (t.name === "list_domain_tools") {
      return createScopedListDomainToolsTool(tools);
    }
    return t;
  });
}

/**
 * 懒模式列出面固定三件套（工单 11-04）：两个域导航 meta 工具 + batch_run。
 * batch_run 恒在列出面，保证多步编排不被加载流程挡住（PRD 用户故事 4）；
 * 加载只是信息获取不是授权，未列出的工具照常可调用（调用不设门禁）。
 */
export const LAZY_LISTED_TOOL_NAMES = [
  "tool_groups",
  "list_domain_tools",
  "batch_run",
] as const;

/**
 * 解析列出工具表（工单 11-04）。
 *
 * 纯函数、无全局态：lazy 取值由调用方决定（stdio 入口经配置模块
 * parseLazyMode 解析 env 后传入），本函数不做任何环境读取。
 *
 * - 全量模式（lazy=false）：原样返回分发表——ListTools 返回集与历史逐字节一致。
 * - 懒模式（lazy=true）：取三件套与分发表的交集、保持注册顺序。组合模式
 *   （11-05）下分发表已经 {@link composeLazyDispatchTable} 豁免补齐三件套，
 *   本函数的交集是安全网而非豁免机制本体。
 *
 * @param lazy 是否懒模式
 * @param tools 分发工具表（默认内置全部工具）
 */
export function resolveListedTools(
  lazy: boolean,
  tools: readonly Tool[] = builtinTools,
): readonly Tool[] {
  if (!lazy) return tools;
  const wanted = new Set<string>(LAZY_LISTED_TOOL_NAMES);
  return tools.filter((t) => wanted.has(t.name));
}

/**
 * 懒模式 × 白名单组合装配（工单 11-05）：meta 三件套豁免白名单。
 *
 * 裁决：懒模式下导航与编排入口不可被部署裁剪意外砍掉——三件套恒列入、
 * 恒可调用，无论是否被 `WIN_SHELL_TOOLS` 点名。本函数把被白名单裁掉的
 * 三件套按注册顺序补回分发表（已存在的保持原位）；纯懒模式（无白名单）
 * 下 deployed 即全量表，补集为空、结果等于全量注入（零破坏）。
 * 纯白名单模式（懒关闭）不经过本函数，meta 照常受白名单约束。
 *
 * @param deployed 白名单过滤后的部署工具表
 * @returns 组合模式的分发表（部署表 ∪ 三件套，注册序）
 */
export function composeLazyDispatchTable(
  deployed: readonly Tool[],
): readonly Tool[] {
  const wanted = new Set<string>(LAZY_LISTED_TOOL_NAMES);
  const present = new Set(deployed.map((t) => t.name));
  // 恒从 builtinTools 按注册序合成：deployed ⊆ builtinTools，补集自然插位。
  return builtinTools.filter((t) => present.has(t.name) || wanted.has(t.name));
}

/**
 * createServer 的双表注入选项（工单 11-04：列出面与分发面分离）。
 *
 * listedTools 缺省 = tools，即历史单表行为（全量模式零破坏）；懒模式下
 * 调用方传 `resolveListedTools(true)` 作为列出表、全量表作为分发表，
 * 实现「ListTools 只见 3 个 meta、CallTool 针对全部已注册工具」。
 */
export interface CreateServerOptions {
  /** 分发工具表：CallTool 分发针对这张表。缺省 builtinTools。 */
  tools?: readonly Tool[];
  /** 列出工具表：ListTools 返回这张表。缺省 = tools（含其 batch_run 受限副本替换后的数组）。 */
  listedTools?: readonly Tool[];
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
 * @param toolsOrOptions 工具列表（兼容形态）或双表选项（工单 11-04）
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
  const deployed =
    dispatchTools === builtinTools
      ? dispatchTools
      : scopeMetaToolsToDeployment(dispatchTools);
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
 * 解析白名单原始字符串并装配部署工具表（启动校验的纯装配步骤）。
 *
 * fail-fast：白名单含未知工具名（含误写别名——别名不在正名集合内）时抛出，
 * 错误信息列出**全部**非法条目原文而非仅第一个；不做"忽略未知项"的宽容模式，
 * 存在未知项即启动失败，绝不静默降级为残缺白名单或全量。未设置/空串/纯空白
 * 返回内置表原引用（零破坏）。rawWhitelist 由 {@link startStdioServer} 从唯一
 * 的 env 读取点传入，测试注入伪造字符串即可覆盖失败路径，无需启动进程。
 *
 * @param rawWhitelist `WIN_SHELL_TOOLS` 原始字符串或 undefined
 * @param builtin 内置工具表，默认 `builtinTools`
 * @returns 部署工具表：全量原表引用或按正名过滤后的子表
 * @throws 白名单含未知工具条目时，消息含变量名与全部非法条目原文
 */
export function resolveDeployedTools(
  rawWhitelist: string | undefined,
  builtin: readonly Tool[] = builtinTools,
): readonly Tool[] {
  const whitelist = parseToolsWhitelist(
    rawWhitelist,
    builtin.map((t) => t.name),
  );
  if (!whitelist.ok) {
    throw new Error(
      `${ENV_WIN_SHELL_TOOLS} 含未知工具条目: ${whitelist.unknown.join(", ")}`,
    );
  }
  return whitelist.names.size === 0
    ? builtin
    : builtin.filter((t) => whitelist.names.has(t.name));
}

/**
 * 启动 stdio MCP Server（入口用）。
 *
 * env 原始读取点收敛于 stdio 入口链路：`WIN_SHELL_TOOLS`（白名单）与
 * `WIN_SHELL_LAZY`（懒模式，工单 11-04）均经配置模块纯函数解析，本函数是
 * server 层唯一的原始读取处；白名单校验与部署表装配在 {@link resolveDeployedTools}。
 *
 * 组合语义（工单 11-05）：
 * - 纯懒模式（无白名单）：分发表 = 全量表，列出表 = 三件套（与 04 一致）。
 * - 纯白名单模式（懒关闭）：分发表 = 列出表 = 部署子表（与 12 一致，
 *   meta 作为普通工具照常受约束）。
 * - 组合模式：分发表经 {@link composeLazyDispatchTable} 豁免补齐三件套
 *   （恒列入恒可调），列出表 = 三件套；导航工具的统计口径限于部署子表。
 * 运行期注册集不变，不发 listChanged 通知。
 *
 * @throws 白名单含未知工具条目时抛出并列出全部非法条目原文（入口 catch 打印退出）
 */
export async function startStdioServer(): Promise<Server> {
  const lazy = parseLazyMode(process.env[ENV_WIN_SHELL_LAZY]);
  const deployed = resolveDeployedTools(process.env[ENV_WIN_SHELL_TOOLS]);
  const dispatchTable = lazy ? composeLazyDispatchTable(deployed) : deployed;
  const server = createServer({
    tools: dispatchTable,
    listedTools: resolveListedTools(lazy, dispatchTable),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
