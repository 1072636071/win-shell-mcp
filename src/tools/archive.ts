/**
 * archive 工具集：archive_create / archive_extract。
 *
 * 纯 Node 实现（遵循 ADR-0005，不依赖外部 tar/zip 命令）：
 * - tar：POSIX ustar 格式
 * - tar.gz：tar + gzip（zlib）
 * - zip：STORE 方式（无压缩），最小化实现
 *
 * 设计原则：极简输出、跨平台、统一错误码。
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, dirname, basename, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

// ============================================================================
// tar 实现（POSIX ustar）
// ============================================================================

/**
 * 构造 tar 头（512 字节）。
 *
 * @param filePath 归档内文件路径（相对，用 / 分隔）
 * @param size 文件大小（字节）
 * @param mode 文件模式
 * @param mtime 修改时间（ms）
 * @param isDir 是否为目录
 */
function tarHeader(
  filePath: string,
  size: number,
  mode: number,
  mtime: number,
  isDir: boolean,
): Buffer {
  const header = Buffer.alloc(512, 0);
  const name = filePath.slice(0, 100);
  header.write(name, 0, "ascii");
  header.write(
    (mode & 0o777).toString(8).padStart(7, "0") + "\0",
    100,
    "ascii",
  );
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  header.write(
    Math.floor(mtime / 1000)
      .toString(8)
      .padStart(11, "0") + "\0",
    136,
    "ascii",
  );
  header.write("        ", 148, "ascii");
  header.write(isDir ? "5" : "0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i]!;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return header;
}

/** 填充到 512 字节倍数。 */
function padTo512(buf: Buffer): Buffer {
  const remainder = buf.length % 512;
  if (remainder === 0) return Buffer.alloc(0);
  return Buffer.alloc(512 - remainder, 0);
}

/** 递归收集文件列表。 */
async function collectFiles(root: string): Promise<
  Array<{
    rel: string;
    abs: string;
    isDir: boolean;
    size: number;
    mode: number;
    mtime: number;
  }>
> {
  const result: Array<{
    rel: string;
    abs: string;
    isDir: boolean;
    size: number;
    mode: number;
    mtime: number;
  }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split("\\").join("/");
      const s = await stat(abs);
      if (entry.isDirectory()) {
        result.push({
          rel: rel + "/",
          abs,
          isDir: true,
          size: 0,
          mode: s.mode,
          mtime: s.mtimeMs,
        });
        await walk(abs);
      } else if (entry.isFile()) {
        result.push({
          rel,
          abs,
          isDir: false,
          size: s.size,
          mode: s.mode,
          mtime: s.mtimeMs,
        });
      }
    }
  }
  await walk(root);
  return result;
}

/**
 * 创建 tar 归档（返回 Buffer）。
 *
 * @param sources 源文件/目录绝对路径数组
 */
