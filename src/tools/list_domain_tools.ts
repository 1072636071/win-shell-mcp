/**
 * list_domain_tools 元工具（工单 11-03）：取回单个命令域的全部工具明细。
 *
 * 与 tool_groups 配套的懒加载导航第二步：AI 据域概览选定目标域后，用本工具
 * 取回该域全部工具的完整定义（name/description/inputSchema/outputSchema/
 * annotations，与 server 层 listTools() 条目同形），据此构造正确调用。
 *
 * 实现要点：
 * - 入参 domain 为 15 域枚举之一（zod enum + handler 防御性校验双保险，
 *   非法值返回 EINVAL）；刻意不含 "meta"——meta 名额（batch_run 等导航工具）
 *   恒在列表面可见，无需经本工具取明细。
 * - 可见性口径（工单 11-05）：默认全量注册表；白名单部署时经 scoped 副本
 *   注入部署子表，只返回过滤后仍可见的工具。
 * - 输出投影与 server.listTools() 共用 {@link projectToolEntry} 叶子（../project.js）
 *   单一接口：断环关键——投影是零业务依赖的叶子，本模块与 server 经它共用实现，
 *   互不 import 对方（registry → 本模块 → server → registry 回环被叶子切断），
 *   同形性由共享实现天然保证，不再需要测试钉住。
 */

import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { COMMAND_DOMAINS } from "../domains.js";
import { builtinTools, type Tool } from "../registry.js";
import { projectToolEntry } from "../project.js";

/** list_domain_tools 输入 schema。 */
const listDomainToolsInputSchema = z.object({
  domain: z.enum(COMMAND_DOMAINS).describe("目标命令域（15 域之一）"),
});

/** 单个工具条目输出 schema（与 listTools() 条目同形）。 */
const domainToolEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
});

/** list_domain_tools 输出 schema。 */
const listDomainToolsOutputSchema = z.object({
  domain: z.enum(COMMAND_DOMAINS),
  tools: z.array(domainToolEntrySchema),
});

/**
 * list_domain_tools handler 工厂。
 *
 * 条目投影复用 {@link projectToolEntry} 叶子（与 server.listTools 同一接口，
 * 见 ../project.js），同形性由共享实现天然保证。
 * @param pool 可见性口径工具表；省略时调用期回退全量注册表（默认行为）。
 *   注意缺省必须在闭包内惰性解析而非参数默认值：本模块由 registry 转载入，
 *   初始化期读取 builtinTools 会踩 ESM 循环 TDZ（同 batch.ts 裁决）。
 *   白名单部署子表经 {@link createScopedListDomainToolsTool} 注入（工单 11-05）：
 *   只返回过滤后仍可见的工具，被裁干净时返回空数组（响错误：零条目即真相）。
 */
export function createListDomainToolsHandler(
  pool?: readonly Tool[],
): (args: Record<string, unknown>) => Promise<AnyToolResult> {
  return async (args) => {
    // 防御性校验（与 inputSchema 对齐）：绕过 schema 直接调 handler 时兜底。
    const rawDomain = args.domain;
    if (
      typeof rawDomain !== "string" ||
      !(COMMAND_DOMAINS as readonly string[]).includes(rawDomain)
    ) {
      return fail(
        ErrorCode.EINVAL,
        `domain 必须是 15 命令域之一: ${COMMAND_DOMAINS.join(" / ")}`,
      );
    }
    const tools = (pool ?? builtinTools)
      .filter((t) => t.domain === rawDomain)
      .map(projectToolEntry);
    return ok({ domain: rawDomain, tools });
  };
}

/** 默认 handler：可见性口径为全量注册表（既有行为，向后兼容）。 */
export const listDomainToolsHandler = createListDomainToolsHandler();

export const listDomainToolsTool: Tool = {
  name: "list_domain_tools",
  domain: "meta",
  description:
    "取回指定域全部工具完整定义（与工具列表条目同形），用于构造正确调用。domain 为15域之一。只读",
  inputSchema: listDomainToolsInputSchema,
  outputSchema: listDomainToolsOutputSchema,
  annotations: { readOnlyHint: true },
  handler: listDomainToolsHandler,
};

/**
 * 创建可见性口径限于 pool 的 list_domain_tools 工具副本（白名单部署用，
 * 工单 11-05）。
 *
 * server 层以过滤后的部署子表注入 `createServer` 时，用本副本替换原工具：
 * 只返回裁剪后仍可见的工具。副本共享 schema/annotations，仅替换 handler，
 * listTools 输出与原工具无差别。
 *
 * @param pool 部署子表（含本副本自身）
 * @returns 可见性受限的 list_domain_tools 工具副本
 */
export function createScopedListDomainToolsTool(pool: readonly Tool[]): Tool {
  return { ...listDomainToolsTool, handler: createListDomainToolsHandler(pool) };
}
