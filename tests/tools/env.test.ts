import { describe, it, expect, afterAll } from 'vitest';
import {
  envGetHandler,
  envGetTool,
  envGetInputSchema,
  envSetHandler,
  envSetTool,
  envSetInputSchema,
  envUnsetHandler,
  envUnsetTool,
  envUnsetInputSchema,
} from '../../src/tools/env.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** 测试用唯一变量名前缀，避免与其他测试冲突。 */
const VAR_PREFIX = 'WSM_ENV_TEST_';

/** 收集测试中创建的变量，测试后清理。 */
const createdVars: string[] = [];

afterAll(() => {
  for (const name of createdVars) {
    delete process.env[name];
  }
});

// ===================== 工具定义 =====================

describe('env 工具定义', () => {
  it('env_get 名称为 env_get', () => {
    expect(envGetTool.name).toBe('env_get');
  });

  it('env_set 名称为 env_set', () => {
    expect(envSetTool.name).toBe('env_set');
  });

  it('env_unset 名称为 env_unset', () => {
    expect(envUnsetTool.name).toBe('env_unset');
  });

  it('所有工具有描述', () => {
    expect(envGetTool.description.length).toBeGreaterThan(0);
    expect(envSetTool.description.length).toBeGreaterThan(0);
    expect(envUnsetTool.description.length).toBeGreaterThan(0);
  });

  it('所有 inputSchema 是 zod schema', () => {
    expect(typeof envGetInputSchema.safeParse).toBe('function');
    expect(typeof envSetInputSchema.safeParse).toBe('function');
    expect(typeof envUnsetInputSchema.safeParse).toBe('function');
  });

  it('所有 handler 是函数', () => {
    expect(typeof envGetTool.handler).toBe('function');
    expect(typeof envSetTool.handler).toBe('function');
    expect(typeof envUnsetTool.handler).toBe('function');
  });
});

// ===================== env_get =====================

describe('envGetInputSchema 验证', () => {
  it('空对象合法（name 可选）', () => {
    const parsed = envGetInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('name 字符串合法', () => {
    const parsed = envGetInputSchema.safeParse({ name: 'PATH' });
    expect(parsed.success).toBe(true);
  });

  it('name 非字符串非法', () => {
    const parsed = envGetInputSchema.safeParse({ name: 123 });
    expect(parsed.success).toBe(false);
  });
});

describe('envGetHandler 读取单个变量', () => {
  it('已知变量返回 {name, value}', async () => {
    // PATH 几乎总是存在
    const name = process.platform === 'win32' ? 'PATH' : 'PATH';
    const result = await envGetHandler({ name });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['name']).toBe(name);
      expect(result['value']).toBeDefined();
      expect(typeof result['value']).toBe('string');
    }
  });

  it('不存在的变量返回 value=null', async () => {
    const name = `${VAR_PREFIX}NONEXISTENT_${Date.now()}`;
    const result = await envGetHandler({ name });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['name']).toBe(name);
      expect(result['value']).toBeNull();
    }
  });

  it('返回结构只含 name 与 value', async () => {
    const result = await envGetHandler({ name: 'PATH' });
    if (isOk(result)) {
      expect(result['name']).toBeDefined();
      expect(result['value']).toBeDefined();
      expect(result['vars']).toBeUndefined();
      expect(result['count']).toBeUndefined();
    }
  });
});

