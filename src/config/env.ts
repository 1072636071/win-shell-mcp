/**
 * 环境变量配置 seam（本批优化唯一新增代码模块；工单 12-01 / 11-02）。
 *
 * 职责：集中定义受支持的环境变量名常量，并提供其纯函数解析。模块内不读
 * `process.env`——env 读取只发生在唯一调用点（stdio 入口），本模块只接受
 * 原始字符串或 undefined 入参，因此不启动进程即可注入伪造环境源单测。
 *
 * 后续变量并入规则：新增环境变量时其名字常量与解析函数一律收敛于本模块
 * （如工单 15 的 WIN_SHELL_TRUNCATE），禁止在 server/tools 层出现第二个读取点。
 */

/** `WIN_SHELL_TOOLS` —— 工具白名单环境变量名（逗号分隔工具正名）。 */
export const ENV_WIN_SHELL_TOOLS = 'WIN_SHELL_TOOLS';

/** `WIN_SHELL_LAZY` —— 懒加载开关环境变量名（工单 11）。 */
export const ENV_WIN_SHELL_LAZY = 'WIN_SHELL_LAZY';

/** 白名单解析成功结果：names 为去重后的正名集合；空集合表示未配置白名单（全量）。 */
export interface ToolsWhitelistOk {
  ok: true;
  /** 去重后的正名集合（保持首次出现顺序）；空集合 = 调用方按全量处理。 */
  names: ReadonlySet<string>;
}

/** 白名单解析失败结果：unknown 携带全部非法条目原文（而非仅第一个）。 */
export interface ToolsWhitelistError {
  ok: false;
  /** 全部不在正名集合内的条目（含别名与大写变体），已去重并按首次出现顺序排列。 */
  unknown: readonly string[];
}

/** `parseToolsWhitelist` 的解析结果：正名集合或未知条目错误。 */
export type ToolsWhitelistResult = ToolsWhitelistOk | ToolsWhitelistError;

/**
 * 解析 `WIN_SHELL_TOOLS` 工具白名单。
 *
 * 语法：逗号分隔的工具正名，逐项 trim、忽略空段、重复项去重。
 *
 * - undefined / 空串 / 纯空白 → 成功且 `names` 为空集合，调用方按全量处理。
 * - 任一条目不在 `canonicalToolNames` 内 → 失败并返回全部非法条目原文，
 *   此时不返回部分合法集合（fail-fast，杜绝"以为裁剪生效"的哑错误）。
 * - 别名（如 `fs_list` 的 `ls`）不在正名集合内，写进白名单同样归为非法条目；
 *   匹配区分大小写（正名均为小写蛇形，大写变体视为拼写错误）。
 *
 * @param raw 环境变量原始字符串或 undefined（非 process.env 本身）
 * @param canonicalToolNames 内置工具正名集合，只传正名不含别名，
 *   如 `builtinTools.map((t) => t.name)`
 * @returns 解析结果：去重后的正名集合或未知条目错误
 */
export function parseToolsWhitelist(
  raw: string | undefined,
  canonicalToolNames: Iterable<string>,
): ToolsWhitelistResult {
  const names = new Set<string>();
  if (raw !== undefined) {
    for (const segment of raw.split(',')) {
      const name = segment.trim();
      if (name !== '') names.add(name);
    }
  }
  if (names.size === 0) return { ok: true, names };
  const canonical = new Set(canonicalToolNames);
  const unknown = [...names].filter((name) => !canonical.has(name));
  return unknown.length === 0 ? { ok: true, names } : { ok: false, unknown };
}

/**
 * 解析 `WIN_SHELL_LAZY` 懒加载开关。
 *
 * 语义固定：仅精确等于 `"1"` 为懒模式；缺省（undefined）、空串、纯空白及
 * 一切其他值（`"0"`、`"true"`、带空白的 `" 1 "` 等）均为全量模式，不做
 * 宽容变体，保证开关语义无歧义。
 *
 * @param raw 环境变量原始字符串或 undefined（非 process.env 本身）
 * @returns true 表示懒模式，false 表示全量模式
 */
export function parseLazyMode(raw: string | undefined): boolean {
  return raw === '1';
}

/**
 * 构造"存在于内置表但被白名单裁剪"的统一失败文案。
 *
 * server 层 `callTool` 与 `batch_run` 受限步骤解析共用，保证两处归因
 * 文案逐字一致、不漂移。
 *
 * @param name 调用方使用的工具名（正名或别名原文）
 * @returns 含 "未在当前部署暴露（WIN_SHELL_TOOLS）" 字样的错误消息
 */
export function notExposedMessage(name: string): string {
  return `${name} 未在当前部署暴露（WIN_SHELL_TOOLS）`;
}
