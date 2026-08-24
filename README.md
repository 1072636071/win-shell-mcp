# win-shell-mcp

> AI 原生跨平台命令抽象层 —— 以 MCP Server 形式提供 46 个确定性工具，替代裸 shell 调用，统一极简 JSON 输出，处理 Windows 路径/编码/引号差异。

[![CI](https://github.com/user/win-shell-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/user/win-shell-mcp/actions/workflows/ci.yml)

## 为什么

让 AI 调用 shell 命令是危险且不可靠的：

- **跨平台不一致**：Windows 的路径分隔符、编码（GBK）、引号、命令名（`del` vs `rm`）与 unix 差异巨大
- **输出难解析**：shell 命令输出格式随意，AI 难以可靠提取信息
- **安全风险**：裸 shell 允许管道、重定向、命令注入

`win-shell-mcp` 用 46 个**确定性工具**替代常见 shell 命令，每个工具：

- 接受结构化 JSON 参数，返回统一 `{ ok: true, ...data }` 或 `{ ok: false, error: { code, message } }`
- 跨平台行为一致（Windows/macOS/Linux 同一份配置）
- 极简输出（默认只含 AI 决策所需最小字段），`verbose` 开关获取完整数据
- 标准错误码（`ENOENT`/`EISDIR`/`ENOTDIR`/`EACCES`/`EINVAL`/`ETIMEOUT`/`EEXEC`/`EUNKNOWN`/`INVALID_URL`/`NET_TIMEOUT`/`NET_FAIL`/`PROC_NOT_FOUND`/`PROC_KILL_FAIL`/`EXEC_FAIL`/`EXEC_TIMEOUT`/`GIT_FAIL`）

## 安装

```bash
# 全局安装
npm install -g win-shell-mcp

# 或一次性运行
npx win-shell-mcp
```

要求 Node.js ≥ 18。

## 客户端配置

### Claude Desktop

编辑 `claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/`，Windows: `%APPDATA%\Claude\`）：

```json
{
  "mcpServers": {
    "win-shell-mcp": {
      "command": "win-shell-mcp"
    }
  }
}
```

若未全局安装，用 `npx`：

```json
{
  "mcpServers": {
    "win-shell-mcp": {
      "command": "npx",
      "args": ["win-shell-mcp"]
    }
  }
}
```

### 通用 MCP 客户端

任何兼容 [Model Context Protocol](https://modelcontextprotocol.io/) 的客户端均可通过 stdio 连接：

```json
{
  "mcpServers": {
    "win-shell-mcp": {
      "command": "win-shell-mcp",
      "transport": "stdio"
    }
  }
}
```

启动后客户端将通过 stdio 与 server 通信，自动发现全部 46 个工具。

## 工具清单（46 个）

按域分组。每个工具返回统一输出契约：成功 `{ ok: true, ...data }`，失败 `{ ok: false, error: { code, message } }`。

### system（4）

| 工具 | 说明 |
|------|------|
| `system_info` | 系统信息（os、arch、platform、hostname、cwd、node）；`verbose` 含 uptime、内存、CPU |
| `system_disk` | 磁盘用量（total/free/used，字节） |
| `system_memory` | 内存信息（total/free）；`verbose` 含 used、swap |
| `system_path` | PATH 环境变量条目列表；`verbose` 含 count、existing |

### fs_read（3）

| 工具 | 说明 |
|------|------|
| `fs_list` | 列目录；`verbose` 含类型与大小，`recursive` 递归 |
| `fs_read` | 读文件；支持行范围、编码自动检测（GBK/UTF-8）、截断 |
| `fs_stat` | 文件/目录信息（type、size、mtime、birthtime） |

### fs_write（6）

| 工具 | 说明 |
|------|------|
| `fs_write` | 写文件（支持 utf-8/gbk 编码，可追加） |
| `fs_mkdir` | 建目录（`recursive` 默认 true，类似 `mkdir -p`） |
| `fs_rm` | 删除文件/目录（`recursive` 删目录树，`force` 忽略不存在） |
| `fs_cp` | 复制文件/目录（目录需 `recursive`） |
| `fs_mv` | 移动/重命名（dest 已存在则失败，不覆盖） |
| `fs_touch` | 创建空文件或更新 mtime |

### text（7）

| 工具 | 说明 |
|------|------|
| `text_grep` | 文本搜索（默认字面量，/正则/ 形式启用正则） |
| `text_head` | 取前 N 行 |
| `text_tail` | 取后 N 行 |
| `text_wc` | 统计行/词/字符数 |
| `text_diff` | 两段文本差异 |
| `text_replace` | 文本替换（默认字面量，/正则/ 形式启用正则；多命中需显式表态） |
| `cat` | 连接/读取文件内容（类似 `cat`；别名 `text_cat`） |

### search（4）

| 工具 | 说明 |
|------|------|
| `search_glob` | glob 模式匹配文件路径 |
| `search_content` | 跨文件内容搜索（默认字面量，/正则/ 形式启用正则） |
| `search_which` | 查找可执行文件路径（类似 `which`/`where`） |
| `find` | 按文件名模式递归搜索（Unix find 短名；别名 `fs_find`，支持 * 通配） |

### process（2）

| 工具 | 说明 |
|------|------|
| `process_list` | 列出进程 |
| `process_kill` | 终止进程（按 PID） |

### shell_exec（1）

| 工具 | 说明 |
|------|------|
| `shell_exec` | 执行 shell 命令（带超时与编码处理） |

### env（3）

| 工具 | 说明 |
|------|------|
| `env_get` | 读取环境变量 |
| `env_set` | 设置环境变量 |
| `env_unset` | 删除环境变量 |

### net（5）

| 工具 | 说明 |
|------|------|
| `net_get` | HTTP GET 请求 |
| `net_post` | HTTP POST 请求 |
| `net_dns` | DNS 解析 |
| `net_tcp` | TCP 连接探测 |
| `ping` | TCP 连通性探测（类似 `ping`；别名 `net_ping`） |

### pkg（2）

| 工具 | 说明 |
|------|------|
| `pkg_detect` | 检测包管理器（npm/pnpm/yarn） |
| `pkg_run` | 运行包脚本 |

### git（6）

| 工具 | 说明 |
|------|------|
| `git_status` | 工作区状态 |
| `git_log` | 提交历史 |
| `git_branch` | 分支列表与切换 |
| `git_diff` | 差异 |
| `git_add` | 暂存 |
| `git_commit` | 提交 |

### core（2）

| 工具 | 说明 |
|------|------|
| `pwd` | 打印当前工作目录 |
| `echo` | 输出文本 |

### run_command（1）

| 工具 | 说明 |
|------|------|
| `run_command` | 直接运行 shell 命令（精简版） |

## ⚠️ 安全说明

> **无沙箱，全权限。**
>
> 本 server 以运行用户的完整权限执行所有操作，**与裸 shell 等价**。`fs_rm` 可删除任意可访问文件，`shell_exec` 可执行任意命令，`process_kill` 可终止任意可访问进程，`fs_write` 可覆盖任意可访问文件。
>
> **请仅在信任环境下使用：**
>
> - 仅连接到你信任的 AI 客户端
> - 不要在共享/多租户环境暴露
> - 对敏感目录（系统目录、用户主目录）操作前人工确认
> - 生产环境建议配合操作系统级权限隔离（专用低权限账户、容器、chroot 等）
>
> 本项目**不**提供任何沙箱、权限隔离、命令黑名单或路径限制。所有访问控制依赖操作系统权限。

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 测试
npm test

# 测试（watch 模式）
npm run test:watch

# 覆盖率（阈值：lines/functions/statements ≥ 85%，branches ≥ 84%）
npm run coverage

# 构建
npm run build

# 开发模式（watch 构建）
npm run dev
```

构建产物为 `dist/index.js`（tsup 打包，ESM）。

## 项目结构

```
src/
  index.ts          # 入口：启动 stdio server
  server.ts         # MCP Server 创建与工具分发
  registry.ts       # 工具注册表（注册全部 46 个工具）
  contract/         # 输出契约与错误码
  encoding/         # 编码检测（GBK/UTF-8）
  tools/            # 46 个工具实现，按域分文件
tests/
  server.test.ts    # server 单元测试
  integration/      # 集成测试（Client + InMemoryTransport）
  tools/            # 各工具单元测试
  contract/         # 契约测试
  encoding/         # 编码测试
```

## License

MIT