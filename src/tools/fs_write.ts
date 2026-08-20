/**
 * fs 写工具集：fs_write / fs_mkdir / fs_rm / fs_cp / fs_mv / fs_touch。
 *
 * 全部基于 Node fs/promises，破坏性操作返回可验证的状态字段。
 * 错误统一映射到 ErrorCode（见 contract/errors.ts）。
 *
 * 设计要点：
 * - 显式预检查关键前置条件（父目录存在、src 存在、dest 不存在等），
 *   返回语义明确的错误码而非依赖 Node 原生 errno。
 * - 其他不可预期异常经 toErrorCode 兜底为 EUNKNOWN。
 */

import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { encode as iconvEncode } from 'iconv-lite';
import { ok, fail, type AnyToolResult } from '../contract/output.js';
import { ErrorCode, toErrorCode } from '../contract/errors.js';
import { failFromError } from '../utils/errors.js';
import type { Tool } from '../registry.js';

/** fs_write 输入 schema。 */
export const fsWriteInputSchema = z.object({
  path: z.string().describe('目标文件路径'),
  content: z.string().describe('要写入的内容'),
  encoding: z.string().optional().describe('编码，默认 utf-8，支持 gbk 等其它 iconv-lite 编码'),
  append: z.boolean().optional().describe('true 时追加写入，否则覆盖'),
  mkdirParents: z
    .boolean()
    .optional()
    .describe('true 时自动创建不存在的父目录，默认 true'),
});

/** fs_mkdir 输入 schema。 */
export const fsMkdirInputSchema = z.object({
  path: z.string().describe('目标目录路径'),
  recursive: z.boolean().optional().describe('true 时递归创建（默认 true，类似 mkdir -p）'),
});

/** fs_rm 输入 schema。 */
export const fsRmInputSchema = z.object({
  path: z.string().describe('目标路径'),
  recursive: z.boolean().optional().describe('true 时递归删除目录树'),
  force: z.boolean().optional().describe('true 时忽略不存在的路径'),
});

/** fs_cp 输入 schema。 */
export const fsCpInputSchema = z.object({
  src: z.string().describe('源路径'),
  dest: z.string().describe('目标路径'),
  recursive: z.boolean().optional().describe('true 时递归复制目录'),
});

/** fs_mv 输入 schema。 */
export const fsMvInputSchema = z.object({
  src: z.string().describe('源路径'),
  dest: z.string().describe('目标路径（已存在则按 overwrite 处理）'),
  overwrite: z.boolean().optional().describe('true 时覆盖已存在的目标，默认 false'),
});

/** fs_touch 输入 schema。 */
export const fsTouchInputSchema = z.object({
  path: z.string().describe('目标文件路径'),
  update: z.boolean().optional().describe('true 时若文件已存在则更新 mtime 为当前时间'),
});

/**
 * 按编码把字符串编码为 Buffer。
 *
 * - utf-8 / utf8：直接用 Node Buffer.from
 * - 其它（如 gbk）：用 iconv-lite encode
 *
 * @param content 文本内容
 * @param encoding 编码名，默认 utf-8
 */
function encodeContent(content: string, encoding?: string): Buffer {
  const enc = (encoding ?? 'utf-8').toLowerCase();
  if (enc === 'utf-8' || enc === 'utf8') {
    return Buffer.from(content, 'utf8');
  }
  return iconvEncode(content, encoding as string);
}

/**
 * fs_write handler：写文件。
 *
 * 行为：
 * - 父目录不存在 → ENOENT
 * - 父路径存在但非目录 → ENOTDIR
 * - 无权限 → EACCES（由 toErrorCode 兜底）
 * - 返回写入字节数 written
 */
