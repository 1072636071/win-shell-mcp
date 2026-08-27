/**
 * 新命令测试：hash_file / fs_du / json_get / git 子命令。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { hashFileHandler } from "../../src/tools/hash.js";
import { fsDuHandler } from "../../src/tools/fs_du.js";
import { jsonGetHandler } from "../../src/tools/json.js";
import {
  netListenHandler,
  parseNetstatLine,
  parseLsofLine,
  parseSsLine,
} from "../../src/tools/net_listen.js";
import { netDownloadHandler } from "../../src/tools/net_download.js";
import {
  gitCheckoutHandler,
  gitPushHandler,
  gitPullHandler,
  gitCloneHandler,
  gitStashHandler,
} from "../../src/tools/git.js";
import { isOk, isFail } from "../../src/contract/output.js";

const execFileAsync = promisify(execFile);

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "newcmd-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}

async function initRepo(dir: string): Promise<void> {
  await git(["init"], dir);
  await git(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
  await git(["config", "user.name", "TestUser"], dir);
  await git(["config", "user.email", "test@example.com"], dir);
  await writeFile(join(dir, "README.md"), "# Test\n", "utf8");
  await git(["add", "README.md"], dir);
  await git(["commit", "-m", "initial commit"], dir);
}

// ===========================================================================
// hash_file
// ===========================================================================

describe("hash_file", () => {
  it("计算 sha256 摘要", async () => {
    const file = join(workDir, "a.txt");
    await writeFile(file, "hello");
    const result = await hashFileHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const expected = createHash("sha256").update("hello").digest("hex");
      expect(result["hash"]).toBe(expected);
      expect(result["algorithm"]).toBe("sha256");
    }
  });

  it("计算 md5 摘要", async () => {
    const file = join(workDir, "b.txt");
    await writeFile(file, "world");
    const result = await hashFileHandler({ path: file, algorithm: "md5" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const expected = createHash("md5").update("world").digest("hex");
      expect(result["hash"]).toBe(expected);
      expect(result["algorithm"]).toBe("md5");
    }
  });

  it("文件不存在返回 ENOENT", async () => {
    const result = await hashFileHandler({ path: join(workDir, "no-such") });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOENT");
    }
  });

  it("空路径返回 EINVAL", async () => {
    const result = await hashFileHandler({ path: "" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("路径是目录返回 EISDIR", async () => {
    const result = await hashFileHandler({ path: workDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EISDIR");
    }
  });
});

// ===========================================================================
// fs_du
// ===========================================================================

describe("fs_du", () => {
  it("递归累计目录大小", async () => {
    const dir = join(workDir, "du-test");
    await mkdir(dir);
    await writeFile(join(dir, "a.txt"), "aaaa");
    await writeFile(join(dir, "b.txt"), "bb");
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "sub", "c.txt"), "ccc");

    const result = await fsDuHandler({ path: dir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["size"]).toBe(9); // 4 + 2 + 3
    }
  });

  it("verbose 返回文件与目录数", async () => {
    const dir = join(workDir, "du-verbose");
    await mkdir(dir);
    await writeFile(join(dir, "a.txt"), "x");
    await mkdir(join(dir, "sub"));

    const result = await fsDuHandler({ path: dir, verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["files"]).toBe(1);
      expect(result["dirs"]).toBe(1);
    }
  });

  it("不是目录返回 ENOTDIR", async () => {
    const file = join(workDir, "a.txt");
    await writeFile(file, "x");
    const result = await fsDuHandler({ path: file });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOTDIR");
    }
  });

  it("空路径返回 EINVAL", async () => {
    const result = await fsDuHandler({ path: "" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("路径不存在返回 ENOENT", async () => {
    const result = await fsDuHandler({ path: join(workDir, "no-such-dir") });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOENT");
    }
  });
});

// ===========================================================================
// json_get
// ===========================================================================

describe("json_get", () => {
  it("从文件按路径取值", async () => {
    const file = join(workDir, "data.json");
    await writeFile(file, JSON.stringify({ foo: { bar: 42 }, arr: [1, 2, 3] }));

    const result = await jsonGetHandler({ path: file, expr: ".foo.bar" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["value"]).toBe(42);
    }
  });

  it("数组索引取值", async () => {
    const file = join(workDir, "arr.json");
    await writeFile(file, JSON.stringify([10, 20, 30]));

    const result = await jsonGetHandler({ path: file, expr: "[1]" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["value"]).toBe(20);
    }
  });

  it("从 data 字符串取值", async () => {
    const result = await jsonGetHandler({
      data: '{"a":{"b":"hello"}}',
      expr: ".a.b",
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["value"]).toBe("hello");
    }
  });

  it("根路径 . 返回整个 JSON", async () => {
    const result = await jsonGetHandler({ data: '{"x":1}', expr: "." });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["value"]).toEqual({ x: 1 });
    }
  });

  it("非法 JSON 返回 EINVAL", async () => {
    const result = await jsonGetHandler({ data: "{invalid}", expr: "." });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("路径取值失败返回 EINVAL", async () => {
    const result = await jsonGetHandler({ data: '{"a":1}', expr: ".a.b" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("文件不存在返回 ENOENT", async () => {
    const result = await jsonGetHandler({
      path: join(workDir, "no-such.json"),
      expr: ".",
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOENT");
    }
  });

  it("expr 为空返回 EINVAL", async () => {
    const result = await jsonGetHandler({ data: '{"a":1}', expr: "" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("path 和 data 都未提供返回 EINVAL", async () => {
    const result = await jsonGetHandler({ expr: "." });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });

  it("在非数组上取索引返回 EINVAL", async () => {
    const result = await jsonGetHandler({ data: '{"a":1}', expr: ".a[0]" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });
});

// ===========================================================================
// git 子命令（基本参数校验）
// ===========================================================================

describe("git_checkout", () => {
  it("branch 为空且无 paths 返回 EINVAL", async () => {
    const result = await gitCheckoutHandler({ branch: "" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      // 工单 15-01：互斥规则违反附 hint 给出合法组合
      expect(result.error.hint).toBeDefined();
    }
  });

  it("paths 单独提供时还原工作区文件", async () => {
    await initRepo(workDir);
    const file = join(workDir, "README.md");
    await writeFile(file, "# Changed", "utf8");

    const result = await gitCheckoutHandler({
      paths: ["README.md"],
      cwd: workDir,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["checkedOut"]).toBe(true);
      expect(result["paths"]).toEqual(["README.md"]);
    }
    const restored = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
    expect(restored).toBe("# Test\n");
  });

  it("branch + create 创建并切换到新分支", async () => {
    await initRepo(workDir);
    const result = await gitCheckoutHandler({
      branch: "feature",
      create: true,
      cwd: workDir,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["checkedOut"]).toBe(true);
      expect(result["branch"]).toBe("feature");
    }
  });

  it("branch + paths 从指定 ref 还原文件", async () => {
    await initRepo(workDir);
    await git(["checkout", "-b", "feature"], workDir);
    await writeFile(join(workDir, "README.md"), "# Feature", "utf8");
    await git(["add", "README.md"], workDir);
    await git(["commit", "-m", "feature commit"], workDir);

    const result = await gitCheckoutHandler({
      branch: "main",
      paths: ["README.md"],
      cwd: workDir,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result["checkedOut"]).toBe(true);
      expect(result["paths"]).toEqual(["README.md"]);
    }
    const restored = (
      await readFile(join(workDir, "README.md"), "utf8")
    ).replace(/\r\n/g, "\n");
    expect(restored).toBe("# Test\n");
  });

  it("create=true 且无 branch 返回 EINVAL", async () => {
    const result = await gitCheckoutHandler({ create: true });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      // 工单 15-01：create 缺 branch 附 hint
      expect(result.error.hint).toBeDefined();
    }
  });

  it("create=true 且 paths 非空返回 EINVAL", async () => {
    const result = await gitCheckoutHandler({
      branch: "feature",
      create: true,
      paths: ["a.txt"],
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      // 工单 15-01：create 与 paths 互斥附 hint
      expect(result.error.hint).toBeDefined();
    }
  });
});

describe("git_clone 参数校验", () => {
  it("url 为空返回 EINVAL", async () => {
    const result = await gitCloneHandler({ url: "" });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
    }
  });
});

describe("git_stash", () => {
  it("action 默认 push", async () => {
    // 在非 git 仓库下执行 stash 会失败，验证不抛异常且返回 fail
    const result = await gitStashHandler({ cwd: workDir });
    expect(isFail(result)).toBe(true);
  });
});

// ===========================================================================
// net_listen
// ===========================================================================

describe("net_listen", () => {
  it("返回的监听条目含 port/protocol/address/pid，可选 name", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const result = await netListenHandler({});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ports =
          (result["ports"] as Array<{
            port: number;
            protocol: string;
            address: string;
            pid: number;
            name?: string;
          }>) ?? [];
        const entry = ports.find((p) => p.port === port);
        expect(entry).toBeDefined();
        if (entry) {
          expect(typeof entry.protocol).toBe("string");
          expect(typeof entry.address).toBe("string");
          expect(typeof entry.pid).toBe("number");
          expect(entry.pid).toBeGreaterThan(0);
        }
      }
    } finally {
      server.close();
      await new Promise<void>((resolve) => server.once("close", resolve));
    }
  });

  it("filter 按进程名过滤", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      // filter 用 node（当前进程名）应能匹配
      const result = await netListenHandler({ filter: "node" });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ports =
          (result["ports"] as Array<{ port: number; name?: string }>) ?? [];
        expect(ports.some((p) => p.port === port)).toBe(true);
      }
    } finally {
      server.close();
      await new Promise<void>((resolve) => server.once("close", resolve));
    }
  });

  it("parseNetstatLine 解析 Windows netstat 行", () => {
    const line =
      "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1234";
    const entry = parseNetstatLine(line);
    expect(entry).toEqual({
      port: 135,
      protocol: "TCP",
      address: "0.0.0.0",
      pid: 1234,
    });
  });

  it("parseNetstatLine 忽略非 LISTENING 行", () => {
    const entry = parseNetstatLine(
      "  TCP    0.0.0.0:135            0.0.0.0:0              ESTABLISHED     1234",
    );
    expect(entry).toBeNull();
  });

  it("parseLsofLine 解析 lsof LISTEN 行", () => {
    const line =
      "node     1234  user   6u  IPv4   0x1234      0t0  TCP *:3000 (LISTEN)";
    const entry = parseLsofLine(line);
    expect(entry).toEqual({
      port: 3000,
      protocol: "tcp",
      address: "0.0.0.0",
      pid: 1234,
      name: "node",
    });
  });

  it("parseLsofLine 忽略非 LISTEN 行", () => {
    const entry = parseLsofLine(
      "node     1234  user   6u  IPv4   0x1234      0t0  TCP 127.0.0.1:3000",
    );
    expect(entry).toBeNull();
  });

  it("parseSsLine 解析 ss LISTEN 行", () => {
    const line =
      'LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=21))';
    const entry = parseSsLine(line);
    expect(entry).toEqual({
      port: 3000,
      protocol: "tcp",
      address: "0.0.0.0",
      pid: 1234,
      name: "node",
    });
  });

  it("parseSsLine 忽略非 LISTEN 行", () => {
    const entry = parseSsLine(
      'ESTAB  0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=21))',
    );
    expect(entry).toBeNull();
  });

  it("parseLsofLine 错误分支返回 null", () => {
    expect(parseLsofLine("node 1234 TCP *:3000 (LISTEN)")).toBeNull();
    expect(
      parseLsofLine(
        "node     abc  user   6u  IPv4   0x1234      0t0  TCP *:3000 (LISTEN)",
      ),
    ).toBeNull();
    expect(
      parseLsofLine(
        "node     1234  user   6u  IPv4   0x1234      0t0  TCP (LISTEN)",
      ),
    ).toBeNull();
    expect(
      parseLsofLine(
        "node     1234  user   6u  IPv4   0x1234      0t0  TCP *:abc (LISTEN)",
      ),
    ).toBeNull();
  });

  it("parseSsLine 错误分支返回 null", () => {
    expect(parseSsLine("LISTEN 0 4096 0.0.0.0:3000")).toBeNull();
    expect(
      parseSsLine(
        'LISTEN 0 4096 0.0.0.0 0.0.0.0:* users:(("node",pid=1234,fd=21))',
      ),
    ).toBeNull();
    expect(
      parseSsLine(
        'LISTEN 0 4096 0.0.0.0:abc 0.0.0.0:* users:(("node",pid=1234,fd=21))',
      ),
    ).toBeNull();
    expect(parseSsLine("LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:*")).toEqual({
      port: 3000,
      protocol: "tcp",
      address: "0.0.0.0",
      pid: 0,
      name: "",
    });
  });

  it("parseNetstatLine 错误分支返回 null", () => {
    expect(
      parseNetstatLine(
        "  TCP    0.0.0.0:135            0.0.0.0:0              ESTABLISHED     1234",
      ),
    ).toBeNull();
    expect(
      parseNetstatLine("  TCP    0.0.0.0:135            LISTENING"),
    ).toBeNull();
    expect(
      parseNetstatLine(
        "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       abc",
      ),
    ).toBeNull();
    expect(
      parseNetstatLine(
        "  TCP    0.0.0.0                0.0.0.0:0              LISTENING       1234",
      ),
    ).toBeNull();
    expect(
      parseNetstatLine(
        "  TCP    0.0.0.0:abc            0.0.0.0:0              LISTENING       1234",
      ),
    ).toBeNull();
  });
});

// ===========================================================================
// net_download
// ===========================================================================

describe("net_download", () => {
  it("下载到本地文件", async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": "5",
      });
      res.end("hello");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as net.AddressInfo).port;

    const target = join(workDir, "download.txt");
    try {
      const result = await netDownloadHandler({
        url: `http://127.0.0.1:${port}/hello`,
        path: target,
      });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result["saved"]).toBe(true);
        expect(result["bytes"]).toBe(5);
        expect(result["path"]).toBe(target);
      }
      const content = await readFile(target, "utf8");
      expect(content).toBe("hello");
    } finally {
      server.close();
      await new Promise<void>((resolve) => server.once("close", resolve));
    }
  });

  it("mkdirParents=false 且父目录不存在返回 ENOENT", async () => {
    const target = join(workDir, "no-such-dir", "file.txt");
    const result = await netDownloadHandler({
      url: "http://127.0.0.1:1/",
      path: target,
      mkdirParents: false,
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOENT");
    }
  });

  it("超时返回 NET_TIMEOUT", async () => {
    const server = createServer((req, res) => {
      // 永远不写响应
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as net.AddressInfo).port;

    const target = join(workDir, "timeout.txt");
    try {
      const result = await netDownloadHandler({
        url: `http://127.0.0.1:${port}/slow`,
        path: target,
        timeout: 100,
      });
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe("NET_TIMEOUT");
      }
    } finally {
      server.close();
      await new Promise<void>((resolve) => server.once("close", resolve));
    }
  });

  it("HTTP 404 返回 NET_FAIL", async () => {
    const server = createServer((req, res) => {
      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as net.AddressInfo).port;

    const target = join(workDir, "404.txt");
    try {
      const result = await netDownloadHandler({
        url: `http://127.0.0.1:${port}/missing`,
        path: target,
      });
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe("NET_FAIL");
      }
    } finally {
      server.close();
      await new Promise<void>((resolve) => server.once("close", resolve));
    }
  });

  it("url 为空返回 INVALID_URL，path 为空返回 EINVAL", async () => {
    const r1 = await netDownloadHandler({
      url: "",
      path: join(workDir, "a.txt"),
    });
    expect(isFail(r1)).toBe(true);
    if (isFail(r1)) {
      expect(r1.error.code).toBe("INVALID_URL");
    }
    const r2 = await netDownloadHandler({
      url: "http://127.0.0.1:1/",
      path: "",
    });
    expect(isFail(r2)).toBe(true);
    if (isFail(r2)) {
      expect(r2.error.code).toBe("EINVAL");
    }
  });

  it("连接被拒绝返回 fail", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as net.AddressInfo).port;
    server.close();
    await new Promise<void>((resolve) => server.once("close", resolve));

    const target = join(workDir, "refused.txt");
    const result = await netDownloadHandler({
      url: `http://127.0.0.1:${port}/`,
      path: target,
      timeout: 3000,
    });
    expect(isFail(result)).toBe(true);
  });
});