describe('envGetHandler 读取全部变量', () => {
  it('省略 name 返回 {vars, count}', async () => {
    const result = await envGetHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['vars']).toBeDefined();
      expect(result['count']).toBeDefined();
      expect(typeof result['count']).toBe('number');
      expect(result['vars']).toBeInstanceOf(Object);
    }
  });

  it('count 等于 vars 键数', async () => {
    const result = await envGetHandler({});
    if (isOk(result)) {
      const vars = result['vars'] as Record<string, string>;
      const count = result['count'] as number;
      expect(count).toBe(Object.keys(vars).length);
    }
  });

  it('vars 含 PATH 条目', async () => {
    const result = await envGetHandler({});
    if (isOk(result)) {
      const vars = result['vars'] as Record<string, string>;
      // Windows 大小写不敏感，PATH 或 Path
      const hasPath = 'PATH' in vars || 'Path' in vars;
      expect(hasPath).toBe(true);
    }
  });

  it('vars 所有值为字符串', async () => {
    const result = await envGetHandler({});
    if (isOk(result)) {
      const vars = result['vars'] as Record<string, string>;
      for (const val of Object.values(vars)) {
        expect(typeof val).toBe('string');
      }
    }
  });

  it('filter 按变量名过滤（大小写不敏感）', async () => {
    // 用一个肯定存在的变量名片段过滤；PATH 在所有平台都存在
    const result = await envGetHandler({ filter: 'path' });
    if (isOk(result)) {
      const vars = result['vars'] as Record<string, string>;
      const keys = Object.keys(vars);
      // 过滤后所有键应含 PATH（大小写不敏感）
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(k.toLowerCase()).toContain('path');
      }
    }
  });

  it('filter 不匹配时返回空 vars', async () => {
    const result = await envGetHandler({ filter: 'ZZZ_NOT_EXIST_VAR_ZZZ' });
    if (isOk(result)) {
      const vars = result['vars'] as Record<string, string>;
      expect(Object.keys(vars)).toHaveLength(0);
      expect(result['count']).toBe(0);
    }
  });

  it('maxLen 截断每个变量值', async () => {
    // 设一个超长值的环境变量
    process.env['WSMCP_TEST_LONG'] = 'x'.repeat(100);
    try {
      const result = await envGetHandler({ filter: 'WSMCP_TEST_LONG', maxLen: 10 });
      if (isOk(result)) {
        const vars = result['vars'] as Record<string, string>;
        const val = vars['WSMCP_TEST_LONG']!;
        expect(val.length).toBeLessThan(100);
        expect(val).toContain('truncated');
        expect(val.startsWith('xxxxxxxxxx')).toBe(true);
      }
    } finally {
      delete process.env['WSMCP_TEST_LONG'];
    }
  });

  it('name 指定时 filter 与 maxLen 不生效', async () => {
    process.env['WSMCP_TEST_NAME'] = 'value';
    try {
      const result = await envGetHandler({
        name: 'WSMCP_TEST_NAME',
        filter: 'nope',
        maxLen: 1,
      });
      if (isOk(result)) {
        expect(result['value']).toBe('value');
      }
    } finally {
      delete process.env['WSMCP_TEST_NAME'];
    }
  });
});

// ===================== env_set =====================

describe('envSetInputSchema 验证', () => {
  it('name+value 合法', () => {
    const parsed = envSetInputSchema.safeParse({ name: 'FOO', value: 'bar' });
    expect(parsed.success).toBe(true);
  });

  it('name 空字符串非法', () => {
    const parsed = envSetInputSchema.safeParse({ name: '', value: 'bar' });
    expect(parsed.success).toBe(false);
  });

  it('缺失 name 非法', () => {
    const parsed = envSetInputSchema.safeParse({ value: 'bar' });
    expect(parsed.success).toBe(false);
  });

  it('缺失 value 非法', () => {
    const parsed = envSetInputSchema.safeParse({ name: 'FOO' });
    expect(parsed.success).toBe(false);
  });
});