export async function fsWriteHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const filePath = args['path'] as string;
  const content = args['content'] as string;
  const encoding = args['encoding'] as string | undefined;
  const append = args['append'] === true;
  const mkdirParents = args['mkdirParents'] !== false; // 默认 true

  try {
    const buf = encodeContent(content, encoding);

    // 预检查父目录
    const parent = path.dirname(filePath);
    try {
      const parentStat = await fs.stat(parent);
      if (!parentStat.isDirectory()) {
        return fail(ErrorCode.ENOTDIR, `父路径不是目录: ${parent}`) as unknown as AnyToolResult;
      }
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        if (mkdirParents) {
          await fs.mkdir(parent, { recursive: true });
        } else {
          return fail(ErrorCode.ENOENT, `父目录不存在: ${parent}`) as unknown as AnyToolResult;
        }
      } else {
        return failFromError(e);
      }
    }

    const flag = append ? 'a' : 'w';
    await fs.writeFile(filePath, buf, { flag });
    return ok({ written: buf.length }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * fs_mkdir handler：建目录。
 *
 * 行为：
 * - recursive 默认 true
 * - 已存在且非目录 → ENOTDIR
 * - 已存在且是目录 → created: false
 * - 新建 → created: true
 */
export async function fsMkdirHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const dirPath = args['path'] as string;
  const recursive = args['recursive'] !== false; // 默认 true

  try {
    // 预检查是否已存在
    let existed = false;
    try {
      const stat = await fs.stat(dirPath);
      existed = true;
      if (!stat.isDirectory()) {
        return fail(ErrorCode.ENOTDIR, `已存在且非目录: ${dirPath}`) as unknown as AnyToolResult;
      }
    } catch (e) {
      if (toErrorCode(e) !== ErrorCode.ENOENT) {
        return failFromError(e);
      }
      // 不存在，继续创建
    }

    await fs.mkdir(dirPath, { recursive });
    return ok({ created: !existed }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * fs_rm handler：删除文件/目录。
 *
 * 行为：
 * - 不存在且非 force → ENOENT
 * - 不存在且 force → removed: false
 * - 非空目录且非 recursive → EACCES（语义：拒绝删除）
 * - 删除成功 → removed: true
 */
export async function fsRmHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const targetPath = args['path'] as string;
  const recursive = args['recursive'] === true;
  const force = args['force'] === true;

  try {
    // 预检查存在性
    let existed = true;
    let stat: Stats | undefined;
    try {
      stat = await fs.stat(targetPath);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        existed = false;
      } else {
        return failFromError(e);
      }
    }

    if (!existed) {
      if (force) {
        return ok({ removed: false }) as unknown as AnyToolResult;
      }
      return fail(ErrorCode.ENOENT, `路径不存在: ${targetPath}`) as unknown as AnyToolResult;
    }

    // 此时 existed 为 true，stat 已赋值
    const targetStat: Stats = stat as Stats;

    if (targetStat.isDirectory()) {
      if (!recursive) {
        const entries = await fs.readdir(targetPath);
        if (entries.length > 0) {
          return fail(
            ErrorCode.EACCES,
            `目录非空，需 recursive: ${targetPath}`,
          ) as unknown as AnyToolResult;
        }
        await fs.rmdir(targetPath);
        return ok({ removed: true }) as unknown as AnyToolResult;
      }
      await fs.rm(targetPath, { recursive: true, force: false });
      return ok({ removed: true }) as unknown as AnyToolResult;
    }

    // 文件：直接删
    await fs.rm(targetPath);
    return ok({ removed: true }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * fs_cp handler：复制文件/目录。
 *
 * 行为：
 * - src 不存在 → ENOENT
 * - src 是目录且非 recursive → EINVAL
 * - 复制成功 → copied: true
 */
export async function fsCpHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const src = args['src'] as string;
  const dest = args['dest'] as string;
  const recursive = args['recursive'] === true;

  try {
    let srcStat: Stats;
    try {
      srcStat = await fs.stat(src);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        return fail(ErrorCode.ENOENT, `源路径不存在: ${src}`) as unknown as AnyToolResult;
      }
      return failFromError(e);
    }

    if (srcStat.isDirectory() && !recursive) {
      return fail(ErrorCode.EINVAL, `复制目录需 recursive: ${src}`) as unknown as AnyToolResult;
    }

    if (srcStat.isDirectory()) {
      await fs.cp(src, dest, { recursive: true });
    } else {
      await fs.copyFile(src, dest);
    }
    return ok({ copied: true }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * fs_mv handler：移动/重命名。
 *
 * 行为：
 * - src 不存在 → ENOENT
 * - dest 是目录 → 移入该目录（dest/basename(src)）
 * - dest 已存在且非目录 → overwrite 为 true 时覆盖，否则 EINVAL
 * - 移动成功 → moved: true, dest（最终目标路径）
 */
export async function fsMvHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const src = args['src'] as string;
  const dest = args['dest'] as string;
  const overwrite = args['overwrite'] === true;

  try {
    // 预检查 src
    try {
      await fs.stat(src);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        return fail(ErrorCode.ENOENT, `源路径不存在: ${src}`) as unknown as AnyToolResult;
      }
      return failFromError(e);
    }

    // 判断 dest 是否已存在及类型，决定最终目标
    let finalDest = dest;
    try {
      const destStat = await fs.stat(dest);
      if (destStat.isDirectory()) {
        // dest 是目录 → 移入：dest/basename(src)
        finalDest = path.join(dest, path.basename(src));
        // 检查 finalDest 是否已存在
        try {
          await fs.stat(finalDest);
          if (!overwrite) {
            return fail(
              ErrorCode.EINVAL,
              `目标已存在: ${finalDest}`,
            ) as unknown as AnyToolResult;
          }
          await fs.rm(finalDest, { recursive: true, force: true });
        } catch (e) {
          if (toErrorCode(e) !== ErrorCode.ENOENT) {
            return failFromError(e);
          }
          // finalDest 不存在，OK
        }
      } else {
        // dest 是文件
        if (!overwrite) {
          return fail(ErrorCode.EINVAL, `目标已存在: ${dest}`) as unknown as AnyToolResult;
        }
        await fs.rm(dest, { force: true });
      }
    } catch (e) {
      if (toErrorCode(e) !== ErrorCode.ENOENT) {
        return failFromError(e);
      }
      // dest 不存在，finalDest = dest，直接 rename
    }

    await fs.rename(src, finalDest);
    return ok({ moved: true, dest: finalDest }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * fs_touch handler：创建空文件或更新 mtime。
 *
 * 行为：
 * - 文件不存在 → 创建空文件，created: true
 * - 文件存在且 update=true → 更新 atime/mtime 为当前时间，created: false
 * - 文件存在且 update=false → 不修改时间，created: false
 * - 无权限 → EACCES
 */
export async function fsTouchHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const filePath = args['path'] as string;
  const update = args['update'] === true;

  try {
    let existed = true;
    try {
      await fs.stat(filePath);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        existed = false;
      } else {
        return failFromError(e);
      }
    }

    if (!existed) {
      await fs.writeFile(filePath, '', { flag: 'w' });
      return ok({ created: true }) as unknown as AnyToolResult;
    }

    if (update) {
      const now = new Date();
      await fs.utimes(filePath, now, now);
    }
    return ok({ created: false }) as unknown as AnyToolResult;
  } catch (e) {
    return failFromError(e);
  }
}

/** fs_write 工具定义。 */
export const fsWriteTool: Tool = {
  name: 'fs_write',
  description:
    '写文件（支持 utf-8/gbk 编码，可追加写入）。mkdirParents 默认 true 自动建父目录。返回写入字节数。',
  inputSchema: fsWriteInputSchema,
  handler: fsWriteHandler,
};

/** fs_mkdir 工具定义。 */
export const fsMkdirTool: Tool = {
  name: 'fs_mkdir',
  description: '建目录（recursive 默认 true，类似 mkdir -p）。返回是否新建。',
  inputSchema: fsMkdirInputSchema,
  handler: fsMkdirHandler,
};

/** fs_rm 工具定义。 */
export const fsRmTool: Tool = {
  name: 'fs_rm',
  description: '删除文件/目录（recursive 删目录树，force 忽略不存在）。返回是否删除。',
  inputSchema: fsRmInputSchema,
  handler: fsRmHandler,
};

/** fs_cp 工具定义。 */
export const fsCpTool: Tool = {
  name: 'fs_cp',
  description: '复制文件/目录（目录需 recursive）。返回是否复制成功。',
  inputSchema: fsCpInputSchema,
  handler: fsCpHandler,
};

/** fs_mv 工具定义。 */
export const fsMvTool: Tool = {
  name: 'fs_mv',
  description:
    '移动/重命名（≈ Unix mv）。dest 为目录时移入该目录；overwrite 为 true 时覆盖已存在目标。返回 { moved, dest }。',
  inputSchema: fsMvInputSchema,
  handler: fsMvHandler,
};

/** fs_touch 工具定义。 */
export const fsTouchTool: Tool = {
  name: 'fs_touch',
  description: '创建空文件或更新 mtime。返回是否新建（false 表示已存在）。',
  inputSchema: fsTouchInputSchema,
  handler: fsTouchHandler,
};