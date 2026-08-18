import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  toErrorCode,
  toErrorMessage,
  ERROR_MESSAGES,
} from '../../src/contract/errors.js';

describe('ErrorCode 常量', () => {
  it('包含所有标准码', () => {
    expect(ErrorCode.ENOENT).toBe('ENOENT');
    expect(ErrorCode.EISDIR).toBe('EISDIR');
    expect(ErrorCode.ENOTDIR).toBe('ENOTDIR');
    expect(ErrorCode.EACCES).toBe('EACCES');
    expect(ErrorCode.ETIMEOUT).toBe('ETIMEOUT');
    expect(ErrorCode.EEXEC).toBe('EEXEC');
    expect(ErrorCode.EINVAL).toBe('EINVAL');
    expect(ErrorCode.EUNKNOWN).toBe('EUNKNOWN');
  });

  it('包含所有新增业务码', () => {
    expect(ErrorCode.INVALID_URL).toBe('INVALID_URL');
    expect(ErrorCode.NET_TIMEOUT).toBe('NET_TIMEOUT');
    expect(ErrorCode.NET_FAIL).toBe('NET_FAIL');
    expect(ErrorCode.PROC_NOT_FOUND).toBe('PROC_NOT_FOUND');
    expect(ErrorCode.PROC_KILL_FAIL).toBe('PROC_KILL_FAIL');
    expect(ErrorCode.EXEC_FAIL).toBe('EXEC_FAIL');
    expect(ErrorCode.EXEC_TIMEOUT).toBe('EXEC_TIMEOUT');
    expect(ErrorCode.GIT_FAIL).toBe('GIT_FAIL');
  });
});

describe('toErrorCode', () => {
  it('Error 带已知 code 返回对应码', () => {
    const err = new Error('not found') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    expect(toErrorCode(err)).toBe('ENOENT');
  });

  it('Error 带未知 code 返回 EUNKNOWN', () => {
    const err = new Error('weird') as NodeJS.ErrnoException;
    err.code = 'SOMETHING_WEIRD';
    expect(toErrorCode(err)).toBe('EUNKNOWN');
  });

  it('Error 不带 code 返回 EUNKNOWN', () => {
    expect(toErrorCode(new Error('plain'))).toBe('EUNKNOWN');
  });

  it('非 Error 值返回 EUNKNOWN', () => {
    expect(toErrorCode('string error')).toBe('EUNKNOWN');
    expect(toErrorCode(42)).toBe('EUNKNOWN');
    expect(toErrorCode(null)).toBe('EUNKNOWN');
    expect(toErrorCode(undefined)).toBe('EUNKNOWN');
    expect(toErrorCode({ foo: 'bar' })).toBe('EUNKNOWN');
  });

  it('每个已知码都能被识别', () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new Error(code) as NodeJS.ErrnoException;
      err.code = code;
      expect(toErrorCode(err)).toBe(code);
    }
  });

  it('Node ENOTFOUND 映射到 NET_FAIL', () => {
    const err = new Error('getaddrinfo ENOTFOUND example.invalid') as NodeJS.ErrnoException;
    err.code = 'ENOTFOUND';
    expect(toErrorCode(err)).toBe('NET_FAIL');
  });

  it('Node ECONNREFUSED 映射到 NET_FAIL', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:1') as NodeJS.ErrnoException;
    err.code = 'ECONNREFUSED';
    expect(toErrorCode(err)).toBe('NET_FAIL');
  });

  it('Node ECONNRESET 映射到 NET_FAIL', () => {
    const err = new Error('read ECONNRESET') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    expect(toErrorCode(err)).toBe('NET_FAIL');
  });

  it('Node ETIMEDOUT 映射到 ETIMEOUT', () => {
    const err = new Error('operation timed out') as NodeJS.ErrnoException;
    err.code = 'ETIMEDOUT';
    expect(toErrorCode(err)).toBe('ETIMEOUT');
  });

  it('Node ESRCH 映射到 PROC_NOT_FOUND', () => {
    const err = new Error('no such process') as NodeJS.ErrnoException;
    err.code = 'ESRCH';
    expect(toErrorCode(err)).toBe('PROC_NOT_FOUND');
  });

  it('Node EAGAIN 映射到 EXEC_FAIL', () => {
    const err = new Error('resource temporarily unavailable') as NodeJS.ErrnoException;
    err.code = 'EAGAIN';
    expect(toErrorCode(err)).toBe('EXEC_FAIL');
  });
});

describe('ERROR_MESSAGES', () => {
  it('每个错误码都有对应中文消息', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
      expect(typeof ERROR_MESSAGES[code]).toBe('string');
    }
  });

  it('新增码消息符合预期', () => {
    expect(ERROR_MESSAGES.INVALID_URL).toBe('非法 URL');
    expect(ERROR_MESSAGES.NET_TIMEOUT).toBe('网络超时');
    expect(ERROR_MESSAGES.NET_FAIL).toBe('网络连接失败');
    expect(ERROR_MESSAGES.PROC_NOT_FOUND).toBe('进程不存在');
    expect(ERROR_MESSAGES.PROC_KILL_FAIL).toBe('终止进程失败');
    expect(ERROR_MESSAGES.EXEC_FAIL).toBe('命令执行失败');
    expect(ERROR_MESSAGES.EXEC_TIMEOUT).toBe('命令执行超时');
    expect(ERROR_MESSAGES.GIT_FAIL).toBe('git 命令失败');
  });

  it('原有码消息符合预期', () => {
    expect(ERROR_MESSAGES.ENOENT).toBe('路径不存在');
    expect(ERROR_MESSAGES.EUNKNOWN).toBe('未知错误');
  });
});

describe('toErrorMessage', () => {
  it('Error 返回 message', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('Error 空 message 回退到错误码中文消息', () => {
    const err = new Error('') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    expect(toErrorMessage(err)).toBe('路径不存在');
  });

  it('Error 空 message 未知码回退到 EUNKNOWN 消息', () => {
    expect(toErrorMessage(new Error(''))).toBe('未知错误');
  });

  it('Error 空 message NET_FAIL 回退到网络连接失败', () => {
    const err = new Error('') as NodeJS.ErrnoException;
    err.code = 'ENOTFOUND';
    expect(toErrorMessage(err)).toBe('网络连接失败');
  });

  it('字符串原样返回', () => {
    expect(toErrorMessage('plain string')).toBe('plain string');
  });

  it('数字转字符串', () => {
    expect(toErrorMessage(42)).toBe('42');
  });

  it('对象转字符串', () => {
    expect(toErrorMessage({ a: 1 })).toBe('[object Object]');
  });

  it('null 转字符串', () => {
    expect(toErrorMessage(null)).toBe('null');
  });

  it('undefined 转字符串', () => {
    expect(toErrorMessage(undefined)).toBe('undefined');
  });
});
