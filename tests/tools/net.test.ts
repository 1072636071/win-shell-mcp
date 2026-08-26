import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  netGetHandler,
  netGetTool,
  netGetInputSchema,
  netPostHandler,
  netPostTool,
  netPostInputSchema,
  netDnsHandler,
  netDnsTool,
  netDnsInputSchema,
  netTcpHandler,
  netTcpTool,
  netTcpInputSchema,
} from '../../src/tools/net.js';
import { isOk, isFail } from '../../src/contract/output.js';

// ===========================================================================
// 测试服务器：本地 HTTP 服务器，避免依赖外部网络
// ===========================================================================

let server: http.Server;
let serverPort: number;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // /json：返回 JSON 响应
    if (req.url === '/json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ hello: 'world' }));
      return;
    }
    // /slow：延迟 500ms 响应（用于超时测试）
    if (req.url === '/slow') {
      setTimeout(() => {
        res.end('slow response');
      }, 500);
      return;
    }
    // /text：返回纯文本
    if (req.url === '/text') {
      res.end('plain text response');
      return;
    }
    // POST：回显请求体
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        res.end(body);
      });
      return;
    }
    // 默认
    res.end('ok');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
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
 * 获取一个未使用的端口号（绑定后立即释放）。
 * 用于测试连接失败/未开端口场景。
 */
async function getUnusedPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

// ===========================================================================
// net_get 工具定义
// ===========================================================================

describe('netGetTool 定义', () => {
  it('名称为 net_get', () => {
    expect(netGetTool.name).toBe('net_get');
  });

  it('有描述', () => {
    expect(netGetTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof netGetInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof netGetTool.handler).toBe('function');
  });
});

