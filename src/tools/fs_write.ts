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

import { promises as fs, type Stats } from "node:fs";
import path from "node:path";
import { z } from "zod";
import iconvLite from "iconv-lite";

const iconvEncode = iconvLite.encode;
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode, toErrorCode } from "../contract/errors.js";
import { toFail, failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

/** fs_write 输入 schema。 */
export const fsWriteInputSchema = z.object({
  path: z.string().describe("文件"),
  content: z.string().describe("内容"),
  encoding: z.string().optional().describe("编码（默认 utf-8，支持 gbk 等）"),
  append: z.boolean().optional().describe("追加写入（默认覆盖）"),
  mkdirParents: z.boolean().optional().describe("自动建父目录（默认 true）"),
});

/** fs_mkdir 输入 schema。 */
export const fsMkdirInputSchema = z.object({
  path: z.string().describe("目录"),
  recursive: z.boolean().optional().describe("递归创建（默认 true）"),
});

/** fs_rm 输入 schema。 */
export const fsRmInputSchema = z.object({
  path: z.string().describe("路径"),
  recursive: z.boolean().optional().describe("递归删目录树"),
  force: z.boolean().optional().describe("忽略不存在"),
});

/** fs_cp 输入 schema。 */
export const fsCpInputSchema = z.object({
  src: z.string().describe("源"),
  dest: z.string().describe("目标"),
  recursive: z.boolean().optional().describe("递归复制目录"),
});

/** fs_mv 输入 schema。 */
export const fsMvInputSchema = z.object({
  src: z.string().describe("源"),
  dest: z.string().describe("目标"),
  overwrite: z.boolean().optional().describe("覆盖已存在目标（默认 false）"),
});

/** fs_touch 输入 schema。 */
export const fsTouchInputSchema = z.object({
  path: z.string().describe("文件"),
  update: z.boolean().optional().describe("已存在则更新 mtime"),
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
  const enc = (encoding ?? "utf-8").toLowerCase();
  if (enc === "utf-8" || enc === "utf8") {
    return Buffer.from(content, "utf8");
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
export async function fsWriteHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filePath = args["path"] as string;
  const content = args["content"] as string;
  const encoding = args["encoding"] as string | undefined;
  const append = args["append"] === true;
  const mkdirParents = args["mkdirParents"] !== false; // 默认 true

  try {
    const buf = encodeContent(content, encoding);

    // 预检查父目录
    const parent = path.dirname(filePath);
    try {
      const parentStat = await fs.stat(parent);
      if (!parentStat.isDirectory()) {
        return fail(ErrorCode.ENOTDIR, `父路径不是目录: ${parent}`);
      }
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        if (mkdirParents) {
          await fs.mkdir(parent, { recursive: true });
        } else {
          return fail(
            ErrorCode.ENOENT,
            `父目录不存在: ${parent}`,
          ) as unknown as AnyToolResult;
        }
      } else {
        return failFromError(e);
      }
    }

    const flag = append ? "a" : "w";
    await fs.writeFile(filePath, buf, { flag });
    return ok({ written: buf.length });
  } catch (e) {
    return toFail(e);
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
export async function fsMkdirHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const dirPath = args["path"] as string;
  const recursive = args["recursive"] !== false; // 默认 true

  try {
    // 预检查是否已存在
    let existed = false;
    try {
      const stat = await fs.stat(dirPath);
      existed = true;
      if (!stat.isDirectory()) {
        return fail(ErrorCode.ENOTDIR, `已存在且非目录: ${dirPath}`);
      }
    } catch (e) {
      if (toErrorCode(e) !== ErrorCode.ENOENT) {
        return toFail(e);
      }
      // 不存在，继续创建
    }

    await fs.mkdir(dirPath, { recursive });
    return ok({ created: !existed });
  } catch (e) {
    return toFail(e);
  }
}

/**
 * 尝试 stat 指定路径。
 *
 * 统一"路径存在性预检查"的 try/catch：ENOENT 视为不存在返回 ok:false，
 * 其他错误直接抛出，由调用方外层 catch 兜底 toFail。
 *
 * @param p 路径
 * @param statFn stat 实现（默认跟随链接；传 fs.lstat 可检查链接本身）
 * @returns { stat?, ok } —— ok 为 false 表示路径不存在
 */
async function tryStat(
  p: string,
  statFn: (p: string) => Promise<Stats> = fs.stat,
): Promise<{ stat?: Stats; ok: boolean }> {
  try {
    return { stat: await statFn(p), ok: true };
  } catch (e) {
    if (toErrorCode(e) !== ErrorCode.ENOENT) throw e;
    return { ok: false };
  }
}

/**
 * 递归统计目录内条目数（文件 + 子目录）。
 *
 * 用于 fs_rm 递归删除时的条目计数。
 *
 * @param dir 目录路径
 * @returns 条目总数
 */
async function countEntries(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    total++;
    if (entry.isDirectory()) {
      total += await countEntries(path.join(dir, entry.name));
    }
  }
  return total;
}

/**
 * fs_rm handler：删除文件/目录。
 *
 * 行为：
 * - 不存在且非 force → ENOENT
 * - 不存在且 force → removed: false
 * - 非空目录且非 recursive → EACCES（语义：拒绝删除）
 * - 删除成功 → removed: true, targetType, recursiveCount?
 */
export async function fsRmHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const targetPath = args["path"] as string;
  const recursive = args["recursive"] === true;
  const force = args["force"] === true;

  try {
    // 预检查存在性：lstat 判定路径本身是否存在。
    // symlink 即使悬空（目标不存在）也视为"存在"，删除时只删链接本身。
    const lstatRes = await tryStat(targetPath, fs.lstat);
    if (!lstatRes.ok) {
      if (force) {
        return ok({ removed: false });
      }
      return fail(ErrorCode.ENOENT, `路径不存在: ${targetPath}`);
    }

    const lstat = lstatRes.stat as Stats;

    // stat 跟随链接判断实际类型；对悬空链接会抛 ENOENT，不影响删除。
    const statRes = await tryStat(targetPath);
    const statOk = statRes.ok;

    // 判定目标类型：symlink 优先（lstat 不跟随链接）
    let targetType: "file" | "dir" | "symlink";
    if (lstat.isSymbolicLink()) {
      targetType = "symlink";
    } else if (statOk && (statRes.stat as Stats).isDirectory()) {
      targetType = "dir";
    } else {
      targetType = "file";
    }

    // 递归删除时预统计条目数（仅真实目录；symlink 只删链接，不跟入目标）
    let recursiveCount: number | undefined;
    if (recursive && targetType === "dir" && statOk) {
      recursiveCount = (await countEntries(targetPath)) + 1; // 包含目录自身
    }

    if (targetType === "dir") {
      if (!recursive) {
        const entries = await fs.readdir(targetPath);
        if (entries.length > 0) {
          return fail(
            ErrorCode.EACCES,
            `目录非空，需 recursive: ${targetPath}`,
          );
        }
        await fs.rmdir(targetPath);
        return ok({ removed: true, targetType });
      }
      await fs.rm(targetPath, { recursive: true, force: false });
      const result: Record<string, unknown> = {
        removed: true,
        targetType,
      };
      if (recursiveCount !== undefined) {
        result.recursiveCount = recursiveCount;
      }
      return ok(result);
    }

    // 文件 / symlink（含悬空链接）：直接删，Node fs.rm 对 symlink 不跟随目标
    await fs.rm(targetPath);
    return ok({ removed: true, targetType });
  } catch (e) {
    return toFail(e);
  }
}

/**
 * fs_cp handler：复制文件/目录。
 *
 * 行为：
 * - src 不存在 → ENOENT
 * - src 是目录且非 recursive → EINVAL
 * - dest 已存在 → 覆盖（fs.cp / copyFile 默认覆盖），返回 overwritten: true
 * - 复制成功 → copied: true, overwritten?
 */
export async function fsCpHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const src = args["src"] as string;
  const dest = args["dest"] as string;
  const recursive = args["recursive"] === true;

  try {
    let srcStat: Stats;
    try {
      srcStat = await fs.stat(src);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        return fail(ErrorCode.ENOENT, `源路径不存在: ${src}`);
      }
      return toFail(e);
    }

    if (srcStat.isDirectory() && !recursive) {
      return fail(ErrorCode.EINVAL, `复制目录需 recursive: ${src}`);
    }

    // 检查 dest 是否已存在
    const overwritten = (await tryStat(dest)).ok;

    if (srcStat.isDirectory()) {
      await fs.cp(src, dest, { recursive: true });
    } else {
      await fs.copyFile(src, dest);
    }

    const result: Record<string, unknown> = { copied: true };
    if (overwritten) {
      result.overwritten = true;
    }
    return ok(result);
  } catch (e) {
    return toFail(e);
  }
}

