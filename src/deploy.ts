/**
 * 部署工具表装配（深模块）。
 *
 * 吞咽「部署工具表」与「列出工具表」的装配语义，对外只暴露两个接口：
 * - {@link assembleDeployment}：{白名单原始串, 懒开关} → {分发表, 列出表} 的单入口，
 *   一次产出双表，组合模式（懒 × 白名单）的全部规则（部署裁剪、meta 三件套豁免、
 *   列出面投影）集中在此。
 * - {@link scopeMetaToolsToDeployment}：把任意工具表里的 meta 三件套替换为口径
 *   限于该表的受限副本，createServer 注入部署子表时复用。
 *
 * 本模块不读 process.env——env 原始读取仍收敛在 stdio 入口，装配以纯函数入参
 * 接收原始串与开关值，因此不启动进程即可注入伪造源单测。
 */

import { builtinTools, type Tool } from "./registry.js";
import { parseToolsWhitelist } from "./config/env.js";
import { createScopedBatchRunTool } from "./tools/batch.js";
import { createScopedToolGroupsTool } from "./tools/tool_groups.js";
import { createScopedListDomainToolsTool } from "./tools/list_domain_tools.js";

/**
 * 懒模式列出面固定三件套：两个域导航 meta 工具 + batch_run。
 * batch_run 恒在列出面，保证多步编排不被加载流程挡住；加载只是信息获取不是
 * 授权，未列出的工具照常可调用（调用不设门禁）。
 */
const LAZY_LISTED_TOOL_NAMES = [
  "tool_groups",
  "list_domain_tools",
  "batch_run",
] as const;

/**
 * 将部署子表中的 meta 三件套替换为口径限于该子表的副本。
 *
 * - batch_run：步骤引用被裁工具即该步失败并归因"未在当前部署暴露"。
 * - tool_groups / list_domain_tools：域概览与明细只反映裁剪后仍可见的集合，
 *   被裁空的域不出现。子表不含对应工具时跳过；全量注入不过本函数。副本仅
 *   替换 handler，listTools 输出不变。
 *
 * @param tools 部署工具表
 */
export function scopeMetaToolsToDeployment(tools: readonly Tool[]): readonly Tool[] {
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
 * 解析白名单原始字符串并装配部署工具表（启动校验的纯装配步骤）。
 *
 * fail-fast：白名单含未知工具名（含误写别名——别名不在正名集合内）时抛出，
 * 错误信息列出全部非法条目原文而非仅第一个；存在未知项即启动失败。未配置
 * 白名单（未设置/空串/纯空白）返回内置表原引用（零破坏）。
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
      `WIN_SHELL_TOOLS 含未知工具条目: ${whitelist.unknown.join(", ")}`,
    );
  }
  return whitelist.names.size === 0
    ? builtin
    : builtin.filter((t) => whitelist.names.has(t.name));
}

/**
 * 懒模式 × 白名单组合装配：meta 三件套豁免白名单。
 *
 * 裁决：懒模式下导航与编排入口不可被部署裁剪意外砍掉——三件套恒列入、恒可调用。
 * 本函数把被白名单裁掉的三件套按注册顺序补回分发表（已存在的保持原位）；纯懒
 * 模式（无白名单）下 deployed 即全量表，补集为空、结果等于全量注入（零破坏）。
 * 纯白名单模式（懒关闭）不到用本函数，meta 照常受白名单约束。
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
 * 解析列出工具表。
 *
 * 纯函数、无全局态：lazy 取值由调用方决定。
 * - 全量模式（lazy=false）：原样返回分发表——ListTools 返回集与历史逐字节一致。
 * - 懒模式（lazy=true）：取三件套与分发表的交集、保持注册顺序。组合模式下
 *   分发表已经 {@link composeLazyDispatchTable} 豁免补齐三件套，本函数的交集
 *   是安全网而非豁免机制本体。
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

/** 装配结果：分发表 + 列出表。 */
export interface DeployedTables {
  /** 分发工具表：CallTool 分发针对这张表。 */
  dispatchTable: readonly Tool[];
  /** 列出工具表：ListTools 返回这张表。 */
  listedTools: readonly Tool[];
}

/**
 * 部署表装配单入口：{白名单串, 懒开关} → {分发表, 列出表}。
 *
 * 统一懒 × 白名单组合语义：装配顺序为 白名单裁剪 → 组合豁免（懒）→ 列出面投影。
 * meta 三件套的受限副本替换由 createServer 在注入非全量表时承担（同一接缝）。
 *
 * @param opts 原始白名单串与懒开关（值来自 stdio 入口的 env 读取点）
 */
export function assembleDeployment(opts: {
  rawWhitelist: string | undefined;
  lazy: boolean;
}): DeployedTables {
  const deployed = resolveDeployedTools(opts.rawWhitelist);
  const dispatchTable = opts.lazy
    ? composeLazyDispatchTable(deployed)
    : deployed;
  return {
    dispatchTable,
    listedTools: resolveListedTools(opts.lazy, dispatchTable),
  };
}