describe('netGetInputSchema 验证', () => {
  it('合法输入通过', () => {
    const parsed = netGetInputSchema.safeParse({ url: 'http://example.com' });
    expect(parsed.success).toBe(true);
  });

  it('url 非字符串非法', () => {
    const parsed = netGetInputSchema.safeParse({ url: 123 });
    expect(parsed.success).toBe(false);
  });

  it('timeoutMs 非正整数非法', () => {
    const parsed = netGetInputSchema.safeParse({
      url: 'http://example.com',
      timeoutMs: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it('verbose 布尔值合法', () => {
    const parsed = netGetInputSchema.safeParse({
      url: 'http://example.com',
      verbose: true,
    });
    expect(parsed.success).toBe(true);
  });
});

// ===========================================================================
// net_get handler 正常路径
// ===========================================================================

describe('netGetHandler GET', () => {
  it('返回 status 与 body', async () => {
    const result = await netGetHandler({ url: `${baseUrl}/json` });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBe(JSON.stringify({ hello: 'world' }));
    }
  });

  it('GET 纯文本端点', async () => {
    const result = await netGetHandler({ url: `${baseUrl}/text` });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBe('plain text response');
    }
  });

  it('status 为数字', async () => {
    const result = await netGetHandler({ url: `${baseUrl}/json` });
    if (isOk(result)) {
      expect(typeof result['status']).toBe('number');
    }
  });

  it('body 为字符串', async () => {
    const result = await netGetHandler({ url: `${baseUrl}/json` });
    if (isOk(result)) {
      expect(typeof result['body']).toBe('string');
    }
  });
});

describe('netGetHandler verbose', () => {
  it('verbose 返回额外字段', async () => {
    const result = await netGetHandler({
      url: `${baseUrl}/json`,
      verbose: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBeDefined();
      expect(result['headers']).toBeDefined();
      expect(result['ok']).toBe(true);
      expect(typeof result['statusText']).toBe('string');
      expect(typeof result['duration']).toBe('number');
      expect(typeof result['truncated']).toBe('boolean');
    }
  });

  it('verbose 时 headers 是对象', async () => {
    const result = await netGetHandler({
      url: `${baseUrl}/json`,
      verbose: true,
    });
    if (isOk(result)) {
      expect(typeof result['headers']).toBe('object');
      expect(result['headers']).not.toBeNull();
    }
  });

  it('verbose 时 duration 非负', async () => {
    const result = await netGetHandler({
      url: `${baseUrl}/json`,
      verbose: true,
    });
    if (isOk(result)) {
      expect(result['duration'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('非 verbose 不含 verbose 专属字段，但含 truncated', async () => {
    const result = await netGetHandler({ url: `${baseUrl}/json` });
    if (isOk(result)) {
      // ok 是 OkResult 契约固有字段（始终为 true），非 verbose 专属
      expect(result['ok']).toBe(true);
      expect(typeof result['truncated']).toBe('boolean');
      expect(result['headers']).toBeUndefined();
      expect(result['statusText']).toBeUndefined();
      expect(result['duration']).toBeUndefined();
    }
  });
});

// ===========================================================================
// net_get handler 失败路径
// ===========================================================================

describe('netGetHandler 失败路径', () => {
  it('非法 URL 返回 INVALID_URL', async () => {
    const result = await netGetHandler({ url: 'not-a-url' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('INVALID_URL');
    }
  });

  it('空 URL 返回 INVALID_URL', async () => {
    const result = await netGetHandler({ url: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('INVALID_URL');
    }
  });

  it('超时返回 NET_TIMEOUT', async () => {
    const result = await netGetHandler({
      url: `${baseUrl}/slow`,
      timeoutMs: 100,
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('NET_TIMEOUT');
    }
  });

  it('连接失败（未开端口）返回 NET_FAIL', async () => {
    const unusedPort = await getUnusedPort();
    const result = await netGetHandler({
      url: `http://127.0.0.1:${unusedPort}`,
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('NET_FAIL');
    }
  });
});

// ===========================================================================
// net_post 工具定义
// ===========================================================================

describe('netPostTool 定义', () => {
  it('名称为 net_post', () => {
    expect(netPostTool.name).toBe('net_post');
  });

  it('有描述', () => {
    expect(netPostTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof netPostInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof netPostTool.handler).toBe('function');
  });
});

describe('netPostInputSchema 验证', () => {
  it('合法输入通过（仅 url）', () => {
    const parsed = netPostInputSchema.safeParse({ url: 'http://example.com' });
    expect(parsed.success).toBe(true);
  });

  it('url + body + json 合法', () => {
    const parsed = netPostInputSchema.safeParse({
      url: 'http://example.com',
      body: '{"key":"value"}',
      json: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('url 非字符串非法', () => {
    const parsed = netPostInputSchema.safeParse({ url: 123 });
    expect(parsed.success).toBe(false);
  });

  it('timeoutMs 非正整数非法', () => {
    const parsed = netPostInputSchema.safeParse({
      url: 'http://example.com',
      timeoutMs: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it('json 非布尔值非法', () => {
    const parsed = netPostInputSchema.safeParse({
      url: 'http://example.com',
      json: 'yes',
    });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// net_post handler 正常路径
// ===========================================================================

describe('netPostHandler POST', () => {
  it('POST 文本体回显', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: 'plain text body',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBe('plain text body');
    }
  });

  it('POST JSON 字符串体回显', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: JSON.stringify({ key: 'value' }),
      json: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBe(JSON.stringify({ key: 'value' }));
    }
  });

  it('POST 无 body', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBe('');
    }
  });

  it('status 为数字', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: 'x',
    });
    if (isOk(result)) {
      expect(typeof result['status']).toBe('number');
    }
  });

  it('body 为字符串', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: 'x',
    });
    if (isOk(result)) {
      expect(typeof result['body']).toBe('string');
    }
  });
});

describe('netPostHandler verbose', () => {
  it('verbose 返回额外字段', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: 'x',
      verbose: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['status']).toBe(200);
      expect(result['body']).toBeDefined();
      expect(result['headers']).toBeDefined();
      expect(result['ok']).toBe(true);
      expect(typeof result['statusText']).toBe('string');
      expect(typeof result['duration']).toBe('number');
      expect(typeof result['truncated']).toBe('boolean');
    }
  });

  it('非 verbose 不含 verbose 专属字段，但含 truncated', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/post`,
      body: 'x',
    });
    if (isOk(result)) {
      expect(result['ok']).toBe(true);
      expect(typeof result['truncated']).toBe('boolean');
      expect(result['headers']).toBeUndefined();
      expect(result['statusText']).toBeUndefined();
      expect(result['duration']).toBeUndefined();
    }
  });
});

// ===========================================================================
// net_post handler 失败路径
// ===========================================================================

describe('netPostHandler 失败路径', () => {
  it('非法 URL 返回 INVALID_URL', async () => {
    const result = await netPostHandler({ url: 'not-a-url' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('INVALID_URL');
    }
  });

  it('空 URL 返回 INVALID_URL', async () => {
    const result = await netPostHandler({ url: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('INVALID_URL');
    }
  });

  it('超时返回 NET_TIMEOUT', async () => {
    const result = await netPostHandler({
      url: `${baseUrl}/slow`,
      body: 'x',
      timeoutMs: 100,
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('NET_TIMEOUT');
    }
  });

  it('连接失败（未开端口）返回 NET_FAIL', async () => {
    const unusedPort = await getUnusedPort();
    const result = await netPostHandler({
      url: `http://127.0.0.1:${unusedPort}`,
      body: 'x',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('NET_FAIL');
    }
  });
});

// ===========================================================================
// net_dns 工具定义
// ===========================================================================

describe('netDnsTool 定义', () => {
  it('名称为 net_dns', () => {
    expect(netDnsTool.name).toBe('net_dns');
  });

  it('有描述', () => {
    expect(netDnsTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof netDnsInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof netDnsTool.handler).toBe('function');
  });
});

describe('netDnsInputSchema 验证', () => {
  it('仅 hostname 合法', () => {
    const parsed = netDnsInputSchema.safeParse({ hostname: 'example.com' });
    expect(parsed.success).toBe(true);
  });

  it('hostname + recordType 合法', () => {
    const parsed = netDnsInputSchema.safeParse({ hostname: 'example.com', recordType: 'AAAA' });
    expect(parsed.success).toBe(true);
  });

  it('hostname 非字符串非法', () => {
    const parsed = netDnsInputSchema.safeParse({ hostname: 123 });
    expect(parsed.success).toBe(false);
  });

  it('recordType 非枚举值非法', () => {
    const parsed = netDnsInputSchema.safeParse({ hostname: 'example.com', recordType: 'INVALID' });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// net_dns handler 正常路径
// ===========================================================================

describe('netDnsHandler 正常路径', () => {
  it('解析 localhost 返回 127.0.0.1', async () => {
    const result = await netDnsHandler({ hostname: 'localhost' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['recordType']).toBe('A');
      const addresses = result['addresses'] as string[];
      expect(Array.isArray(addresses)).toBe(true);
      // 大多数系统 hosts 文件含 127.0.0.1 localhost
      expect(addresses).toContain('127.0.0.1');
    }
  });

  it('默认 recordType 为 A', async () => {
    const result = await netDnsHandler({ hostname: 'localhost' });
    if (isOk(result)) {
      expect(result['recordType']).toBe('A');
    }
  });

  it('显式 recordType A', async () => {
    const result = await netDnsHandler({ hostname: 'localhost', recordType: 'A' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['recordType']).toBe('A');
      expect(Array.isArray(result['addresses'])).toBe(true);
    }
  });

  it('addresses 元素均为字符串', async () => {
    const result = await netDnsHandler({ hostname: 'localhost' });
    if (isOk(result)) {
      const addresses = result['addresses'] as unknown[];
      for (const a of addresses) {
        expect(typeof a).toBe('string');
      }
    }
  });
});

// ===========================================================================
// net_dns handler 失败路径
// ===========================================================================

describe('netDnsHandler 失败路径', () => {
  it('解析不存在域名返回 fail', async () => {
    const result = await netDnsHandler({ hostname: 'nonexistent-domain-xyz-123.invalid' });
    // 不存在域名要么返回 fail（NET_FAIL），要么返回空数组
    if (isFail(result)) {
      expect(result.error.code).toBe('NET_FAIL');
    } else {
      // 某些环境可能返回空数组而非错误
      expect((result['addresses'] as unknown[]).length).toBe(0);
    }
  });

  it('空 hostname 返回 EINVAL', async () => {
    const result = await netDnsHandler({ hostname: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('含空格的 hostname 返回 EINVAL', async () => {
    const result = await netDnsHandler({ hostname: 'invalid host' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('hostname 非字符串返回 EINVAL', async () => {
    const result = await netDnsHandler({ hostname: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ===========================================================================
// net_tcp 工具定义
// ===========================================================================

describe('netTcpTool 定义', () => {
  it('名称为 net_tcp', () => {
    expect(netTcpTool.name).toBe('net_tcp');
  });

  it('有描述', () => {
    expect(netTcpTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof netTcpInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof netTcpTool.handler).toBe('function');
  });
});

describe('netTcpInputSchema 验证', () => {
  it('合法输入通过', () => {
    const parsed = netTcpInputSchema.safeParse({ host: '127.0.0.1', port: 80 });
    expect(parsed.success).toBe(true);
  });

  it('port 非整数非法', () => {
    const parsed = netTcpInputSchema.safeParse({ host: '127.0.0.1', port: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it('port 负数非法', () => {
    const parsed = netTcpInputSchema.safeParse({ host: '127.0.0.1', port: -1 });
    expect(parsed.success).toBe(false);
  });

  it('port 超过 65535 非法', () => {
    const parsed = netTcpInputSchema.safeParse({ host: '127.0.0.1', port: 70000 });
    expect(parsed.success).toBe(false);
  });

  it('host 非字符串非法', () => {
    const parsed = netTcpInputSchema.safeParse({ host: 123, port: 80 });
    expect(parsed.success).toBe(false);
  });

  it('timeout 非正整数非法', () => {
    const parsed = netTcpInputSchema.safeParse({
      host: '127.0.0.1',
      port: 80,
      timeout: 0,
    });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// net_tcp handler 正常路径
// ===========================================================================

describe('netTcpHandler 正常路径', () => {
  it('探测本地已开端口 reachable=true', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: serverPort });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['reachable']).toBe(true);
      expect(result['host']).toBe('127.0.0.1');
      expect(result['port']).toBe(serverPort);
      expect(typeof result['duration']).toBe('number');
    }
  });

  it('duration 非负', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: serverPort });
    if (isOk(result)) {
      expect(result['duration'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('返回结果含所有字段', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: serverPort });
    if (isOk(result)) {
      expect(result['reachable']).toBeDefined();
      expect(result['host']).toBeDefined();
      expect(result['port']).toBeDefined();
      expect(result['duration']).toBeDefined();
    }
  });
});

// ===========================================================================
// net_tcp handler 失败/不可达路径
// ===========================================================================

describe('netTcpHandler 不可达与失败路径', () => {
  it('探测未开端口 reachable=false', async () => {
    const unusedPort = await getUnusedPort();
    const result = await netTcpHandler({ host: '127.0.0.1', port: unusedPort });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['reachable']).toBe(false);
    }
  });

  it('探测不可达地址 reachable=false（超时机制）', async () => {
    // 192.0.2.1 是 TEST-NET-1（RFC 5737），不可路由，连接会 hang 直到超时
    const result = await netTcpHandler({
      host: '192.0.2.1',
      port: 80,
      timeout: 300,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['reachable']).toBe(false);
      // duration 不超过 timeout + 余量
      expect(result['duration'] as number).toBeLessThanOrEqual(1000);
    }
  });

  it('非法 host（空字符串）返回 EINVAL', async () => {
    const result = await netTcpHandler({ host: '', port: 80 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 port（超过 65535）返回 EINVAL', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: 70000 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 port（负数）返回 EINVAL', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: -1 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 port（非整数）返回 EINVAL', async () => {
    const result = await netTcpHandler({ host: '127.0.0.1', port: 1.5 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 host（非字符串）返回 EINVAL', async () => {
    const result = await netTcpHandler({ host: 123, port: 80 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});
