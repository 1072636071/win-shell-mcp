/**
 * 命令域词汇表（工单 11-01 地基）。
 *
 * 独立成模块的原因：tool_groups / list_domain_tools 在模块初始化期就要消费
 * COMMAND_DOMAINS 构造 zod enum，若从 registry 导入会形成
 * registry → 工具模块 → registry 的循环求值（enum 拿到 undefined）。
 * 本模块为零依赖叶子，registry 与工具模块都直接导入。
 *
 * 来源：CONTEXT.md 术语表「命令域」（ADR-0006 成域闸门：语义独立、逐域论证，
 * 共 15 域）。本清单是域枚举的代码侧单一事实源；CONTEXT.md 基线更新时须同步修改。
 */

/** 15 命令域枚举值清单（顺序与 CONTEXT.md 一致）。 */
export const COMMAND_DOMAINS = [
  "system",
  "fs",
  "text",
  "search",
  "process",
  "shell_exec",
  "env",
  "net",
  "pkg",
  "git",
  "core",
  "run_command",
  "archive",
  "hash",
  "json",
] as const;

/** 命令域（仅 15 域，不含 meta 名额）。 */
export type CommandDomain = (typeof COMMAND_DOMAINS)[number];

/**
 * 工具所属命令域取值：15 命令域之一；`"meta"` 为编排/导航类工具的专用名额，
 * 不占域名额（如 batch_run、tool_groups、list_domain_tools）。
 */
export type ToolDomain = CommandDomain | "meta";
