import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encode as iconvEncode, decode as iconvDecode } from 'iconv-lite';
import { isLikelyGBK } from '../../src/encoding/detect.js';
import {
  textGrepHandler,
  textGrepTool,
  textHeadHandler,
  textTailHandler,
  textWcHandler,
  textDiffHandler,
  textReplaceHandler,
  textReplaceInputSchema,
  textTools,
} from '../../src/tools/text.js';
import { isOk, isFail } from '../../src/contract/output.js';

// ─── 临时文件辅助 ───────────────────────────────────────

const tmpDir = join(tmpdir(), `win-shell-mcp-text-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let fileCounter = 0;

/** 创建临时文件并写入内容，返回文件路径。 */
async function createFile(content: string, ext = '.txt'): Promise<string> {
  const path = join(tmpDir, `file-${++fileCounter}${ext}`);
  await writeFile(path, content, 'utf-8');
  return path;
}

beforeEach(async () => {
  fileCounter = 0;
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── 工具定义 ───────────────────────────────────────────

describe('textTools 定义', () => {
  it('包含 6 个工具', () => {
    expect(textTools).toHaveLength(6);
  });

  it('工具名正确', () => {
    const names = textTools.map((t) => t.name);
    expect(names).toEqual([
      'text_grep',
      'text_head',
      'text_tail',
      'text_wc',
      'text_diff',
      'text_replace',
    ]);
  });

  it('每个工具有描述和 handler', () => {
    for (const tool of textTools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.handler).toBe('function');
      expect(typeof tool.inputSchema.safeParse).toBe('function');
    }
  });
});

// ─── text_grep ──────────────────────────────────────────

describe('text_grep', () => {
  it('字符串字面量匹配', async () => {
    const path = await createFile('apple\nbanana\ncherry\napple pie\n');
    const result = await textGrepHandler({ path, pattern: 'apple' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({ line: 1, text: 'apple' });
      expect(matches[1]).toEqual({ line: 4, text: 'apple pie' });
      expect(result['count']).toBe(2);
      expect(result['truncated']).toBe(false);
      expect(result['patternMode']).toBe('literal');
    }
  });

  it('正则匹配 /pattern/', async () => {
    const path = await createFile('foo123\nbar\nfoo456\nbaz\n');
    const result = await textGrepHandler({ path, pattern: '/foo\\d+/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(2);
      expect(matches[0]!.line).toBe(1);
      expect(matches[1]!.line).toBe(3);
      expect(result['count']).toBe(2);
      expect(result['patternMode']).toBe('regex');
    }
  });

  it('ignoreCase 忽略大小写', async () => {
    const path = await createFile('Hello\nHELLO\nhello\nWorld\n');
    const result = await textGrepHandler({ path, pattern: 'hello', ignoreCase: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(3);
    }
  });

  it('ignoreCase 不开启时区分大小写', async () => {
    const path = await createFile('Hello\nHELLO\nhello\nWorld\n');
    const result = await textGrepHandler({ path, pattern: 'hello' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(1);
    }
  });

  it('context 上下文行', async () => {
    const path = await createFile('line1\nline2\nline3\nline4\nline5\n');
    const result = await textGrepHandler({ path, pattern: 'line3', context: 1 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      // line3 在第 3 行，context=1 → 第 2、3、4 行
      expect(matches).toHaveLength(3);
      expect(matches[0]).toEqual({ line: 2, text: 'line2' });
      expect(matches[1]).toEqual({ line: 3, text: 'line3' });
      expect(matches[2]).toEqual({ line: 4, text: 'line4' });
      expect(result['count']).toBe(1);
    }
  });

  it('context 去重相邻匹配的上下文', async () => {
    const path = await createFile('a\nb\nb\nc\n');
    // 匹配 b 在第 2、3 行，context=1 → 1,2,3,4 去重
    const result = await textGrepHandler({ path, pattern: 'b', context: 1 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(4);
      expect(result['count']).toBe(2);
    }
  });

  it('maxResults 截断', async () => {
    const path = await createFile('x\nx\nx\nx\nx\n');
    const result = await textGrepHandler({ path, pattern: 'x', maxResults: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(2);
      expect(result['truncated']).toBe(true);
    }
  });

  it('maxResults 未超出时 truncated=false', async () => {
    const path = await createFile('x\nx\nx\n');
    const result = await textGrepHandler({ path, pattern: 'x', maxResults: 5 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(3);
      expect(result['truncated']).toBe(false);
    }
  });

  it('空文件返回空结果', async () => {
    const path = await createFile('');
    const result = await textGrepHandler({ path, pattern: 'foo' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
      // 成功结果（含 0 命中）必须携带模式标识字段
      expect(result['patternMode']).toBe('literal');
    }
  });

  it('无匹配返回空结果', async () => {
    const path = await createFile('apple\nbanana\n');
    const result = await textGrepHandler({ path, pattern: 'cherry' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textGrepHandler({ path: join(tmpDir, 'nonexistent.txt'), pattern: 'foo' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('路径是目录返回 EISDIR', async () => {
    const result = await textGrepHandler({ path: tmpDir, pattern: 'foo' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EISDIR');
    }
  });

  it('返回结构为 [{line, text}]', async () => {
    const path = await createFile('hello\nworld\n');
    const result = await textGrepHandler({ path, pattern: 'hello' });
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches[0]).toHaveProperty('line');
      expect(matches[0]).toHaveProperty('text');
      expect(typeof matches[0]!.line).toBe('number');
      expect(typeof matches[0]!.text).toBe('string');
    }
  });
});

// ─── text_grep · pattern 双模严格判定（表驱动） ──────────

/**
 * 双模判定表驱动夹具（16 行，行号 1-indexed）：
 * 行内文本精心构造，使「按字面量解释」与「按正则解释」产生可区分的命中集合。
 */
const DUAL_MODE_FIXTURE = [
  'C:\\Users\\alice\\notes.txt', // 1 反斜杠路径
  'foo123', // 2
  'plain bar line', // 3
  'foo456', // 4
  'x/a/b/y', // 5
  'a/b', // 6
  'visit /api/v1/users now', // 7 多斜杠路径
  'TMP dir /tmp/ here', // 8
  'bare tmp token', // 9
  '// comment line', // 10
  'regex \\d{3} sample', // 11 字面元字符文本
  'a|b pipe line', // 12
  'a.b dot line', // 13
  'axb dotless', // 14
  'FOO789', // 15
  'abxc tail', // 16
].join('\n');

type DualModeRow =
  | {
      kind: 'ok';
      name: string;
      pattern: string;
      ignoreCase?: boolean;
      mode: 'literal' | 'regex';
      count: number;
      /** 断言匹配行文本精确等于该列表（按行号升序）；缺省只断言 count 与模式标识 */
      texts?: string[];
    }
  | { kind: 'einval'; name: string; pattern: string; contains: string[] };

describe('text_grep · pattern 双模严格判定（表驱动，经 handler 外部行为断言）', () => {
  const rows: DualModeRow[] = [
    // ── 字面量收敛形态 ──
    {
      kind: 'ok',
      name: '多斜杠路径归字面量：/api/v1/',
      pattern: '/api/v1/',
      mode: 'literal',
      count: 1,
      texts: ['visit /api/v1/users now'],
    },
    {
      // 移交清单点名形态：三斜杠 /a/b/，收尾定界符后的末段 'b/' 含非字母 → 结构歧义归字面量
      kind: 'ok',
      name: '三斜杠路径归字面量：/a/b/',
      pattern: '/a/b/',
      mode: 'literal',
      count: 1,
      texts: ['x/a/b/y'],
    },
    {
      // 尾斜杠转义歧义形态：/a\/ 无未转义收尾定界符 → 不构成 /体/flags 结构，归字面量
      kind: 'ok',
      name: '尾斜杠转义歧义形态归字面量：/a\\/',
      pattern: '/a\\/',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    {
      kind: 'ok',
      name: '纯元字符字面量：\\d{3} 原样匹配、不当正则',
      pattern: '\\d{3}',
      mode: 'literal',
      count: 1,
      texts: ['regex \\d{3} sample'],
    },
    {
      kind: 'ok',
      name: '纯元字符字面量：a|b 不展开或运算',
      pattern: 'a|b',
      mode: 'literal',
      count: 1,
      texts: ['a|b pipe line'],
    },
    {
      kind: 'ok',
      name: '元字符点号按字面量：a.b 不匹配 axb',
      pattern: 'a.b',
      mode: 'literal',
      count: 1,
      texts: ['a.b dot line'],
    },
    {
      kind: 'ok',
      name: '反斜杠路径免转义：C:\\Users\\alice 原样命中',
      pattern: 'C:\\Users\\alice',
      mode: 'literal',
      count: 1,
      texts: ['C:\\Users\\alice\\notes.txt'],
    },
    {
      kind: 'ok',
      name: '空体归字面量：// 只匹配字面双斜杠（空正则会命中全部行）',
      pattern: '//',
      mode: 'literal',
      count: 1,
      texts: ['// comment line'],
    },
    {
      kind: 'ok',
      name: '空体带尾巴仍归字面量：//i',
      pattern: '//i',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    {
      kind: 'ok',
      name: '无收尾定界符归字面量：/usr',
      pattern: '/usr',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    // ── 正则形态 ──
    {
      kind: 'ok',
      name: '恰好首尾斜杠短字面量判为正则（残余洞）：/tmp/',
      pattern: '/tmp/',
      mode: 'regex',
      count: 2,
    },
    { kind: 'ok', name: '无 flags 正则：/foo\\d+/', pattern: '/foo\\d+/', mode: 'regex', count: 2 },
    {
      kind: 'ok',
      name: '合法 flags i 生效：/foo\\d+/i 命中 FOO789',
      pattern: '/foo\\d+/i',
      mode: 'regex',
      count: 3,
    },
    {
      kind: 'ok',
      name: '锚点正则：/^foo\\d+$/',
      pattern: '/^foo\\d+$/',
      mode: 'regex',
      count: 2,
    },
    {
      kind: 'ok',
      name: '锚点 + flags i：/^foo\\d+$/i',
      pattern: '/^foo\\d+$/i',
      mode: 'regex',
      count: 3,
    },
    {
      kind: 'ok',
      name: '合法 flags s 被接受：/ab.c/s',
      pattern: '/ab.c/s',
      mode: 'regex',
      count: 1,
      texts: ['abxc tail'],
    },
    {
      kind: 'ok',
      name: '转义内部斜杠的正则体：/a\\/b/',
      pattern: '/a\\/b/',
      mode: 'regex',
      count: 2,
      texts: ['x/a/b/y', 'a/b'],
    },
    {
      kind: 'ok',
      name: '重复 flags 去重不报错：/foo\\d+/mm',
      pattern: '/foo\\d+/mm',
      mode: 'regex',
      count: 2,
    },
    // ── ignoreCase 对两种模式均生效 ──
    {
      kind: 'ok',
      name: 'ignoreCase × 字面量：foo789 命中 FOO789',
      pattern: 'foo789',
      ignoreCase: true,
      mode: 'literal',
      count: 1,
      texts: ['FOO789'],
    },
    {
      kind: 'ok',
      name: '字面量区分大小写：foo789 无命中仍携带模式标识',
      pattern: 'foo789',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    {
      kind: 'ok',
      name: 'ignoreCase × 正则：/foo\\d+/ 合并 i 后命中 FOO789',
      pattern: '/foo\\d+/',
      ignoreCase: true,
      mode: 'regex',
      count: 3,
    },
    // ── EINVAL：结构似正则但 flags 非法（消息列明本工具合法标志） ──
    {
      kind: 'einval',
      name: '白名单外字母 flags：/foo/q',
      pattern: '/foo/q',
      contains: ['非法 flags "q"', '合法标志为 ims'],
    },
    {
      kind: 'einval',
      name: '明确不收的扩展标志 x：/foo/x',
      pattern: '/foo/x',
      contains: ['非法 flags "x"', '合法标志为 ims'],
    },
    {
      // 多字母混合形态（b 为白名单外字母、无 g）→ 词形状豁免，收敛字面量而非 EINVAL
      kind: 'ok',
      name: '多字母非 flag 词形状归字面量：/foo/bi',
      pattern: '/foo/bi',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    {
      kind: 'einval',
      name: '搜索场景出现全量标志 g：/foo/g',
      pattern: '/foo/g',
      contains: ['非法 flags "g"', '合法标志为 ims'],
    },
    {
      kind: 'einval',
      name: '搜索场景出现全量标志组合 ig：/foo/ig',
      pattern: '/foo/ig',
      contains: ['非法 flags "ig"', '合法标志为 ims'],
    },
    {
      kind: 'einval',
      name: '大写标志不在白名单：/foo/I',
      pattern: '/foo/I',
      contains: ['非法 flags "I"', '合法标志为 ims'],
    },
    {
      // 终版裁定（三级分类）：多字母尾段、不含全量标志 g → 判为词组而非 flag 手误，安全收敛字面量
      kind: 'ok',
      name: '两段词路径归字面量：/usr/bin',
      pattern: '/usr/bin',
      mode: 'literal',
      count: 0,
      texts: [],
    },
    {
      kind: 'ok',
      name: '体内斜杠转义写法可用：/usr\\/bin/ 按正则命中 usr/bin 文本（0 命中仅因夹具无此文本）',
      pattern: '/usr\\/bin/',
      mode: 'regex',
      count: 0,
      texts: [],
    },
    {
      kind: 'einval',
      name: '非法正则体报错而非静默回退：/a(/',
      pattern: '/a(/',
      contains: ['非法正则表达式体'],
    },
  ];

  for (const row of rows) {
    it(row.name, async () => {
      const path = await createFile(DUAL_MODE_FIXTURE);
      const args =
        row.kind === 'ok' && row.ignoreCase !== undefined
          ? { path, pattern: row.pattern, ignoreCase: row.ignoreCase }
          : { path, pattern: row.pattern };
      const result = await textGrepHandler(args);

      if (row.kind === 'einval') {
        expect(isFail(result)).toBe(true);
        if (isFail(result)) {
          expect(result.error.code).toBe('EINVAL');
          for (const frag of row.contains) {
            expect(result.error.message).toContain(frag);
          }
        }
        return;
      }

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 每个成功结果包含模式标识字段且值正确
        expect(result['patternMode']).toBe(row.mode);
        expect(result['count']).toBe(row.count);
        if (row.texts !== undefined) {
          const matches = result['matches'] as Array<{ line: number; text: string }>;
          expect(matches.map((m) => m.text)).toEqual(row.texts);
        }
      }
    });
  }

  it('GBK 编码文件搜索不回归（字面量与正则双模）', async () => {
    const gbkPath = join(tmpDir, `gbk-grep-${++fileCounter}.txt`);
    await writeFile(gbkPath, iconvEncode('你好 world\n第二行 data\n', 'gbk'));

    const r1 = await textGrepHandler({ path: gbkPath, pattern: '你好' });
    expect(isOk(r1)).toBe(true);
    if (isOk(r1)) {
      expect(r1['count']).toBe(1);
      expect(r1['patternMode']).toBe('literal');
      const matches = r1['matches'] as Array<{ line: number; text: string }>;
      expect(matches[0]!.line).toBe(1);
    }

    const r2 = await textGrepHandler({ path: gbkPath, pattern: '/wor.d/' });
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) {
      expect(r2['count']).toBe(1);
      expect(r2['patternMode']).toBe('regex');
    }

    const r3 = await textGrepHandler({ path: gbkPath, pattern: 'DATA', ignoreCase: true });
    expect(isOk(r3)).toBe(true);
    if (isOk(r3)) {
      expect(r3['count']).toBe(1);
      expect(r3['patternMode']).toBe('literal');
    }
  });

  it('GBK 编码文件 0 命中触发拼写/大小写通用提示（hint② 对双字节文本同样生效）', async () => {
    const gbkPath = join(tmpDir, `gbk-grep-hint-${++fileCounter}.txt`);
    await writeFile(gbkPath, iconvEncode('你好 world\n', 'gbk'));
    const result = await textGrepHandler({ path: gbkPath, pattern: '不存在词' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('拼写');
    }
  });
});

// ─── text_grep · 双向 hint（工单02 · 四行提示表） ────────

describe('text_grep · 双向 hint（成功响应可选字段，不触发不占位）', () => {
  /** 断言成功结果不带 hint 键（不占位）。 */
  function expectNoHint(result: unknown): void {
    expect(result).toHaveProperty('ok', true);
    expect(result).not.toHaveProperty('hint');
  }

  // ── hint① 字面量 + 0 命中 + 含正则元字符 ──

  it('hint① 触发：a|b 字面量 0 命中 → 提示像是正则并给出 /…/ 包裹写法', async () => {
    const path = await createFile('hello\nworld\n');
    const result = await textGrepHandler({ path, pattern: 'a|b' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string;
      expect(hint).toContain('正则');
      expect(hint).toContain('/a|b/');
    }
  });

  it('hint① 不触发：同一 pattern 有命中时不提示', async () => {
    const path = await createFile('a|b pipe line\nother\n');
    const result = await textGrepHandler({ path, pattern: 'a|b' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBeGreaterThan(0);
    expectNoHint(result);
  });

  it('hint① 不触发：字面量无元字符时走 ② 不走 ①（文案不含正则改写指引）', async () => {
    const path = await createFile('apple\nbanana\n');
    const result = await textGrepHandler({ path, pattern: 'zebra' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const hint = result['hint'] as string;
      expect(hint).not.toContain('/zebra/');
    }
  });

  // ── hint② 字面量 + 0 命中（拼写/大小写通用） ──

  it('hint② 触发：普通词 0 命中 → 拼写/大小写通用提示（指向 ignoreCase）', async () => {
    const path = await createFile('apple\nbanana\n');
    const result = await textGrepHandler({ path, pattern: 'zebra' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const hint = result['hint'] as string;
      expect(hint).toContain('拼写');
      expect(hint).toContain('ignoreCase');
    }
  });

  it('hint② 不触发：有命中时不提示', async () => {
    const path = await createFile('zebra here\n');
    const result = await textGrepHandler({ path, pattern: 'zebra' });
    expectNoHint(result);
  });

  // ── hint③ 命中异常偏多 + 形似正则（兜残余洞） ──

  it('hint③ 触发：/x/ 正则命中 300 行（远超绝对阈值）→ 疑似被当作正则', async () => {
    const lines = Array.from({ length: 300 }, (_, i) => `x line ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: '/x/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['count']).toBe(300);
      const hint = result['hint'] as string;
      expect(hint).toContain('疑似');
      expect(hint).toContain('字面量');
    }
  });

  it('hint③ 不触发：字面量模式命中再多也不提示「疑似正则」（方向仅针对正则解释）', async () => {
    const lines = Array.from({ length: 300 }, (_, i) => `x line ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: 'x' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBe(300);
    expectNoHint(result);
  });

  it('hint③ 不触发：正则模式但命中数未达阈值（小文件少量命中）', async () => {
    const path = await createFile('x\ny\nz\n');
    const result = await textGrepHandler({ path, pattern: '/x/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBe(1);
    expectNoHint(result);
  });

  it('hint③ 兜底残余洞：/tmp/ 类短字面量被判正则且大面积命中时给出提示', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `under tmp dir ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: '/tmp/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['count']).toBe(250);
      const hint = result['hint'] as string;
      expect(hint).toContain('疑似');
    }
  });

  it('hint③ 比例阈值路径：命中占比 ≥50%（总行数达下限）即触发，无需达到绝对阈值', async () => {
    // 30 行中 20 行命中（≈67%）：低于绝对阈值 200，走「总行数≥20 且占比≥50%」相对判据
    const lines = Array.from({ length: 30 }, (_, i) => (i < 20 ? `x row ${i + 1}` : `other ${i + 1}`));
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: '/x/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(20);
      expect(result['patternMode']).toBe('regex');
      const hint = result['hint'] as string;
      expect(hint).toContain('疑似');
    }
  });

  it('hint③ 比例阈值下限保护：总行数不足下限时不触发（小文件少量命中不骚扰）', async () => {
    // 15 行全命中：占比 100% 但总行数 < 20 下限、count < 绝对阈值 → 不提示
    const lines = Array.from({ length: 15 }, (_, i) => `x row ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: '/x/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBe(15);
    expectNoHint(result);
  });

  it('hint③ 防回归：maxResults 截断后仍按截断前真实命中数判异常偏多', async () => {
    // 300 行匹配但 maxResults=5：hint③ 判据必须吃截断前的真实总数，否则截断调用永远漏提示
    const lines = Array.from({ length: 300 }, (_, i) => `under tmp dir ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textGrepHandler({ path, pattern: '/tmp/', maxResults: 5 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(5);
      expect(result['truncated']).toBe(true);
      expect(result['patternMode']).toBe('regex');
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('疑似');
    }
  });

  // ── hint④ 正则模式 + 0 命中 + 反斜杠路径样 ──

  it('hint④ 触发：/C:\\Users\\alice/ 正则 0 命中 → 反斜杠被当转义、建议改字面量', async () => {
    const path = await createFile('nothing relevant\nanother line\n');
    const result = await textGrepHandler({ path, pattern: '/C:\\\\Users\\\\alice/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string;
      expect(hint).toContain('转义');
      expect(hint).toContain('字面量');
    }
  });

  it("hint④ 触发：UNC 路径样 /\\\\\\\\server/ 0 命中同样提示", async () => {
    const path = await createFile('no slashes here\n');
    const result = await textGrepHandler({ path, pattern: '/\\\\\\\\server/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string;
      expect(hint).toContain('转义');
    }
  });

  it('hint④ 不触发：正则 0 命中但不呈路径样（普通正则空结果不骚扰）', async () => {
    const path = await createFile('plain text\n');
    const result = await textGrepHandler({ path, pattern: '/xyzq\\d+/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBe(0);
    expectNoHint(result);
  });

  it('hint④ 不触发：路径样正则有命中时（说明转义写对了）不提示', async () => {
    const path = await createFile('profile at C:\\Users\\alice\\notes.txt end\n');
    const result = await textGrepHandler({ path, pattern: '/C:\\\\Users\\\\alice/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['count']).toBe(1);
    expectNoHint(result);
  });

  // ── 失败响应不受影响 ──

  it('EINVAL 失败响应不携带 hint 字段（hint 仅属成功契约增量）', async () => {
    const path = await createFile('content\n');
    const result = await textGrepHandler({ path, pattern: '/foo/q' });
    expect(isFail(result)).toBe(true);
    expect(result).not.toHaveProperty('hint');
  });
});

// ─── text_head ──────────────────────────────────────────

describe('text_head', () => {
  it('默认取头 10 行', async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textHeadHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const head = result['lines'] as string[];
      expect(head).toHaveLength(10);
      expect(head[0]).toBe('line1');
      expect(head[9]).toBe('line10');
      expect(result['total']).toBe(15);
    }
  });

  it('指定 lines 参数', async () => {
    const path = await createFile('a\nb\nc\nd\ne\n');
    const result = await textHeadHandler({ path, lines: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b']);
      expect(result['total']).toBe(5);
    }
  });

  it('lines 超过文件行数返回全部', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textHeadHandler({ path, lines: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b', 'c']);
      expect(result['total']).toBe(3);
    }
  });

  it('空文件返回空数组', async () => {
    const path = await createFile('');
    const result = await textHeadHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(0);
    }
  });

  it('lines 为 0 返回空数组', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textHeadHandler({ path, lines: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(3);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textHeadHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_tail ──────────────────────────────────────────

describe('text_tail', () => {
  it('默认取尾 10 行', async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textTailHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const tail = result['lines'] as string[];
      expect(tail).toHaveLength(10);
      expect(tail[0]).toBe('line6');
      expect(tail[9]).toBe('line15');
      expect(result['total']).toBe(15);
    }
  });

  it('指定 lines 参数', async () => {
    const path = await createFile('a\nb\nc\nd\ne\n');
    const result = await textTailHandler({ path, lines: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['d', 'e']);
      expect(result['total']).toBe(5);
    }
  });

  it('lines 超过文件行数返回全部', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textTailHandler({ path, lines: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b', 'c']);
      expect(result['total']).toBe(3);
    }
  });

  it('空文件返回空数组', async () => {
    const path = await createFile('');
    const result = await textTailHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(0);
    }
  });

  it('lines 为 0 返回空数组', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textTailHandler({ path, lines: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(3);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textTailHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_wc ────────────────────────────────────────────

describe('text_wc', () => {
  it('正常文件统计', async () => {
    const path = await createFile('hello world\nfoo bar baz\n');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(2);
      expect(result['words']).toBe(5);
      expect(result['chars']).toBe('hello world\nfoo bar baz\n'.length);
      expect(result['bytes']).toBe(Buffer.byteLength('hello world\nfoo bar baz\n', 'utf8'));
    }
  });

  it('空文件全 0', async () => {
    const path = await createFile('');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(0);
      expect(result['words']).toBe(0);
      expect(result['chars']).toBe(0);
      expect(result['bytes']).toBe(0);
    }
  });

  it('多空行', async () => {
    const content = 'a\n\n\nb\n';
    const path = await createFile(content);
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(4); // a, '', '', b
      expect(result['words']).toBe(2); // a, b
      expect(result['chars']).toBe(content.length);
      expect(result['bytes']).toBe(Buffer.byteLength(content, 'utf8'));
    }
  });

  it('无末尾换行', async () => {
    const path = await createFile('one two');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(1);
      expect(result['words']).toBe(2);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textWcHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_diff ──────────────────────────────────────────

describe('text_diff', () => {
  it('相同文件 same=true 且 diff 为空', async () => {
    const a = await createFile('line1\nline2\nline3\n');
    const b = await createFile('line1\nline2\nline3\n');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(true);
      expect(result['diff']).toBe('');
      expect(result['truncated']).toBe(false);
    }
  });

  it('不同文件 same=false 且 diff 非空', async () => {
    const a = await createFile('line1\nline2\nline3\n');
    const b = await createFile('line1\nCHANGED\nline3\n');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(false);
      const diff = result['diff'] as string;
      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-line2');
      expect(diff).toContain('+CHANGED');
    }
  });

  it('context 控制上下文行数', async () => {
    const aContent = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n';
    const bContent = 'l1\nl2\nl3\nCHANGED\nl5\nl6\nl7\n';
    const a = await createFile(aContent);
    const b = await createFile(bContent);
    // context=0：只显示变更行
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      expect(diff).toContain('-l4');
      expect(diff).toContain('+CHANGED');
      // context=0 不应包含 l3、l5
      expect(diff).not.toContain(' l3');
      expect(diff).not.toContain(' l5');
    }
  });

  it('context=2 包含周围行', async () => {
    const aContent = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n';
    const bContent = 'l1\nl2\nl3\nCHANGED\nl5\nl6\nl7\n';
    const a = await createFile(aContent);
    const b = await createFile(bContent);
    const result = await textDiffHandler({ a, b, context: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      expect(diff).toContain(' l2');
      expect(diff).toContain(' l3');
      expect(diff).toContain('-l4');
      expect(diff).toContain('+CHANGED');
      expect(diff).toContain(' l5');
      expect(diff).toContain(' l6');
    }
  });

  it('文件 A 不存在返回 ENOENT', async () => {
    const b = await createFile('hello\n');
    const result = await textDiffHandler({ a: join(tmpDir, 'no.txt'), b });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('文件 B 不存在返回 ENOENT', async () => {
    const a = await createFile('hello\n');
    const result = await textDiffHandler({ a, b: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('两个空文件 same=true', async () => {
    const a = await createFile('');
    const b = await createFile('');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(true);
      expect(result['diff']).toBe('');
    }
  });

  it('真行级 diff：在开头插入一行，其余行不被误报为变更', async () => {
    // 朴素逐行对比会把 b 的所有行都标记为 del+add；LCS 应只产生 1 个 add
    const a = await createFile('l1\nl2\nl3\nl4\nl5\n');
    const b = await createFile('INSERTED\nl1\nl2\nl3\nl4\nl5\n');
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      // 应只有 1 个 - 行（无删除）和 1 个 + 行（插入）
      const delLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
      const addLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      expect(delLines).toHaveLength(0);
      expect(addLines).toEqual(['+INSERTED']);
    }
  });

  it('真行级 diff：中间修改一行，前后行保持 eq', async () => {
    const a = await createFile('a\nb\nc\nd\ne\n');
    const b = await createFile('a\nb\nCHANGED\nd\ne\n');
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      const delLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
      const addLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      expect(delLines).toEqual(['-c']);
      expect(addLines).toEqual(['+CHANGED']);
    }
  });
});

// ─── text_replace ───────────────────────────────────────

describe('text_replace', () => {
  it('inputSchema 接受可选的 all 与 maxReplace 参数', () => {
    const base = { path: 'a.txt', pattern: 'x', replacement: 'y' };
    expect(textReplaceInputSchema.safeParse(base).success).toBe(true);
    expect(textReplaceInputSchema.safeParse({ ...base, all: true }).success).toBe(true);
    expect(textReplaceInputSchema.safeParse({ ...base, all: false }).success).toBe(true);
    expect(textReplaceInputSchema.safeParse({ ...base, maxReplace: 2 }).success).toBe(true);
  });

  it('inputSchema 拒绝非法形态：非布尔 all、非正整数 maxReplace', () => {
    const base = { path: 'a.txt', pattern: 'x', replacement: 'y' };
    expect(textReplaceInputSchema.safeParse({ ...base, all: 'yes' }).success).toBe(false);
    expect(textReplaceInputSchema.safeParse({ ...base, maxReplace: 0 }).success).toBe(false);
    expect(textReplaceInputSchema.safeParse({ ...base, maxReplace: -1 }).success).toBe(false);
  });

  it('恰 1 命中：字面量自动替换并回显位置与上下文片段', async () => {
    const path = await createFile('first line\nhit the target here\nthird line\n');
    const result = await textReplaceHandler({ path, pattern: 'target', replacement: 'goal' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['totalMatches']).toBe(1);
      expect(result['truncated']).toBe(false);
      expect(result['written']).toBe(false);
      expect(result['patternMode']).toBe('literal');
      expect(result['position']).toEqual({ line: 2, col: 9 });
      expect(result['context']).toBe('hit the goal here');
      expect(result['content']).toBe('first line\nhit the goal here\nthird line\n');
    }
    // 未请求写回，磁盘内容不变
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('first line\nhit the target here\nthird line\n');
  });

  it('0 命中：EINVAL 报错并附通用提示（不再静默成功）', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({ path, pattern: 'xyz', replacement: 'abc' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('0 命中');
      expect(result.error.message).toContain('拼写');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello world\n');
  });

  it('0 命中且 pattern 含正则元字符：提示改用 /…/ 包裹', async () => {
    const path = await createFile('plain text only\n');
    const result = await textReplaceHandler({ path, pattern: 'a|b', replacement: '-' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('元字符');
      expect(result.error.message).toContain('按【字面量】');
      expect(result.error.message).toContain('/a|b/');
    }
  });

  it('正则模式 0 命中且呈反斜杠路径样：提示去掉 /…/ 改字面量', async () => {
    const path = await createFile('plain text only\n');
    // 运行时 pattern 为 /^C:\\/ ：结构合法的正则（体含反斜杠路径样式）
    const result = await textReplaceHandler({ path, pattern: '/^C:\\\\/', replacement: 'X' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('转义');
      expect(result.error.message).toContain('【字面量】');
    }
  });

  it('多于 1 命中且未表态：拒绝执行并列出命中总数与各位置清单', async () => {
    const path = await createFile('foo and foo\nfoo tail\n');
    const result = await textReplaceHandler({ path, pattern: 'foo', replacement: 'x' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('3 处命中');
      expect(result.error.message).toContain('all:true');
      expect(result.error.message).toContain('maxReplace');
      expect(result.error.message).toContain('1:1');
      expect(result.error.message).toContain('1:9');
      expect(result.error.message).toContain('2:1');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('foo and foo\nfoo tail\n');
  });

  it('多命中拒绝的分支判定对 write=true 一致生效且不写文件', async () => {
    const path = await createFile('p p\n');
    const result = await textReplaceHandler({ path, pattern: 'p', replacement: 'q', write: true });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('p p\n');
  });

  it('字面量模式：含反斜杠的 Windows 路径直接替换、免双重转义', async () => {
    const path = await createFile('src = C:\\\\Users\\\\alice\\\\docs\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'C:\\\\Users\\\\alice',
      replacement: 'D:\\\\backup',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['replaced']).toBe(1);
      expect(result['content']).toBe('src = D:\\\\backup\\\\docs\n');
    }
  });

  it('字面量模式：回引用记号 $1/$&/$$ 原样插入、不触发组替换', async () => {
    const path = await createFile('a x b\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'x',
      replacement: '[$1 &$& $$]',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['content']).toBe('a [$1 &$& $$] b\n');
    }
  });

  it('正则模式：$1 回引用行为不回归', async () => {
    const path = await createFile('hello123world\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/(\\d+)/',
      replacement: '[$1]',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['replaced']).toBe(1);
      expect(result['content']).toBe('hello[123]world\n');
    }
  });

  it('正则模式：多组回引用 $1 $2 配合 all 全量替换', async () => {
    const path = await createFile('a=1, b=2\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/(\\w)=(\\d)/',
      replacement: '$2=$1',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['content']).toBe('1=a, 2=b\n');
      expect(result['replaced']).toBe(2);
    }
  });

  it('正则模式：$& 整匹配回引用与 $$ 字面美元符不回归', async () => {
    // $& 展开为本次命中的整个子串（两处各为 oo），$$ 收敛为字面 $
    const path = await createFile('foo boo\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/o+/',
      replacement: '<$&>$$',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['replaced']).toBe(2);
      expect(result['content']).toBe('f<oo>$ b<oo>$\n');
    }
  });

  it('正则 0 命中且非路径样 → 兜底文案指向核对正则并用 text_grep 验证', async () => {
    const path = await createFile('plain text only\n');
    const result = await textReplaceHandler({ path, pattern: '/zzz\\d+/', replacement: 'X' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('0 命中');
      expect(result.error.message).toContain('请核对该正则是否确能与目标文本匹配');
      expect(result.error.message).toContain('text_grep');
    }
  });

  it('all:true 放行多命中全量替换', async () => {
    const path = await createFile('hello world\nfoo world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(2);
      expect(result['totalMatches']).toBe(2);
      expect(result['written']).toBe(false);
      expect(result['patternMode']).toBe('literal');
      expect(result['content']).toBe('hello earth\nfoo earth\n');
    }
  });

  it('maxReplace:N 限量放行多命中并回报 totalMatches', async () => {
    const path = await createFile('a1b2c3\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/\\d/',
      replacement: 'X',
      maxReplace: 2,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(2);
      expect(result['totalMatches']).toBe(3);
      expect(result['content']).toBe('aXbXc3\n');
    }
  });

  it('all 与 maxReplace 同时提供时 all 优先', async () => {
    const path = await createFile('a b a b a\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'a',
      replacement: 'Z',
      all: true,
      maxReplace: 1,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(3);
      expect(result['content']).toBe('Z b Z b Z\n');
    }
  });

  it('正则尾部 g 标志等价显式全量表态（ADR-0013：g=全量语义开关）', async () => {
    const path = await createFile('o o o o\n');
    const result = await textReplaceHandler({ path, pattern: '/o/g', replacement: '0' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['replaced']).toBe(4);
      expect(result['content']).toBe('0 0 0 0\n');
    }
  });

  it('g 标志与 maxReplace 同供时 g（全量语义）优先', async () => {
    const path = await createFile('o o\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/o/g',
      replacement: '0',
      maxReplace: 1,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(2);
      expect(result['content']).toBe('0 0\n');
    }
  });

  // 双模判定表（replace 视角）：严格判定规则经 handler 外部行为断言。
  // 判定契约与 text_grep 共用同一解析器（src/utils/pattern.ts）；
  // replace 场景合法 flags 为 i/m/s/g（错误消息列明 imsg）。
  interface ReplaceRow {
    name: string;
    pattern: string;
    content: string;
    replacement: string;
    extra?: { all?: boolean };
    kind: 'ok' | 'einval';
    mode?: 'literal' | 'regex';
    expectedContent?: string;
    errContains?: string[];
  }
  const rows: ReplaceRow[] = [
    {
      name: '判定表：末段非字母归字面量 —— /api/v1/',
      pattern: '/api/v1/',
      content: 'see /api/v1/users now\n',
      replacement: 'API',
      kind: 'ok',
      mode: 'literal',
      expectedContent: 'see APIusers now\n',
    },
    {
      // 移交清单点名形态：三斜杠 /a/b/，收尾定界符后末段 'b/' 含非字母 → 结构歧义归字面量
      name: '判定表：三斜杠路径归字面量 —— /a/b/',
      pattern: '/a/b/',
      content: 'call /a/b/ now\n',
      replacement: 'R',
      kind: 'ok',
      mode: 'literal',
      expectedContent: 'call R now\n',
    },
    {
      name: '判定表：空体归字面量 —— // 只替换字面双斜杠',
      pattern: '//',
      content: '// comment\n',
      replacement: '#',
      kind: 'ok',
      mode: 'literal',
      expectedContent: '# comment\n',
    },
    {
      name: '判定表：无收尾定界符归字面量 —— /usr',
      pattern: '/usr',
      content: 'cd /usr/local\n',
      replacement: 'USR',
      kind: 'ok',
      mode: 'literal',
      expectedContent: 'cd USR/local\n',
    },
    {
      name: '判定表：纯元字符未包裹归字面量 —— \\d{3} 原样匹配',
      pattern: '\\d{3}',
      content: 'regex \\d{3} sample\n',
      replacement: 'NUM',
      kind: 'ok',
      mode: 'literal',
      expectedContent: 'regex NUM sample\n',
    },
    {
      name: '判定表：合法正则 —— /\\d{3}/',
      pattern: '/\\d{3}/',
      content: 'id x123y\n',
      replacement: 'N',
      kind: 'ok',
      mode: 'regex',
      expectedContent: 'id xNy\n',
    },
    {
      name: '判定表：体内斜杠转义 —— /a\\/b/ 命中 a/b 文本',
      pattern: '/a\\/b/',
      content: 'x a/b y\n',
      replacement: 'Z',
      kind: 'ok',
      mode: 'regex',
      expectedContent: 'x Z y\n',
    },
    {
      name: '判定表：合法 flags i —— /foo/i 忽略大小写',
      pattern: '/foo/i',
      content: 'Foo FOO\n',
      replacement: 'qq',
      extra: { all: true },
      kind: 'ok',
      mode: 'regex',
      expectedContent: 'qq qq\n',
    },
    {
      name: '判定表：残余洞（文档化行为）—— /tmp/ 被判为正则',
      pattern: '/tmp/',
      content: 'the tmp value\n',
      replacement: 'T',
      kind: 'ok',
      mode: 'regex',
      expectedContent: 'the T value\n',
    },
    {
      // 终版裁定（三级分类，与 text_grep 判定表同口径）：多字母尾段、不含全量标志 g
      // → 判为词组而非 flag 手误，安全收敛字面量；单字母手误（/foo/q）才 EINVAL。
      name: '判定表：多字母词组归字面量 —— /usr/bin 整串按字面替换',
      pattern: '/usr/bin',
      content: 'cd /usr/bin\n',
      replacement: 'X',
      kind: 'ok',
      mode: 'literal',
      expectedContent: 'cd X\n',
    },
    {
      name: '判定表：单字母非法 flag —— /foo/q EINVAL',
      pattern: '/foo/q',
      content: 'foo\n',
      replacement: 'X',
      kind: 'einval',
      errContains: ['非法 flags "q"', '合法标志为 imsg'],
    },
  ];
  for (const row of rows) {
    it(row.name, async () => {
      const path = await createFile(row.content);
      const result = await textReplaceHandler({
        path,
        pattern: row.pattern,
        replacement: row.replacement,
        ...(row.extra ?? {}),
      });
      if (row.kind === 'einval') {
        expect(isFail(result)).toBe(true);
        if (isFail(result)) {
          expect(result.error.code).toBe('EINVAL');
          for (const frag of row.errContains ?? []) {
            expect(result.error.message).toContain(frag);
          }
        }
        return;
      }
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['patternMode']).toBe(row.mode);
        expect(result['content']).toBe(row.expectedContent);
      }
    });
  }

  it('零长度匹配不死循环：/x*/ 多命中未表态拒绝', async () => {
    const path = await createFile('ab\n');
    const result = await textReplaceHandler({ path, pattern: '/x*/', replacement: '>' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('多命中拒绝消息含比例阈值路径的 ③ 兜底（小文件占比超阈、绝对数未达 200）', async () => {
    // 30 行中 25 行含 tmp：占比 ≈83% ≥50% 且总行数 ≥20 下限，但绝对数 25 < 200 绝对阈值
    // —— 判据必须走与搜索侧共享的比例路径，否则小文件多命中漏掉「疑似被当正则」提示
    const lines = Array.from({ length: 30 }, (_, i) =>
      i < 25 ? `the tmp value ${i + 1}` : `plain line ${i + 1}`,
    );
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textReplaceHandler({ path, pattern: '/tmp/', replacement: 'T' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('发现 25 处命中');
      expect(result.error.message).toContain('疑似');
    }
  });

  it('显式表态放行的成功路径附 ③ 兜底 hint（/tmp/ 类残余洞大面积替换）', async () => {
    // spec 二审发现：拒绝路径有 ③ 提示、放行成功路径反而没有——哑错误在成功侧复活。
    // 300 行命中 + all:true 放行 → ok:true 且 hint 指出疑似被当作正则
    const lines = Array.from({ length: 300 }, (_, i) => `under tmp dir ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/tmp/',
      replacement: 'T',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(300);
      expect(result['patternMode']).toBe('regex');
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('疑似');
      expect(hint).toContain('【字面量】');
    }
  });

  it('尾部 g 等价全量表态：放行成功路径同样附 ③ 兜底 hint', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `tmp token ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textReplaceHandler({ path, pattern: '/tmp/g', replacement: 'X' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(250);
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('疑似');
    }
  });

  it('③ 不触发不占位：表态放行但命中数未达异常判据（成功响应无 hint 键）', async () => {
    const path = await createFile('a tmp b\nc tmp d\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/tmp/',
      replacement: 'T',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result['replaced']).toBe(2);
    expect(result).not.toHaveProperty('hint');
  });

  it('maxReplace 放行同样触发 ③ 兜底 hint（限量替换不豁免残余洞提示）', async () => {
    // 判据吃预扫描总命中数而非实际替换数：maxReplace:5 只换 5 处，但 total=300 异常偏多仍须提示
    const lines = Array.from({ length: 300 }, (_, i) => `under tmp dir ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textReplaceHandler({
      path,
      pattern: '/tmp/',
      replacement: 'T',
      maxReplace: 5,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(5);
      expect(result['totalMatches']).toBe(300);
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('疑似');
    }
  });

  it('③ 模式门负例：普通字面量 pattern + all:true 命中再多也不占 hint 键', async () => {
    // 字面量命中异常偏多是调用方本意，方向仅针对「被误判为正则」——patternMode 门生效
    const lines = Array.from({ length: 300 }, (_, i) => `under tmp dir ${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textReplaceHandler({ path, pattern: 'tmp', replacement: 'T', all: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(300);
      expect(result['patternMode']).toBe('literal');
    }
    expect(result).not.toHaveProperty('hint');
  });

  it('零长度匹配配合 all:true 有界完成', async () => {
    const path = await createFile('ab\n');
    const result = await textReplaceHandler({ path, pattern: '/x*/', replacement: '>', all: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(4);
      expect(result['content']).toBe('>a>b>\n>');
    }
  });

  it('write=true 且恰 1 命中：写回成功并附 patternMode', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['written']).toBe(true);
      expect(result['patternMode']).toBe('literal');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello earth\n');
  });

  it('write=false 不写回', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: false,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(false);
      expect(result['patternMode']).toBe('literal');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello world\n');
  });

  it('0 命中时 write=true 同样报错且不写文件', async () => {
    const path = await createFile('hello\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'xyz',
      replacement: 'abc',
      write: true,
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello\n');
  });

  it('空文件 0 命中报错', async () => {
    const path = await createFile('');
    const result = await textReplaceHandler({ path, pattern: 'foo', replacement: 'bar' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('0 命中');
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textReplaceHandler({
      path: join(tmpDir, 'no.txt'),
      pattern: 'foo',
      replacement: 'bar',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('write=true 写回 GBK 文件保持 GBK 编码（不静默改写为 UTF-8）', async () => {
    // 构造 GBK 文件：含中文，用 iconv-lite 编码为 GBK 字节
    const gbkPath = join(tmpDir, `gbk-${++fileCounter}.txt`);
    const original = '你好 world\n';
    await writeFile(gbkPath, iconvEncode(original, 'gbk'));

    // 替换 ASCII 部分（恰 1 命中，自动执行），写回
    const result = await textReplaceHandler({
      path: gbkPath,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['written']).toBe(true);
      expect(result['patternMode']).toBe('literal');
    }

    // 验证写回后仍是 GBK 编码
    const buf = await readFile(gbkPath);
    expect(isLikelyGBK(buf)).toBe(true);
    // 用 GBK 解码应得到预期内容
    const decoded = iconvDecode(buf, 'gbk');
    expect(decoded).toBe('你好 earth\n');
  });

  it('write=true 写回 UTF-8 文件保持 UTF-8 编码', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(true);
    }
    const buf = await readFile(path);
    expect(isLikelyGBK(buf)).toBe(false);
    expect(buf.toString('utf8')).toBe('hello earth\n');
  });
});

// ─── 边界：长行截断 ─────────────────────────────────────

describe('截断边界', () => {
  it('grep 长行文本被截断', async () => {
    const longLine = 'x'.repeat(3000);
    const path = await createFile(longLine + '\n');
    const result = await textGrepHandler({ path, pattern: 'x' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches[0]!.text.length).toBeLessThan(longLine.length);
      expect(matches[0]!.text).toContain('truncated');
    }
  });

  it('replace 长内容被截断', async () => {
    const longContent = 'a'.repeat(3000);
    const path = await createFile(longContent);
    const result = await textReplaceHandler({
      path,
      pattern: 'a',
      replacement: 'b',
      all: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const content = result['content'] as string;
      expect(content.length).toBeLessThan(longContent.length);
      expect(content).toContain('truncated');
    }
  });
});