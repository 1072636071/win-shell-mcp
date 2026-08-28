/**
 * tool_groups 元工具（工单 11-03）：15 命令域概览，懒加载导航入口之一。
 *
 * AI 先看域概览（域名/一句话用途/工具数/代表工具），据此决定用
 * list_domain_tools 取回哪个域的明细，再照常构造调用——把「记住 61 个工具」
 * 的固定输入开销换成一次按需查询。
 *
 * 数据来源：
 * - summary 文案以 CONTEXT.md 术语表为源（静态常量 DOMAIN_BRIEFS，
 *   类型层强制覆盖全部 15 域，漏域即编译失败）；
 * - toolCount/examples 按统计口径工具表实时计算（工单 11-05：默认全量
 *   注册表，白名单部署时为过滤后子表——被裁空的域整体不出现，精选示例
 *   被裁时回退为域内现存工具）；
 * - examples 精选名单由 meta-tools.test.ts 护栏校验其确属该域。
 *
 * 可见性标注：懒模式下 ListTools 列出面只含 3 个 meta，任何命令域的工具都
 * 不被列出，此时每个分组附 `visible: false` 标注；全量模式下全部列出，字段
 * 整体省略（输出极简，同 batch_run verbose 字段的 optional 形态约定）。
 * 模式判定经装配期注入（createServer 的 lazy 选项 → scoped 副本），本模块
 * 不读 process.env——env 原始读取收敛在 stdio 入口（config/env 约定）。
 */

import { z } from "zod";
import { ok, type AnyToolResult } from "../contract/output.js";
import { COMMAND_DOMAINS, type CommandDomain } from "../domains.js";
import { builtinTools } from "../registry.js";
import type { Tool } from "../registry.js";

/** 各域一句话用途与代表工具（summary 以 CONTEXT.md 术语表为源）。 */
const DOMAIN_BRIEFS: Record<
  CommandDomain,
  { summary: string; examples: readonly string[] }
> = {
  system: {
    summary: "系统信息与资源：os/arch/platform/hostname、磁盘用量、内存、PATH 条目",
    examples: ["system_info", "system_disk"],
  },
  fs: {
    summary: "文件系统读写与目录体积：列目录/读/写/建删/复制/移动/touch/stat/du",
    examples: ["fs_list", "fs_read", "fs_write"],
  },
  text: {
    summary: "文本文件逐行处理：head/tail/grep/wc/diff/replace/cat",
    examples: ["text_grep", "text_replace", "cat"],
  },
  search: {
    summary: "按模式查找：glob 文件名匹配、全文内容检索、PATH 定位、递归 find",
    examples: ["search_glob", "search_content", "find"],
  },
  process: {
    summary: "进程管理：进程列表查询与进程终止",
    examples: ["process_list", "process_kill"],
  },
  shell_exec: {
    summary: "兜底通道：命令字符串经 shell 解释器执行",
    examples: ["shell_exec"],
  },
  env: {
    summary: "环境变量读写：get/set/unset",
    examples: ["env_get", "env_set"],
  },
  net: {
    summary: "网络操作：HTTP GET/POST、DNS/TCP 探测、ping、端口监听、下载",
    examples: ["net_get", "net_post", "ping"],
  },
  pkg: {
    summary: "包管理器：检测可用性与代跑命令",
    examples: ["pkg_detect", "pkg_run"],
  },
  git: {
    summary: "git 仓库操作：status/log/branch/diff/add/commit/checkout/push/pull/clone/stash",
    examples: ["git_status", "git_commit"],
  },
  core: {
    summary: "基础原语：pwd / echo",
    examples: ["pwd", "echo"],
  },
  run_command: {
    summary: "兜底通道：argv 数组直执行、不经 shell 解析",
    examples: ["run_command"],
  },
  archive: {
    summary: "归档创建与解压（tar/tar.gz/zip STORE）",
    examples: ["archive_create", "archive_extract"],
  },
  hash: {
    summary: "文件摘要：sha256/sha1/md5/sha512",
    examples: ["hash_file"],
  },
  json: {
    summary: "JSON 取值：路径表达式从 JSON 文件或字符串取值",
    examples: ["json_get"],
  },
};

