/**
 * 文件系统写路径共享助手。
 *
 * 抽取自 fs_write 与 net_download 的父目录预检查逻辑（原两处逐行相同），
 * 统一 "stat 父目录 → ENOTDIR / 递归建 / ENOENT" 的前置条件语义。
 */

import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fail, type AnyToolResult } from '../contract/output.js';
import { ErrorCode, toErrorCode } from '../contract/errors.js';
import { failFromError } from './errors.js';

/**
 * 预检查/创建目标文件所在的父目录。
 *
 * - 父路径存在且为目录 → 返回 null（通过）
 * - 父路径存在但非目录 → ENOTDIR
 * - 父路径不存在且 mkdirParents → 递归创建后返回 null
 * - 父路径不存在且不建 → ENOENT
 * - 其余 errno（如 EACCES）→ failFromError
 *
 * @param filePath 目标文件路径（其 dirname 为待检查父目录）
 * @param mkdirParents 父目录不存在时是否递归创建
 * @returns 失败结果；通过时为 null
 */
export async function prepareParentDir(
  filePath: string,
  mkdirParents: boolean,
): Promise<AnyToolResult | null> {
  const parent = path.dirname(filePath);
  try {
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) {
      return fail(ErrorCode.ENOTDIR, `父路径不是目录: ${parent}`);
    }
  } catch (e) {
    if (toErrorCode(e) === ErrorCode.ENOENT) {
      if (mkdirParents) {
        await mkdir(parent, { recursive: true });
      } else {
        return fail(ErrorCode.ENOENT, `父目录不存在: ${parent}`);
      }
    } else {
      return failFromError(e);
    }
  }
  return null;
}
