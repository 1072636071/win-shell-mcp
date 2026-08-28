import path from 'node:path';
import { getDefaultCwd } from '../config/cwd.js';

/**
 * 路径工具：统一处理 Windows 下的 / 与 \、相对路径、盘符，行为与 Unix 语义一致。
 * 所有工具在接收 path/cwd 参数后应经 pathNormalize 处理。
 */

/**
 * 规范化路径：解析相对路径为绝对路径，统一处理 / 与 \ 及盘符。
 * @param input - 待规范化的路径，可为相对路径
 * @param cwd - 解析基准；缺省取部署注入的相对路径基准（未注入时为实时 `process.cwd()`）
 */
export function pathNormalize(input: string, cwd: string = getDefaultCwd()): string {
  if (!input || input === '.') return path.resolve(cwd);
  return path.resolve(cwd, input);
}

/** 将 Windows 反斜杠路径转为正斜杠显示形式（Unix 语义一致）。 */
export function toDisplay(p: string): string {
  return p.replace(/\\/g, '/');
}
