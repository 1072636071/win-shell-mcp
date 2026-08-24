/**
 * glob 模式共享模块。
 *
 * 集中 glob→正则转换与正则元字符转义，供 search 与 text 域复用，
 * 消除此前 search.ts 与 text.ts 各自维护一份 `escapeRegex` 的重复。
 */

/** 转义正则元字符，用于将字面量安全转为正则。 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将 glob pattern 转换为 RegExp。
 *
 * 支持的通配符：
 * - 双星斜杠：匹配任意层目录（含 0 层）
 * - 双星：匹配任意字符（含路径分隔符）
 * - 单星：匹配除路径分隔符外的任意字符
 * - 问号：匹配单个除路径分隔符外的字符
 * - 字符集 [abc] 或取反 [!abc]
 *
 * 路径分隔符统一用正斜杠（输入 pattern 中的反斜杠也会被当作正斜杠）。
 *
 * @param pattern glob pattern
 * @returns RegExp
 */
export function globToRegExp(pattern: string): RegExp {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
          // **/ 匹配任意层目录（含 0 层）
          re += `(?:[^/]*/)*`;
          i += 3;
        } else {
          // ** 匹配任意字符（含分隔符）
          re += '.*';
          i += 2;
        }
      } else {
        // * 匹配除分隔符外的任意字符
        re += `[^/]*`;
        i += 1;
      }
    } else if (c === '?') {
      re += `[^/]`;
      i += 1;
    } else if (c === '[') {
      const end = pattern.indexOf(']', i);
      if (end === -1) {
        re += '\\[';
        i += 1;
      } else {
        let cls = pattern.slice(i + 1, end);
        if (cls.startsWith('!')) {
          cls = `^${cls.slice(1)}`;
        }
        re += `[${cls}]`;
        i = end + 1;
      }
    } else if (c === '/' || c === '\\') {
      re += '/';
      i += 1;
    } else {
      re += escapeRegex(c);
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

/** 判断 glob pattern 是否合法（非空且括号配对）。 */
export function isValidGlob(pattern: string): boolean {
  if (pattern.length === 0) return false;
  let depthSquare = 0;
  let depthCurly = 0;
  for (const c of pattern) {
    if (c === '[') depthSquare++;
    else if (c === ']') depthSquare--;
    else if (c === '{') depthCurly++;
    else if (c === '}') depthCurly--;
    if (depthSquare < 0 || depthCurly < 0) return false;
  }
  return depthSquare === 0 && depthCurly === 0;
}
