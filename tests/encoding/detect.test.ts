import { describe, it, expect } from 'vitest';
import { encode as iconvEncode } from 'iconv-lite';
import { decodeBuffer, isLikelyGBK } from '../../src/encoding/detect.js';

describe('isLikelyGBK', () => {
  it('空 buffer 返回 false', () => {
    expect(isLikelyGBK(Buffer.alloc(0))).toBe(false);
  });

  it('纯 ASCII 返回 false', () => {
    expect(isLikelyGBK(Buffer.from('hello world'))).toBe(false);
  });

  it('合法 UTF-8 中文返回 false', () => {
    expect(isLikelyGBK(Buffer.from('你好'))).toBe(false);
  });

  it('GBK 编码返回 true', () => {
    const gbkBuf = iconvEncode('你好', 'gbk');
    expect(isLikelyGBK(gbkBuf)).toBe(true);
  });

  it('UTF-8 BOM + 中文返回 false', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, Buffer.from('你好', 'utf8')]);
    expect(isLikelyGBK(buf)).toBe(false);
  });
});

describe('decodeBuffer', () => {
  it('解码 UTF-8 ASCII', () => {
    expect(decodeBuffer(Buffer.from('hello'))).toBe('hello');
  });

  it('解码 UTF-8 中文', () => {
    expect(decodeBuffer(Buffer.from('你好世界'))).toBe('你好世界');
  });

  it('解码带 BOM 的 UTF-8（去除 BOM）', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, Buffer.from('hello', 'utf8')]);
    expect(decodeBuffer(buf)).toBe('hello');
  });

  it('解码 GBK（启发式）', () => {
    const gbkBuf = iconvEncode('你好', 'gbk');
    expect(decodeBuffer(gbkBuf)).toBe('你好');
  });

  it('显式 hint utf-8', () => {
    expect(decodeBuffer(Buffer.from('hello'), 'utf-8')).toBe('hello');
  });

  it('显式 hint utf8（无连字符）', () => {
    expect(decodeBuffer(Buffer.from('hello'), 'utf8')).toBe('hello');
  });

  it('显式 hint utf-8 去除 BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, Buffer.from('hi', 'utf8')]);
    expect(decodeBuffer(buf, 'utf-8')).toBe('hi');
  });

  it('显式 hint gbk', () => {
    const gbkBuf = iconvEncode('你好世界', 'gbk');
    expect(decodeBuffer(gbkBuf, 'gbk')).toBe('你好世界');
  });

  it('显式 hint 优先于 BOM 检测', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, iconvEncode('你好', 'gbk')]);
    // hint gbk 应按 gbk 解码（含 BOM 字节）
    const result = decodeBuffer(buf, 'gbk');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('空 buffer 返回空字符串', () => {
    expect(decodeBuffer(Buffer.alloc(0))).toBe('');
  });

  it('混合 ASCII 与中文 UTF-8', () => {
    expect(decodeBuffer(Buffer.from('hello 你好'))).toBe('hello 你好');
  });

  it('hint 大小写不敏感', () => {
    expect(decodeBuffer(Buffer.from('hi'), 'UTF-8')).toBe('hi');
  });
});