describe('envSetHandler 设置变量', () => {
  it('设置后返回 {set: true, name}', async () => {
    const name = `${VAR_PREFIX}SET_1`;
    createdVars.push(name);
    const result = await envSetHandler({ name, value: 'value-1' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['set']).toBe(true);
      expect(result['name']).toBe(name);
    }
  });

  it('设置后 env_get 能读到', async () => {
    const name = `${VAR_PREFIX}SET_2`;
    createdVars.push(name);
    await envSetHandler({ name, value: 'readable-value' });
    const getResult = await envGetHandler({ name });
    if (isOk(getResult)) {
      expect(getResult['value']).toBe('readable-value');
    }
  });

  it('覆盖已有变量值', async () => {
    const name = `${VAR_PREFIX}SET_3`;
    createdVars.push(name);
    await envSetHandler({ name, value: 'first' });
    await envSetHandler({ name, value: 'second' });
    const getResult = await envGetHandler({ name });
    if (isOk(getResult)) {
      expect(getResult['value']).toBe('second');
    }
  });

  it('空 value 合法（设为空串）', async () => {
    const name = `${VAR_PREFIX}SET_EMPTY`;
    createdVars.push(name);
    const result = await envSetHandler({ name, value: '' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const getResult = await envGetHandler({ name });
      if (isOk(getResult)) {
        expect(getResult['value']).toBe('');
      }
    }
  });
});

describe('envSetHandler 错误路径', () => {
  it('空 name 返回 EINVAL', async () => {
    const result = await envSetHandler({ name: '', value: 'x' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('name 非字符串返回 EINVAL', async () => {
    const result = await envSetHandler({ name: 123, value: 'x' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('value 非字符串返回 EINVAL', async () => {
    const result = await envSetHandler({ name: 'FOO', value: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ===================== env_unset =====================

describe('envUnsetInputSchema 验证', () => {
  it('name 合法', () => {
    const parsed = envUnsetInputSchema.safeParse({ name: 'FOO' });
    expect(parsed.success).toBe(true);
  });

  it('name 空字符串非法', () => {
    const parsed = envUnsetInputSchema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
  });
});

describe('envUnsetHandler 删除变量', () => {
  it('删除已存在变量返回 {unset: true, name}', async () => {
    const name = `${VAR_PREFIX}UNSET_1`;
    process.env[name] = 'to-be-deleted';
    const result = await envUnsetHandler({ name });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['unset']).toBe(true);
      expect(result['name']).toBe(name);
    }
  });

  it('删除后 env_get 返回 null', async () => {
    const name = `${VAR_PREFIX}UNSET_2`;
    process.env[name] = 'temp';
    await envUnsetHandler({ name });
    const getResult = await envGetHandler({ name });
    if (isOk(getResult)) {
      expect(getResult['value']).toBeNull();
    }
  });

  it('删除不存在的变量也返回成功', async () => {
    const name = `${VAR_PREFIX}UNSET_NONEXIST_${Date.now()}`;
    delete process.env[name];
    const result = await envUnsetHandler({ name });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['unset']).toBe(true);
    }
  });
});

describe('envUnsetHandler 错误路径', () => {
  it('空 name 返回 EINVAL', async () => {
    const result = await envUnsetHandler({ name: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('name 非字符串返回 EINVAL', async () => {
    const result = await envUnsetHandler({ name: null });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ===================== 设置后对后续生效 =====================

describe('设置后对后续会话生效', () => {
  it('env_set 后续 env_get 能读到同一值', async () => {
    const name = `${VAR_PREFIX}PERSIST_1`;
    createdVars.push(name);
    await envSetHandler({ name, value: 'persistent-value' });

    // 多次读取应一致
    const r1 = await envGetHandler({ name });
    const r2 = await envGetHandler({ name });
    if (isOk(r1) && isOk(r2)) {
      expect(r1['value']).toBe('persistent-value');
      expect(r2['value']).toBe('persistent-value');
    }
  });

  it('env_set 后 env_unset 再 env_get 返回 null', async () => {
    const name = `${VAR_PREFIX}PERSIST_2`;
    await envSetHandler({ name, value: 'temp' });
    await envUnsetHandler({ name });
    const getResult = await envGetHandler({ name });
    if (isOk(getResult)) {
      expect(getResult['value']).toBeNull();
    }
  });

  it('env_set 后在全部变量列表中可见', async () => {
    const name = `${VAR_PREFIX}PERSIST_3`;
    createdVars.push(name);
    await envSetHandler({ name, value: 'in-list' });
    const allResult = await envGetHandler({});
    if (isOk(allResult)) {
      const vars = allResult['vars'] as Record<string, string>;
      expect(vars[name]).toBe('in-list');
    }
  });

  it('env_unset 后在全部变量列表中不可见', async () => {
    const name = `${VAR_PREFIX}PERSIST_4`;
    process.env[name] = 'will-remove';
    await envUnsetHandler({ name });
    const allResult = await envGetHandler({});
    if (isOk(allResult)) {
      const vars = allResult['vars'] as Record<string, string>;
      expect(vars[name]).toBeUndefined();
    }
  });
});