import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  netPingHandler,
  netPingTool,
  netPingInputSchema,
} from '../../src/tools/net_ping.js';
import { isOk, isFail } from '../../src/contract/output.js';

// ===========================================================================
// 测试服务器：本地 TCP 服务器，避免依赖外部网络
// ===========================================================================

let server: net.Server;
let serverPort: number;

beforeAll(async () => {
  server = net.createServer(() => {
    // 接受连接并保持打开即可；net_ping 只关心 TCP 可达性
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/**
 * 获取一个未使用端口号（绑定后立即释放），用于不可达探测。
 */
async function getUnusedPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

// ===========================================================================
// net_ping 工具定义
// ===========================================================================

describe('netPingTool 定义', () => {
  it('名称为 ping', () => {
    expect(netPingTool.name).toBe('ping');
  });

  it('有描述', () => {
    expect(netPingTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof netPingInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof netPingTool.handler).toBe('function');
  });
});

// ===========================================================================
// net_ping 输入 schema 验证
// ===========================================================================

describe('netPingInputSchema 验证', () => {
  it('host 必填', () => {
    const parsed = netPingInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('合法输入通过（仅 host）', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1' });
    expect(parsed.success).toBe(true);
  });

  it('host 非字符串非法', () => {
    const parsed = netPingInputSchema.safeParse({ host: 123 });
    expect(parsed.success).toBe(false);
  });

  it('count 非整数非法', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1', count: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it('count 大于 20 非法', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1', count: 21 });
    expect(parsed.success).toBe(false);
  });

  it('count 小于等于 0 非法', () => {
    const parsedZero = netPingInputSchema.safeParse({ host: '127.0.0.1', count: 0 });
    expect(parsedZero.success).toBe(false);
    const parsedNeg = netPingInputSchema.safeParse({ host: '127.0.0.1', count: -1 });
    expect(parsedNeg.success).toBe(false);
  });

  it('合法 count 通过', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1', count: 4 });
    expect(parsed.success).toBe(true);
  });

  it('port 越界非法', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1', port: 70000 });
    expect(parsed.success).toBe(false);
  });

  it('timeoutMs 非正整数非法', () => {
    const parsed = netPingInputSchema.safeParse({ host: '127.0.0.1', timeoutMs: 0 });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// net_ping handler 正常路径
// ===========================================================================

describe('netPingHandler 正常路径', () => {
  it('ping 本地已开端口 alive=true', async () => {
    const result = await netPingHandler({ host: '127.0.0.1', port: serverPort, count: 3 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['alive']).toBe(true);
      expect(result['received'] as number).toBeGreaterThan(0);
      expect(result['sent']).toBe(3);
    }
  });

  it('返回结果含所有字段', async () => {
    const result = await netPingHandler({ host: '127.0.0.1', port: serverPort, count: 2 });
    if (isOk(result)) {
      expect(result['host']).toBeDefined();
      expect(result['sent']).toBeDefined();
      expect(result['received']).toBeDefined();
      expect(result['loss']).toBeDefined();
      expect(result['min']).toBeDefined();
      expect(result['max']).toBeDefined();
      expect(result['avg']).toBeDefined();
      expect(result['alive']).toBeDefined();
    }
  });

  it('host 字段等于入参', async () => {
    const result = await netPingHandler({ host: '127.0.0.1', port: serverPort, count: 2 });
    if (isOk(result)) {
      expect(result['host']).toBe('127.0.0.1');
    }
  });
});

// ===========================================================================
// net_ping handler 不可达 / 失败路径
// ===========================================================================

describe('netPingHandler 不可达与失败路径', () => {
  it('ping 本地未开端口返回 ok 且 alive=false', async () => {
    const unusedPort = await getUnusedPort();
    const result = await netPingHandler({ host: '127.0.0.1', port: unusedPort, count: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['alive']).toBe(false);
      expect(result['received']).toBe(0);
      expect(result['loss']).toBe(1);
      expect(result['min']).toBe(0);
      expect(result['max']).toBe(0);
      expect(result['avg']).toBe(0);
    }
  });

  it('非法 host（空字符串）返回 EINVAL', async () => {
    const result = await netPingHandler({ host: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 host（非字符串）返回 EINVAL', async () => {
    const result = await netPingHandler({ host: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});