async function createTar(sources: string[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (const src of sources) {
    const s = await stat(src);
    const root = s.isDirectory() ? src : dirname(src);
    const files = s.isDirectory()
      ? await collectFiles(src)
      : [
          {
            rel: basename(src),
            abs: src,
            isDir: false,
            size: s.size,
            mode: s.mode,
            mtime: s.mtimeMs,
          },
        ];
    for (const f of files) {
      chunks.push(tarHeader(f.rel, f.size, f.mode, f.mtime, f.isDir));
      if (!f.isDir) {
        const content = await readFile(f.abs);
        chunks.push(content);
        chunks.push(padTo512(content));
      }
    }
  }
  // 结尾两个全零块
  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

/**
 * 解压 tar 归档。
 *
 * @param tarBuf tar 数据
 * @param dest 目标目录
 */
async function extractTar(tarBuf: Buffer, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  let offset = 0;
  while (offset < tarBuf.length - 512) {
    const header = tarBuf.subarray(offset, offset + 512);
    // 全零块表示结束
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("ascii").replace(/\0+$/, "");
    if (name.length === 0) break;
    const sizeStr = header
      .subarray(124, 136)
      .toString("ascii")
      .replace(/\0+$/, "");
    const size = parseInt(sizeStr, 8);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    offset += 512;

    const targetPath = join(dest, name);
    if (typeflag === "5") {
      await mkdir(targetPath, { recursive: true });
    } else {
      await mkdir(dirname(targetPath), { recursive: true });
      const content = tarBuf.subarray(offset, offset + size);
      await writeFile(targetPath, content);
    }
    // 跳到下一个 512 边界
    offset += Math.ceil(size / 512) * 512;
  }
}

// ============================================================================
// zip 实现（STORE 方式）
// ============================================================================

/** ZIP 中央目录签名。 */
const ZIP_EOCD_SIG = 0x06054b50;

/**
 * 创建 zip 归档（STORE 方式，返回 Buffer）。
 *
 * @param sources 源文件/目录绝对路径数组
 */
async function createZip(sources: string[]): Promise<Buffer> {
  interface ZipEntry {
    name: string;
    data: Buffer;
    crc: number;
    offset: number;
  }
  const entries: ZipEntry[] = [];
  const localChunks: Buffer[] = [];
  let offset = 0;

  for (const src of sources) {
    const s = await stat(src);
    const root = s.isDirectory() ? src : dirname(src);
    const files = s.isDirectory()
      ? await collectFiles(src)
      : [
          {
            rel: basename(src),
            abs: src,
            isDir: false,
            size: s.size,
            mode: s.mode,
            mtime: s.mtimeMs,
          },
        ];

    for (const f of files) {
      if (f.isDir) continue; // 目录由文件路径隐含创建
      const data = await readFile(f.abs);
      const crc = crc32(data);
      const nameBuf = Buffer.from(f.rel, "utf8");

      // Local file header (30 bytes + name)
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // signature
      localHeader.writeUInt16LE(20, 4); // version needed
      localHeader.writeUInt16LE(0, 6); // flags
      localHeader.writeUInt16LE(0, 8); // compression (0 = STORE)
      localHeader.writeUInt16LE(0, 10); // mod time
      localHeader.writeUInt16LE(0, 12); // mod date
      localHeader.writeUInt32LE(crc, 14); // crc32
      localHeader.writeUInt32LE(data.length, 18); // compressed size
      localHeader.writeUInt32LE(data.length, 22); // uncompressed size
      localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
      localHeader.writeUInt16LE(0, 28); // extra field length

      entries.push({ name: f.rel, data, crc, offset });
      localChunks.push(localHeader, nameBuf, data);
      offset += 30 + nameBuf.length + data.length;
    }
  }

  // Central directory
  const centralChunks: Buffer[] = [];
  let centralOffset = offset;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // compression
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(e.crc, 16); // crc32
    central.writeUInt32LE(e.data.length, 20); // compressed size
    central.writeUInt32LE(e.data.length, 24); // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28); // filename length
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(e.offset, 42); // local header offset
    centralChunks.push(central, nameBuf);
  }
  const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12); // central dir size
  eocd.writeUInt32LE(centralOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

/**
 * 解压 zip 归档（STORE 方式）。
 *
 * @param zipBuf zip 数据
 * @param dest 目标目录
 */
async function extractZip(zipBuf: Buffer, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  // 查找 EOCD（从末尾向前搜索签名）
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("zip EOCD 签名未找到");
  }
  const centralOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);

  let offset = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (zipBuf.readUInt32LE(offset) !== 0x02014b50) break;
    const nameLen = zipBuf.readUInt16LE(offset + 28);
    const extraLen = zipBuf.readUInt16LE(offset + 30);
    const commentLen = zipBuf.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(offset + 42);
    const name = zipBuf
      .subarray(offset + 46, offset + 46 + nameLen)
      .toString("utf8");

    // 从 local header 读取数据
    const compSize = zipBuf.readUInt32LE(localHeaderOffset + 18);
    const localNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const data = zipBuf.subarray(dataStart, dataStart + compSize);

    const targetPath = join(dest, name);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, data);

    offset += 46 + nameLen + extraLen + commentLen;
  }
}

/** CRC32 计算表。 */
const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** 计算 CRC32。 */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ buf[i]!) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ============================================================================
// archive_create
// ============================================================================

/** archive_create 输入 schema。 */
export const archiveCreateInputSchema = z.object({
  path: z.string(),
  sources: z.array(z.string().min(1)).min(1),
  format: z
    .enum(["tar", "tar.gz", "zip"])
    .optional()
    .describe("默认按扩展名推断（.tar.gz/.tgz→tar.gz, .zip→zip, 其他→tar）"),
  cwd: z.string().optional().describe("默认 process.cwd()"),
});

/** archive_create 输出。 */
interface ArchiveCreateResult {
  created: boolean;
  path: string;
  format: string;
  bytes: number;
}

