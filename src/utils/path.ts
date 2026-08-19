import path from 'node:path';

/**
 * 路径工具：统一处理 Windows 下的 / 与 \、相对路径、盘符，行为与 Unix 语义一致。
 * 所有工具在接收 path/cwd 参数后应经 pathNormalize 处理。
 */

/** 规范化路径：解析相对路径为绝对路径，统一处理 / 与 \ 及盘符。 */
export function pathNormalize(input: string, cwd: string = process.cwd()): string {
  if (!input || input === '.') return path.resolve(cwd);
  return path.resolve(cwd, input);
}

/** 将 Windows 反斜杠路径转为正斜杠显示形式（Unix 语义一致）。 */
export function toDisplay(p: string): string {
  return p.replace(/\\/g, '/');
}
