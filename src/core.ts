/**
 * 核心库入口（`./core` 子路径）。
 *
 * 导出与宿主无关的纯逻辑 API，供 DSH 插件（`./plugin`）与 MCP 壳
 * （`./index`）复用，也可被第三方宿主直接消费以复用命令抽象。
 *
 * 不依赖任何宿主 SDK（MCP / DSH），仅含 registry + contract + server
 * 中与宿主无关的部分（callTool / listTools 为纯函数）。
 */

export { builtinTools, type Tool, type ToolAnnotations } from "./registry.js";
export { callTool, listTools } from "./server.js";
export {
  ok,
  fail,
  isOk,
  isFail,
  type AnyToolResult,
  type OkResult,
  type FailResult,
  type ToolResult,
  type ToolError,
} from "./contract/output.js";
export { ErrorCode, type ErrorCodeValue } from "./contract/errors.js";