/**
 * fs_mv handler：移动/重命名。
 *
 * 行为：
 * - src 不存在 → ENOENT
 * - dest 是目录 → 移入该目录（dest/basename(src)）
 * - dest 已存在且非目录 → overwrite 为 true 时覆盖，否则 EINVAL
 * - 移动成功 → moved: true, dest（最终目标路径）, overwritten?
 */
export async function fsMvHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const src = args["src"] as string;
  const dest = args["dest"] as string;
  const overwrite = args["overwrite"] === true;

  try {
    // 预检查 src
    try {
      await fs.stat(src);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        return fail(ErrorCode.ENOENT, `源路径不存在: ${src}`);
      }
      return toFail(e);
    }

    // 判断 dest 是否已存在及类型，决定最终目标
    let finalDest = dest;
    let overwritten = false;
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
          overwritten = true;
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
          return fail(
            ErrorCode.EINVAL,
            `目标已存在: ${dest}`,
          ) as unknown as AnyToolResult;
        }
        overwritten = true;
        await fs.rm(dest, { force: true });
      }
    } catch (e) {
      if (toErrorCode(e) !== ErrorCode.ENOENT) {
        return toFail(e);
      }
      // dest 不存在，finalDest = dest，直接 rename
    }

    await fs.rename(src, finalDest);
    const result: Record<string, unknown> = {
      moved: true,
      dest: finalDest,
    };
    if (overwritten) {
      result.overwritten = true;
    }
    return ok(result) as unknown as AnyToolResult;
  } catch (e) {
    return toFail(e);
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
export async function fsTouchHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filePath = args["path"] as string;
  const update = args["update"] === true;

  try {
    let existed = true;
    try {
      await fs.stat(filePath);
    } catch (e) {
      if (toErrorCode(e) === ErrorCode.ENOENT) {
        existed = false;
      } else {
        return toFail(e);
      }
    }

    if (!existed) {
      await fs.writeFile(filePath, "", { flag: "w" });
      return ok({ created: true });
    }

    if (update) {
      const now = new Date();
      await fs.utimes(filePath, now, now);
    }
    return ok({ created: false });
  } catch (e) {
    return toFail(e);
  }
}