/** 单个域概览输出 schema。 */
const toolGroupSchema = z.object({
  domain: z.enum(COMMAND_DOMAINS),
  summary: z.string(),
  toolCount: z.number().int().nonnegative(),
  examples: z.array(z.string()),
  visible: z.boolean().optional().describe(
    "仅懒模式返回：该域的工具当前是否被 ListTools 列出（懒模式下恒 false，明细用 list_domain_tools 获取）",
  ),
});

/** tool_groups 输出 schema。 */
const toolGroupsOutputSchema = z.object({
  groups: z.array(toolGroupSchema),
});

/**
 * 构造域概览（groups 按 COMMAND_DOMAINS 声明序排列；工单 11-05 起基于部署子表）。
 *
 * @param lazy 是否懒模式（决定 visible 字段附加与否）
 * @param pool 统计口径工具表（全量部署 = builtinTools；白名单部署 = 过滤后子表）
 */
function buildGroups(lazy: boolean, pool: readonly Tool[]) {
  const groups: Array<{
    domain: CommandDomain;
    summary: string;
    toolCount: number;
    examples: string[];
    visible?: boolean;
  }> = [];
  for (const domain of COMMAND_DOMAINS) {
    const members = pool.filter((t) => t.domain === domain);
    // 工单 11-05：过滤后为空的域不出现（全量池下每域非空由 guard 保证，行为不变）。
    if (members.length === 0) continue;
    const available = new Set(members.map((t) => t.name));
    // 示例优先取精选名单中仍可见者；全部被裁时回退为该域现存前 2 个工具，
    // 避免 AI 拿到指向不可调用工具的代表名。
    const curated = DOMAIN_BRIEFS[domain].examples.filter((n) => available.has(n));
    const examples =
      curated.length > 0 ? curated : members.slice(0, 2).map((t) => t.name);
    groups.push({
      domain,
      summary: DOMAIN_BRIEFS[domain].summary,
      toolCount: members.length,
      examples,
      ...(lazy ? { visible: false } : {}),
    });
  }
  return groups;
}

/**
 * tool_groups handler 工厂。
 *
 * @param pool 统计口径工具表；省略时调用期回退全量注册表（默认行为）。
 *   注意缺省必须在闭包内惰性解析而非参数默认值：本模块由 registry 转载入，
 *   初始化期读取 builtinTools 会踩 ESM 循环 TDZ（同 batch.ts 裁决）。
 *   白名单部署子表经 {@link createScopedToolGroupsTool} 注入（工单 11-05）。
 * @param lazy 是否懒模式（决定 visible 字段附加与否）；缺省 false。
 *   值由装配期（createServer 的 lazy 选项）注入，本模块不读 process.env。
 */
export function createToolGroupsHandler(
  pool?: readonly Tool[],
  lazy?: boolean,
): () => Promise<AnyToolResult> {
  const resolvedLazy = lazy ?? false;
  return async () => ok({ groups: buildGroups(resolvedLazy, pool ?? builtinTools) });
}

/** 默认 handler：统计口径为全量注册表（既有行为，向后兼容）。 */
export const toolGroupsHandler = createToolGroupsHandler();

export const toolGroupsTool: Tool = {
  name: "tool_groups",
  domain: "meta",
  description:
    "浏览15个命令域概览：各域用途、工具数、代表工具。先定位目标域，再调 list_domain_tools(domain) 取明细。只读无参数",
  inputSchema: z.object({}),
  outputSchema: toolGroupsOutputSchema,
  annotations: { readOnlyHint: true },
  handler: toolGroupsHandler,
};

/**
 * 创建统计口径限于 pool 的 tool_groups 工具副本（白名单部署用，工单 11-05）。
 *
 * server 层以过滤后的部署子表注入 `createServer` 时，用本副本替换原工具：
 * 域概览/计数/示例均反映裁剪后真实可见集合，被裁空的域整体不出现。
 * 副本共享 schema/annotations，仅替换 handler，listTools 输出与原工具无差别。
 *
 * @param pool 部署子表（含本副本自身）
 * @param lazy 是否懒模式（装配期注入，见 createToolGroupsHandler）
 * @returns 统计口径受限的 tool_groups 工具副本
 */
export function createScopedToolGroupsTool(
  pool: readonly Tool[],
  lazy?: boolean,
): Tool {
  return { ...toolGroupsTool, handler: createToolGroupsHandler(pool, lazy) };
}