function inferFormat(archivePath: string): "tar" | "tar.gz" | "zip" {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".zip")) return "zip";
  return "tar";
}

/**
 * archive_create handler：创建归档。
 */
export async function archiveCreateHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const archivePath = args["path"] as string | undefined;
  const rawSources = args["sources"];
  const formatArg = args["format"] as string | undefined;
  const cwd = (args["cwd"] as string | undefined) ?? process.cwd();

  if (typeof archivePath !== "string" || archivePath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    return fail(ErrorCode.EINVAL, "sources 必须是非空字符串数组");
  }

  const format =
    (formatArg as "tar" | "tar.gz" | "zip" | undefined) ??
    inferFormat(archivePath);
  const sources = (rawSources as string[]).map((s) => resolve(cwd, s));
  const outputPath = resolve(cwd, archivePath);

  // 检查源存在
  for (const src of sources) {
    try {
      await stat(src);
    } catch {
      return fail(
        ErrorCode.ENOENT,
        `源路径不存在: ${src}`,
      ) as unknown as AnyToolResult;
    }
  }

  try {
    let buf: Buffer;
    if (format === "zip") {
      buf = await createZip(sources);
    } else {
      const tarBuf = await createTar(sources);
      buf = format === "tar.gz" ? gzipSync(tarBuf) : tarBuf;
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buf);

    const result: ArchiveCreateResult = {
      created: true,
      path: archivePath,
      format,
      bytes: buf.length,
    };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * archive_create 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ created, path, format, bytes }`。
 */
export const archiveCreateOutputSchema = z.object({
  created: z.boolean(),
  path: z.string(),
  format: z.string(),
  bytes: z.number().int().nonnegative(),
});

/** archive_create 工具定义。 */
export const archiveCreateTool: Tool = {
  name: "archive_create",
  description:
    "创建归档（≈ tar -czf/zip）。纯 Node，支持 tar/tar.gz/zip(STORE)。format 默认按扩展名推断。",
  inputSchema: archiveCreateInputSchema,
  outputSchema: archiveCreateOutputSchema,
  // 写归档文件到文件系统，readOnlyHint: false；不覆盖既有源（仅创建归档），destructiveHint 省略
  annotations: { readOnlyHint: false },
  handler: archiveCreateHandler,
  aliases: ["tar_create", "zip_create"],
};

// ============================================================================
// archive_extract
// ============================================================================

/** archive_extract 输入 schema。 */
export const archiveExtractInputSchema = z.object({
  path: z.string(),
  dest: z.string().optional().describe("默认归档所在目录"),
  cwd: z.string().optional().describe("默认 process.cwd()"),
});

/** archive_extract 输出。 */
interface ArchiveExtractResult {
  extracted: boolean;
  dest: string;
}

/**
 * archive_extract handler：解压归档。
 */
export async function archiveExtractHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const archivePath = args["path"] as string | undefined;
  const destArg = args["dest"] as string | undefined;
  const cwd = (args["cwd"] as string | undefined) ?? process.cwd();

  if (typeof archivePath !== "string" || archivePath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }

  const inputPath = resolve(cwd, archivePath);
  const dest = destArg ? resolve(cwd, destArg) : dirname(inputPath);

  try {
    const buf = await readFile(inputPath);
    const format = inferFormat(archivePath);

    if (format === "zip") {
      await extractZip(buf, dest);
    } else if (format === "tar.gz") {
      const tarBuf = gunzipSync(buf);
      await extractTar(tarBuf, dest);
    } else {
      await extractTar(buf, dest);
    }

    const result: ArchiveExtractResult = { extracted: true, dest };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * archive_extract 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ extracted, dest }`。
 */
export const archiveExtractOutputSchema = z.object({
  extracted: z.boolean(),
  dest: z.string(),
});

/** archive_extract 工具定义。 */
export const archiveExtractTool: Tool = {
  name: "archive_extract",
  description:
    "解压归档（≈ tar -x/unzip）。纯 Node，支持 tar/tar.gz/zip。dest 默认归档所在目录。",
  inputSchema: archiveExtractInputSchema,
  outputSchema: archiveExtractOutputSchema,
  // 解压会向文件系统写入多个文件，可能覆盖既有内容，readOnlyHint: false；
  // 当前实现未显式拒绝覆盖，保守标 destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: archiveExtractHandler,
  aliases: ["tar_extract", "zip_extract"],
};