/**
 * fs_write 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ written }`：写入字节数。
 */
export const fsWriteOutputSchema = z.object({
  written: z.number().int().nonnegative().describe("写入字节数"),
});

/** fs_write 工具定义。 */
export const fsWriteTool: Tool = {
  name: "fs_write",
  domain: "fs",
  description:
    "写文件，支持 utf-8/gbk 编码与追加；mkdirParents 默认 true 自动建父目录。",
  inputSchema: fsWriteInputSchema,
  outputSchema: fsWriteOutputSchema,
  // 覆盖写入会破坏既有内容，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: fsWriteHandler,
};

/**
 * fs_mkdir 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ created }`：是否新建（已存在且是目录时为 false）。
 */
export const fsMkdirOutputSchema = z.object({
  created: z.boolean().describe("是否新建"),
});

/** fs_mkdir 工具定义。 */
export const fsMkdirTool: Tool = {
  name: "fs_mkdir",
  domain: "fs",
  description: "建目录（≈ mkdir -p，recursive 默认 true）。",
  inputSchema: fsMkdirInputSchema,
  outputSchema: fsMkdirOutputSchema,
  // 创建目录非破坏性操作（不覆盖既有内容），destructiveHint 省略
  annotations: { readOnlyHint: false },
  handler: fsMkdirHandler,
};

