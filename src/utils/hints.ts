/**
 * pattern 双模可观测层：双向 hint 引擎（共享纯函数）。
 *
 * 四行双向提示表（ADR-0013 决策 3 / 工单 02），把哑错误变响错误：
 * ① 字面量 + 0 命中 + 含正则元字符 → 「像是正则但按字面量搜了」+ 给出 /…/ 包裹写法
 * ② 字面量 + 0 命中 → 拼写/大小写方向的通用提示
 * ③ 命中数异常偏多 + pattern 形似正则 → 「疑似被当作正则」（兜住 /tmp/ 残余洞）
 * ④ 正则模式 + 0 命中 + 呈反斜杠路径样 → 反斜杠被当转义、建议去 /…/ 改字面量
 *
 * 判据常量全部集中于本文件，为实现期调参项（方向由提示表锁定、数值为合理默认并注释依据）。
 * 工单 03（search_content）/ 04（text_replace）直接复用本引擎。
 */

import { SEARCH_PATTERN_FLAGS } from './pattern.js';

/**
 * 正则元字符清单：hint① 的「含正则元字符」判据与 looksLikeRegex 的形似判定共用。
 *
 * 与 ADR-0013 提示表所列一致：`\d [..] (..) + * ? ^ $ |` 等；`.` `*` `{` `}` 为常见补充。
 */
export const REGEX_METACHARACTERS: readonly string[] = [
  '\\',
  '.',
  '*',
  '+',
  '?',
  '[',
  ']',
  '(',
  ')',
  '{',
  '}',
  '|',
  '^',
  '$',
];

// ── hint③「命中数异常偏多」阈值 ──

/** 绝对阈值：命中行数达到该值即视为异常偏多（大文件无需依赖总行数）。 */
export const ABNORMAL_HIT_ABSOLUTE = 200;

/** 相对阈值的启用下限：参与匹配的总行数至少该值才启用比例判定（避免小文件误报）。 */
export const ABNORMAL_RATIO_MIN_LINES = 20;

/** 相对阈值：命中行占比 ≥ 该值视为异常偏多（一半以上命中通常意味着语义错位而非精准检索）。 */
export const ABNORMAL_HIT_RATIO = 0.5;

/**
 * hint 阈值集合。PRD 明示「提示触发阈值为实现期调参项，方向由双向提示表锁定」，
 * 故保留参数化入口以备调参；当前仓库内无覆盖调用点，默认值即生效值——
 * 调参时改 DEFAULT_HINT_THRESHOLDS 常量或经此参数定向覆盖。
 */
export interface HintThresholds {
  absolute: number;
  ratioMinLines: number;
  ratio: number;
}

/** 默认阈值。 */
export const DEFAULT_HINT_THRESHOLDS: HintThresholds = {
  absolute: ABNORMAL_HIT_ABSOLUTE,
  ratioMinLines: ABNORMAL_RATIO_MIN_LINES,
  ratio: ABNORMAL_HIT_RATIO,
};

/** 搜索场景 hint 上下文。 */
export interface SearchHintContext {
  /** pattern 被解释的模式。 */
  patternMode: 'literal' | 'regex';
  /** 原始 pattern 串。 */
  pattern: string;
  /** 匹配行数。 */
  matchCount: number;
  /** 参与匹配的总行数（用于命中率；未知可省略）。 */
  totalLines?: number;
}

/** 判断字符串是否含正则元字符。 */
export function hasRegexMetacharacters(s: string): boolean {
  return REGEX_METACHARACTERS.some((ch) => s.includes(ch));
}

/**
 * 判断 pattern 是否「形似正则」：呈 /…/ 包裹形状，或含正则元字符。
 */
export function looksLikeRegex(pattern: string): boolean {
  if (/^\/.+\/[a-zA-Z]*$/.test(pattern)) return true;
  return hasRegexMetacharacters(pattern);
}

/**
 * 判断是否呈反斜杠路径样式：
 * - 盘符路径片段：`C:\`、`C:/`（正则体内常写作 `C:\\`）；
 * - UNC 路径头：`\\\\`（源内转义对）或连续反斜杠；
 * 覆盖 hint④ 目标的 C:\Users 样式，不要求锚定开头以便作用于被包裹后的原始串。
 *
 * 已知局限：合法正则体中的连续双反斜杠（如匹配字面反斜杠的 /\\\\/）可能被误判为
 * 路径样式，从而误报 ④ 方向提示——该启发式属 ADR-0013 认可的实现期调参项。
 */
