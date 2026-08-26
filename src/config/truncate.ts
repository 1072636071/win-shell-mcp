/**
 * 截断阈值运行期状态（config 锥体内的叶子）。
 *
 * 持有当前截断阈值（模块级可变态），由 stdio 入口从 WIN_SHELL_TRUNCATE 经
 * config/env 的 parseTruncateLimit 解析后 setTruncateLimit 注入；未注入时保持
 * DEFAULT_TRUNCATE_LIMIT（零破坏）。输出契约的 truncate 经 getTruncateLimit
 * 读取，各工具据此截断长内容。
 *
 * 归位说明：阈值本是部署语义，其状态与解析同栖于 config 锥体，输出契约只
 * 消费不持有，保证 ok/fail/withVerbose 等纯构造无隐藏可变状态。
 * 测试需在 afterEach 调 resetTruncateLimit 复原，避免跨用例污染。
 */

/** 默认截断长度（字符数）。 */
export const DEFAULT_TRUNCATE_LIMIT = 2000;

/** 当前截断阈值（模块级，由 {@link setTruncateLimit} 设置）。 */
let currentTruncateLimit = DEFAULT_TRUNCATE_LIMIT;

/** 读取当前截断阈值（供 truncate 默认参数与各工具截断判定调用）。 */
export function getTruncateLimit(): number {
  return currentTruncateLimit;
}

/** 设置截断阈值（启动时由 server 入口从 WIN_SHELL_TRUNCATE 注入）。 */
export function setTruncateLimit(limit: number): void {
  currentTruncateLimit = limit;
}

/** 重置截断阈值为默认值（测试复原用）。 */
export function resetTruncateLimit(): void {
  currentTruncateLimit = DEFAULT_TRUNCATE_LIMIT;
}