/**
 * fs_rm 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ removed, targetType?, recursiveCount? }`：
 * - removed：是否删除（force=true 且路径不存在时为 false）
 * - targetType：被删目标的类型（file/dir/symlink；force=true 且路径不存在时无此字段）
 * - recursiveCount：递归删除时删除的条目数（含目标目录自身；仅 recursive=true 且目标为目录时）
 */
export const fsRmOutputSchema = z.object({
  removed: z.boolean().describe("是否删除"),
  targetType: z
    .enum(["file", "dir", "symlink"])
    .optional()
    .describe("目标类型（force 删不存在时无）"),
  recursiveCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("递归删除条目数（含目录自身，仅 recursive+目录时）"),
});

/** fs_rm 工具定义。 */
export const fsRmTool: Tool = {
  name: "fs_rm",
  domain: "fs",
  description:
    "删除文件/目录（≈ rm），recursive 删目录树、force 忽略不存在；返回 removed/targetType/recursiveCount。",
  inputSchema: fsRmInputSchema,
  outputSchema: fsRmOutputSchema,
  // 删除不可逆，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  aliases: ["rm"],
  handler: fsRmHandler,
};

/**
 * fs_cp 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ copied, overwritten? }`：
 * - copied：是否复制成功
 * - overwritten：是否覆盖了已存在的目标（optional）
 */
export const fsCpOutputSchema = z.object({
  copied: z.boolean().describe("是否复制成功"),
  overwritten: z.boolean().optional().describe("是否覆盖已存在目标"),
});

/** fs_cp 工具定义。 */
export const fsCpTool: Tool = {
  name: "fs_cp",
  domain: "fs",
  description: "复制文件/目录（≈ cp，目录需 recursive）。",
  inputSchema: fsCpInputSchema,
  outputSchema: fsCpOutputSchema,
  // 复制到已存在目标会覆盖，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  aliases: ["cp"],
  handler: fsCpHandler,
};

/**
 * fs_mv 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ moved, dest, overwritten? }`：
 * - moved：是否移动成功
 * - dest：最终目标路径
 * - overwritten：是否覆盖了已存在的目标（optional）
 */
export const fsMvOutputSchema = z.object({
  moved: z.boolean().describe("是否移动成功"),
  dest: z.string().describe("最终目标路径"),
  overwritten: z.boolean().optional().describe("是否覆盖已存在目标"),
});

/** fs_mv 工具定义。 */
export const fsMvTool: Tool = {
  name: "fs_mv",
  domain: "fs",
  description:
    "移动/重命名（≈ mv），dest 为目录时移入；overwrite 覆盖已存在目标。",
  inputSchema: fsMvInputSchema,
  outputSchema: fsMvOutputSchema,
  // overwrite=true 时覆盖既有目标，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  aliases: ["mv"],
  handler: fsMvHandler,
};

/**
 * fs_touch 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ created }`：是否新建（已存在时为 false）。
 */
export const fsTouchOutputSchema = z.object({
  created: z.boolean().describe("是否新建"),
});

/** fs_touch 工具定义。 */
export const fsTouchTool: Tool = {
  name: "fs_touch",
  domain: "fs",
  description: "创建空文件或更新 mtime（≈ touch）。",
  inputSchema: fsTouchInputSchema,
  outputSchema: fsTouchOutputSchema,
  // 创建空文件或仅更新 mtime，非破坏性（不删除既有内容），destructiveHint 省略
  annotations: { readOnlyHint: false },
  handler: fsTouchHandler,
};
