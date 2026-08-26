/**
 * 「工具 → MCP 列表条目」投影（叶子模块）。
 *
 * 把 {@link Tool} 投影为 ListTools / list_domain_tools 共用的条目形态
 * （name / description / inputSchema / outputSchema / annotations 条件透传）。
 * 收敛唯一投影实现，避免 server.listTools 与 list_domain_tools 各自维护一份
 * 漂移副本（曾靠 meta-tools.test 深度相等钉住）。本模块零业务依赖，仅
 * import registry 的类型与 SDK 的 JSON Schema 兼容转换——两个调用点共用同一
 * 接口，投影的改动只收敛在一处。
 */

import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { Tool, ToolAnnotations } from "./registry.js";

/** MCP 列表条目（listTools 与 list_domain_tools 同形的数据面）。 */
export interface ToolMcpEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

/**
 * 单工具 → MCP 列表条目投影。
 *
 * outputSchema / annotations 条件透传：工具声明了才附上；未声明不含该字段。
 *
 * @param tool 工具定义
 */
export function projectToolEntry(tool: Tool): ToolMcpEntry {
  const entry: ToolMcpEntry = {
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
}