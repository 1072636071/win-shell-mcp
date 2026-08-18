/**
 * 标准错误码。对齐常见 Node errno，附加业务码。
 *
 * 所有工具失败时使用这些码，便于 AI 客户端识别错误类别并决定重试策略。
 */

/** 标准错误码常量。 */
export const ErrorCode = {
  /** 路径不存在。 */
  ENOENT: 'ENOENT',
  /** 是目录（期望文件）。 */
  EISDIR: 'EISDIR',
  /** 不是目录（期望目录）。 */
  ENOTDIR: 'ENOTDIR',
  /** 无权限。 */
  EACCES: 'EACCES',
  /** 超时。 */
  ETIMEOUT: 'ETIMEOUT',
  /** 执行失败。 */
  EEXEC: 'EEXEC',
  /** 参数非法。 */
  EINVAL: 'EINVAL',
  /** 未知错误。 */
  EUNKNOWN: 'EUNKNOWN',
  /** 非法 URL。 */
  INVALID_URL: 'INVALID_URL',
  /** 网络超时。 */
  NET_TIMEOUT: 'NET_TIMEOUT',
  /** 网络连接失败。 */
  NET_FAIL: 'NET_FAIL',
  /** 进程不存在。 */
  PROC_NOT_FOUND: 'PROC_NOT_FOUND',
  /** 终止进程失败。 */
  PROC_KILL_FAIL: 'PROC_KILL_FAIL',
  /** 命令执行失败。 */
  EXEC_FAIL: 'EXEC_FAIL',
  /** 命令执行超时。 */
  EXEC_TIMEOUT: 'EXEC_TIMEOUT',
  /** git 命令失败。 */
  GIT_FAIL: 'GIT_FAIL',
} as const;

/** 错误码字面量类型。 */
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Node.js errno code 到标准错误码的映射。
 *
 * 用于将 Node 抛出的底层 errno 翻译为业务错误码。键为 Node errno 字符串，
 * 值为本仓库的标准错误码。
 */
const NODE_ERRNO_MAP: Readonly<Record<string, ErrorCodeValue>> = {
  // 文件系统
  ENOENT: ErrorCode.ENOENT,
  EISDIR: ErrorCode.EISDIR,
  ENOTDIR: ErrorCode.ENOTDIR,
  EACCES: ErrorCode.EACCES,
  EINVAL: ErrorCode.EINVAL,
  // 超时
  ETIMEDOUT: ErrorCode.ETIMEOUT,
  // 网络（DNS / 连接）→ NET_FAIL
  ENOTFOUND: ErrorCode.NET_FAIL,
  ECONNREFUSED: ErrorCode.NET_FAIL,
  ECONNRESET: ErrorCode.NET_FAIL,
  ECONNABORTED: ErrorCode.NET_FAIL,
  EPIPE: ErrorCode.NET_FAIL,
  EHOSTUNREACH: ErrorCode.NET_FAIL,
  ENETUNREACH: ErrorCode.NET_FAIL,
  EADDRINUSE: ErrorCode.NET_FAIL,
  EADDRNOTAVAIL: ErrorCode.NET_FAIL,
  EAI_AGAIN: ErrorCode.NET_FAIL,
  EAI_FAIL: ErrorCode.NET_FAIL,
  EAI_NODATA: ErrorCode.NET_FAIL,
  // 进程
  ESRCH: ErrorCode.PROC_NOT_FOUND,
  // 执行
  EAGAIN: ErrorCode.EXEC_FAIL,
};

/** 已知错误码集合（用于 O(1) 查询）。 */
const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

/**
 * 错误码对应的默认中文消息。
 *
 * 用于在错误未携带可读 message 时提供回退文案，也便于上层工具直接以码查消息。
 */
export const ERROR_MESSAGES: Readonly<Record<ErrorCodeValue, string>> = {
  ENOENT: '路径不存在',
  EISDIR: '是目录而非文件',
  ENOTDIR: '不是目录',
  EACCES: '无权限',
  ETIMEOUT: '操作超时',
  EEXEC: '执行失败',
  EINVAL: '参数非法',
  EUNKNOWN: '未知错误',
  INVALID_URL: '非法 URL',
  NET_TIMEOUT: '网络超时',
  NET_FAIL: '网络连接失败',
  PROC_NOT_FOUND: '进程不存在',
  PROC_KILL_FAIL: '终止进程失败',
  EXEC_FAIL: '命令执行失败',
  EXEC_TIMEOUT: '命令执行超时',
  GIT_FAIL: 'git 命令失败',
};

/**
 * 将任意错误映射到标准错误码。
 *
 * - Node ErrnoException 的 code 先查 NODE_ERRNO_MAP（含 ENOTFOUND → NET_FAIL 等翻译），
 *   再查已知码集合（直接命中业务码）。
 * - 否则返回 EUNKNOWN。
 *
 * @param err 任意错误值
 */
export function toErrorCode(err: unknown): ErrorCodeValue {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (typeof code === 'string') {
      const mapped = NODE_ERRNO_MAP[code];
      if (mapped !== undefined) return mapped;
      if (KNOWN_CODES.has(code)) return code as ErrorCodeValue;
    }
  }
  return ErrorCode.EUNKNOWN;
}

/**
 * 从任意错误值提取 message 字符串。
 *
 * - Error 优先返回其 message；若 message 为空字符串，回退到
 *   `ERROR_MESSAGES[toErrorCode(err)]` 提供的默认中文文案。
 * - 字符串原样返回。
 * - 其他值转字符串。
 *
 * @param err 错误值
 * @returns 错误消息字符串
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message;
    return ERROR_MESSAGES[toErrorCode(err)];
  }
  if (typeof err === 'string') return err;
  return String(err);
}
