/**
 * pattern 双模解析器（共享）：默认字面量子串匹配，`/…/` 包裹启用正则。
 *
 * 严格判定规则（ADR-0013 · memorial 003 D6）：整串解释为正则，当且仅当——
 * 1. 以 `/` 开头；
 * 2. 存在未转义的收尾 `/`（自首个未转义 `/` 起为收尾定界符）；
 * 3. 正则体非空；
 * 4. 收尾 `/` 之后的末段（flags 段）通过三级分类（队长终版裁定，按实质采纳）：
 *    a. 全部字母落在工具白名单内 → 正则；
 *    b. 单字母白名单外 → EINVAL（单字母是典型 flag 手误形态，如 /foo/q；搜索场景的 g 也落此列）；
 *    c. 多字母且含 g（g 不在本工具白名单时，即搜索场景出现全量标志）→ EINVAL（工单验收明列）；
 *       其余多字母混合形态（如 /usr/bin 的 "bin"、/etc/hosts 的 "hosts"）更可能是路径词组
 *       → 安全收敛为字面量（永远向字面量收敛）。
 *    该判定同时满足 PRD 收敛原则、工单验收第 2 条（/foo/q 与搜索场景 g 均 EINVAL）
 *    与 ADR-0013 效果表全部具名示例，优于「一律 EINVAL」口径。
 *
 * 任一结构条件不满足（非 / 开头、无收尾定界符、体为空、末段含非字母）→ 整串字面量。
 * 结构似正则但 flags 手误 → EINVAL 报错并列明本工具合法标志（响错误优于哑回退）。
 *
 * 已知残余洞（接受并文档化，ADR-0013 决策 2）：形如 `/tmp/` 的「恰好首尾斜杠」短字面量
 * 会被判为正则 `tmp`——由上游 hint 层的「命中异常多」提示兜底（工单 02 承接）。
 */

/** 搜索类工具（text_grep / search_content）的合法 flags：忽略大小写 / 多行锚点 / 单行点号。 */
export const SEARCH_PATTERN_FLAGS: readonly string[] = ['i', 'm', 's'];

/** replace 场景合法 flags：搜索三标志外加 g（全量替换语义开关，ADR-0013 决策 2）。 */
export const REPLACE_PATTERN_FLAGS: readonly string[] = [...SEARCH_PATTERN_FLAGS, 'g'];

/** pattern 双模解析结果。 */
export type PatternParseResult =
  | { ok: true; mode: 'literal'; value: string }
  | { ok: true; mode: 'regex'; regex: RegExp }
  | { ok: false; error: string };

/**
 * 判断 flags 段是否具备「全 ASCII 字母」的 flags 形状。
 *
 * 含非字母（数字、符号、斜杠等）的末段说明输入不是 `/体/flags` 结构
 * （如 `/api/v1/` 的末段 `v1/`），按字面量收敛。
 */
function isFlagShaped(tail: string): boolean {
  return /^[a-zA-Z]*$/.test(tail);
}

/**
 * 解析双模 pattern。
 *
 * @param pattern 原始 pattern 串
 * @param ignoreCase 忽略大小写：对两种模式均生效（正则合并 i 标志；字面量由调用方做不区分大小写比较）
 * @param allowedFlags 本工具合法 flags 白名单（搜索工具用 SEARCH_PATTERN_FLAGS；replace 场景另收 g）
 * @returns 解析结果：
 *          - `{ ok: true, mode: 'literal', value }` —— 整串按字面量使用（value 即原串）
 *          - `{ ok: true, mode: 'regex', regex }`   —— 已编译正则（含 ignoreCase 合并后的 flags，无 g/y，可安全复用 test()）
 *          - `{ ok: false, error }`                 —— EINVAL 错误消息（列明本工具合法标志）
 */
export function parsePattern(
  pattern: string,
  ignoreCase: boolean,
  allowedFlags: ReadonlyArray<string> = SEARCH_PATTERN_FLAGS,
): PatternParseResult {
  // 非斜杠开头：必然字面量
  if (!pattern.startsWith('/')) {
    return { ok: true, mode: 'literal', value: pattern };
  }

  // 从第 2 个字符起扫描首个未转义的 `/` 作为收尾定界符；`\x` 转义对整对跳过
  let closer = -1;
  let i = 1;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '/') {
      closer = i;
      break;
    }
    i += 1;
  }
  // 无收尾定界符（如 "/usr"、"/"）→ 结构不像正则包裹 → 字面量
  if (closer === -1) {
    return { ok: true, mode: 'literal', value: pattern };
  }

  const body = pattern.slice(1, closer);
  const tail = pattern.slice(closer + 1);

  // 体为空（如 "//"、"//i"）或末段非纯字母（如 "/api/v1/" 的 "v1/"）→ 结构歧义 → 字面量
  if (body.length === 0 || !isFlagShaped(tail)) {
    return { ok: true, mode: 'literal', value: pattern };
  }

  const unknown = [...new Set([...tail].filter((f) => !allowedFlags.includes(f)))];
  const illegalFlagsError =
    `非法 flags "${tail}"（白名单外标志: ${unknown.join(' ')}）。` +
    `本工具合法标志为 ${allowedFlags.join('')}，正确写法如 /pattern/${allowedFlags.join('')}。`;

  if (unknown.length === 0) {
    // flags 全部合法 → 正则；ignoreCase 合并 i（Set 去重，避免 RegExp 构造器对重复标志抛 SyntaxError）
    const flagSet = new Set(tail);
    if (ignoreCase) flagSet.add('i');
    try {
      return { ok: true, mode: 'regex', regex: new RegExp(body, [...flagSet].join('')) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `非法正则表达式体: ${msg}` };
    }
  }

  // flags 形状但含白名单外字母：三级分类（终版裁定，判定表见文件头注释）
  const searchSceneG = !allowedFlags.includes('g') && unknown.includes('g');
  if (tail.length === 1 || searchSceneG) {
    // 单字母 = 典型 flag 手误（/foo/q）；搜索场景出现全量标志 g（/foo/ig）→ 响错误
    return { ok: false, error: illegalFlagsError };
  }

  // 多字母、不含全量标志 g → 更可能是路径词组（/usr/bin、/etc/hosts），安全收敛为字面量
  return { ok: true, mode: 'literal', value: pattern };
}