export function looksLikeBackslashPath(s: string): boolean {
  if (/[a-zA-Z]:[\\/]/.test(s)) return true;
  return /\\{2}/.test(s);
}

/**
 * 命中数是否异常偏多：绝对阈值 OR 达到下限后的比例阈值。
 * 搜索与替换两侧共享同一判定（工单 t6/C3），保证 ③ 方向提示行为一致。
 */
export function isAbnormalHitCount(
  count: number,
  totalLines: number | undefined,
  t: HintThresholds = DEFAULT_HINT_THRESHOLDS,
): boolean {
  if (count >= t.absolute) return true;
  if (totalLines !== undefined && totalLines >= t.ratioMinLines && count / totalLines >= t.ratio) {
    return true;
  }
  return false;
}

/**
 * 生成 /…/ 包裹写法建议（pattern 内的斜杠转义，保证建议本身是合法的正则写法）。
 * 搜索与替换两侧共用，避免各工具内联重复实现。
 */
export function suggestWrapped(pattern: string, flags: string): string {
  return `/${pattern.replaceAll('/', '\\/')}/${flags}`;
}

/**
 * 构建搜索场景的双向 hint（纯函数，无副作用）。
 *
 * 规则按序求值、命中即返回（更具体的规则优先）：字面量侧 ① 先于 ②；
 * 正则侧 ④（0 命中）与 ③（异常偏多）按命中数天然互斥。
 *
 * @returns hint 文案；无规则触发返回 undefined —— 调用方据此不占位（可选字段契约）
 */
export function buildSearchHint(
  ctx: SearchHintContext,
  thresholds: HintThresholds = DEFAULT_HINT_THRESHOLDS,
): string | undefined {
  const { patternMode, pattern, matchCount, totalLines } = ctx;

  if (patternMode === 'literal') {
    if (matchCount !== 0) return undefined;
    // ① 更具体：含正则元字符时给出包裹写法
    if (hasRegexMetacharacters(pattern)) {
      return (
        `0 命中：pattern 含正则元字符（如 ${REGEX_METACHARACTERS.filter((c) =>
          pattern.includes(c),
        ).join(' ')}），已按【字面量】原样搜索。若想使用正则，请写作 ${suggestWrapped(pattern, '')} 形式` +
        `（尾部可选 flags ${SEARCH_PATTERN_FLAGS.join('')}，如 ${suggestWrapped(pattern, 'i')} 忽略大小写）。`
      );
    }
    // ② 通用兜底：拼写/大小写方向
    return (
      '0 命中：已按【字面量】原样搜索。请检查拼写与大小写' +
      '（可加 ignoreCase:true 忽略大小写），或确认目标文本确实存在于该文件。'
    );
  }

  // ── 正则模式 ──
  // ④ 优先级高：路径样 pattern 的反斜杠会被当转义吃掉，是最常见的静默错因
  if (matchCount === 0 && looksLikeBackslashPath(pattern)) {
    return (
      '0 命中：pattern 呈反斜杠路径样式且被按【正则】解释——路径中的 \\U 等片段会被当作转义序列而丢失反斜杠。' +
      '若想搜索路径文本，请去掉首尾斜杠直接按【字面量】搜索（默认即字面量，反斜杠无需转义）。'
    );
  }
  // ③ 异常偏多 + 形似正则 → 疑似误入正则模式（兜住 /tmp/ 类残余洞）。
  // 注：本分支内 patternMode==='regex'，按现行解析器构造 pattern 必然呈 /体/flags
  // 包裹形状，looksLikeRegex 恒真——保留该判定作纵深防御：若解析器将来放宽包裹
  // 形状约束（如允许非形似串进正则模式），此处仍能维持「③ 仅针对形似正则」的方向。
  if (isAbnormalHitCount(matchCount, totalLines, thresholds) && looksLikeRegex(pattern)) {
    return (
      `命中 ${matchCount} 行：命中数异常偏多且 pattern 形似正则，疑似 pattern 被当作【正则】解释。` +
      '若本意是搜索字面文本（如以斜杠包裹的路径），请去掉首尾斜杠直接按【字面量】搜索。'
    );
  }
  return undefined;
}
