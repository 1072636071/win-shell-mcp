# win-shell-mcp

> AI 原生跨平台命令抽象层 —— 以 MCP Server 形式提供 58 个确定性工具，替代裸 shell 调用，统一极简 JSON 输出，处理 Windows 路径/编码/引号差异。同时以原生 Cordis 插件（`.` / `./core` / `./plugin` 多入口）进入 DSH，按 MCP 标准注解做并发分类。

[![CI](https://github.com/1072636071/win-shell-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/1072636071/win-shell-mcp/actions/workflows/ci.yml)

## 为什么

让 AI 调用 shell 命令是危险且不可靠的：

- **跨平台不一致**：Windows 的路径分隔符、编码（GBK）、引号、命令名（`del` vs `rm`）与 unix 差异巨大
- **输出难解析**：shell 命令输出格式随意，AI 难以可靠提取信息
- **安全风险**：裸 shell 允许管道、重定向、命令注入

`win-shell-mcp` 用 58 个**确定性工具**替代常见 shell 命令，每个工具：

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

启动后客户端将通过 stdio 与 server 通信，自动发现全部 58 个工具。

### DSH / Cordis 插件入口

除 MCP Server 外，本包还以原生 Cordis 插件形式进入 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)。多入口：

- `.` → `dist/index.js`：MCP stdio server（shebang）
- `./core` → `dist/core.js`：通用核心（服务/注册表，无 dsh 依赖）
- `./plugin` → `dist/plugin.js`：Cordis 插件（`name` + `apply(ctx, config)`），把 58 工具全量投影到 `ctx.tools.defineTool`，支持 `config.exclude` 按名裁剪

并发分类以 MCP 标准 `ToolAnnotations.readOnlyHint` 为单一事实源（ADR-0014）：只读工具投影为 `isConcurrencySafe`；参数级例外（当前仅 `git_stash action:'list'`）走插件层小覆盖表放行并发，其余变更工具默认独占（fail-closed）。`@deepseek-ai/dsh-tools` / `@deepseek-ai/cordis` 为 optional peer dep，约定最小宿主契约类型，不硬依赖。

## 环境变量

> 部署面共用小节，现有四个变量：工具白名单 `WIN_SHELL_TOOLS`、懒加载开关
> `WIN_SHELL_LAZY`、输出截断阈值 `WIN_SHELL_TRUNCATE`、相对路径基准
> `WIN_SHELL_CWD`。均只在 MCP stdio 入口读取；DSH 插件面对应
> `config.exclude` / `config.cwd`，不读本节变量。

### `WIN_SHELL_TOOLS` —— 工具白名单（MCP stdio 入口）

逗号分隔的工具**正名**，仅暴露列出的工具，其余不注册：

```bash
# 仅暴露 git 流水线所需工具（ListTools 固定开销随子集规模下降）
WIN_SHELL_TOOLS=git_status,git_add,git_commit,git_push win-shell-mcp
```

- **默认行为不变**：未设置或空串 = 全量暴露全部工具；
- 解析规则：逐项 trim、忽略空段、重复项去重；
- **别名随正名共进退**：写 `fs_list` 则其别名 `ls`/`list_directory` 一起进退；别名本身不可写入白名单（误写别名按未知条目处理）;
- **fail-fast**：含未知条目时启动即失败，错误信息列出**全部**非法条目原文；不做「忽略未知项」的宽容模式；
- 调用被裁工具返回「未在当前部署暴露（WIN_SHELL_TOOLS）」，与拼错工具名的 `Unknown tool: X` 明确区分；`batch_run` 步骤引用被裁工具同样该步失败并短路；
- 作用范围：MCP stdio 入口。dsh 插件面不读取本变量（沿用既有 `config.exclude`）。

### `WIN_SHELL_LAZY` —— 懒加载开关（MCP stdio 入口）

```bash
# 首次 ListTools 只返回 3 个导航/编排 meta，按需取域明细后再照常调用
WIN_SHELL_LAZY=1 win-shell-mcp
```

- **语义无歧义**：仅精确等于 `1` 启用；缺省、空串及一切其他值（`0`、`true`、带空白等）均为全量模式，不做宽容变体；
- **懒模式列出面**：`ListTools` 恰返回 `tool_groups` / `list_domain_tools` / `batch_run` 三个 meta——先看域概览，再按需取目标域明细；
- **调用不设门禁**：未在列出面的工具照常可调用（加载只是信息获取、不是授权），不会因裁剪列出而得到 `Unknown tool`；
- **运行期稳定**：注册集不变，不发 listChanged 通知，模式切换无需调整提示词；
- **与白名单正交可组合**：两者同设时白名单先过滤工具集，域概览/明细只反映过滤后集合（被裁空的域不出现）；懒模式下 meta 三件套豁免白名单恒列入恒可调，纯白名单模式（不设本变量）下 meta 照常受约束；
- 作用范围：MCP stdio 入口。dsh 插件面不读取本变量。

### `WIN_SHELL_TRUNCATE` —— 输出截断阈值（MCP stdio 入口）

```bash
WIN_SHELL_TRUNCATE=800 win-shell-mcp
```

- 长内容截断的字符上限，正整数；未设置或空串 = 默认 2000；
- **fail-fast**：`0`、负数、非整数、非数字一律启动失败并点名变量与非法值原文，
  不静默降级。

### `WIN_SHELL_CWD` —— 相对路径基准（MCP stdio 入口）

```bash
WIN_SHELL_CWD=/d/work/space/my-repo win-shell-mcp
```

- 决定各工具 `path` / `cwd` 参数缺省时的解析起点：给了非空值就用该值，否则回落到
  本基准；`pwd` 报出的也是这个目录；
- **未设置 = 行为不变**：基准实时取进程 `process.cwd()`（不快照，`chdir` 照常生效）；
- 值是纯字符串，不校验目录是否存在（基准目录可能稍后才创建）；
- 同一进程内重复设置为不同值直接抛错：基准是进程级唯一值，静默取其一会让另一路
  调用把文件写到意料外的目录；
- **DSH 插件面对应 `config.cwd`**（不读本变量）：WShell 三模式的 preset 写成
  `cwd: !!js process.env.DSH_CWD ?? process.cwd()`，与提示词里的 `{{cwd}}` 同源——
  模型据此不必再花一轮调 `pwd` 探路。

## 工具清单（59 个）

> AI 建立工具概览优先读 [`docs/ai-tool-cheatsheet.md`](docs/ai-tool-cheatsheet.md)（按 15 命令域分节的四列表格：正名｜一句话用途｜关键参数｜别名）。

按域分组。每个工具返回统一输出契约：成功 `{ ok: true, ...data }`，失败 `{ ok: false, error: { code, message } }`。

### system（4）

| 工具            | 说明                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| `system_info`   | 系统信息（os、arch、platform、hostname、cwd、node）；`verbose` 含 uptime、内存、CPU |
| `system_disk`   | 磁盘用量（total/free/used，字节；别名 `df`）                                        |
| `system_memory` | 内存信息（total/free）；`verbose` 含 used、swap                                     |
| `system_path`   | PATH 环境变量条目列表；`verbose` 含 count、existing                                 |

### fs 只读（4）

| 工具      | 说明                                                |
| --------- | --------------------------------------------------- |
| `fs_list` | 列目录；`verbose` 含类型与大小，`recursive` 递归    |
| `fs_read` | 读文件；支持行范围、编码自动检测（GBK/UTF-8）、截断 |
| `fs_stat` | 文件/目录信息（type、size、mtime、birthtime）       |
| `fs_du`   | 目录磁盘用量（类似 `du`）                           |

### fs 变更（6）

| 工具       | 说明                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `fs_write` | 写文件（支持 utf-8/gbk 编码，可追加）                                |
| `fs_mkdir` | 建目录（`recursive` 默认 true，类似 `mkdir -p`）                     |
| `fs_rm`    | 删除文件/目录（`recursive` 删目录树，`force` 忽略不存在；别名 `rm`） |
| `fs_cp`    | 复制文件/目录（目录需 `recursive`；别名 `cp`）                       |
| `fs_mv`    | 移动/重命名；`dest` 已存在则失败，`overwrite` 覆盖（别名 `mv`）      |
| `fs_touch` | 创建空文件或更新 mtime                                               |

### find（1）

| 工具   | 说明                                                                 |
| ------ | -------------------------------------------------------------------- |
| `find` | 按文件名模式递归搜索（Unix find 短名；别名 `fs_find`，支持 \* 通配） |

### text（7）

| 工具           | 说明                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `text_grep`    | 文本搜索（默认字面量，/正则/ 形式启用正则；别名 `grep`）                          |
| `text_head`    | 取前 N 行                                                                         |
| `text_tail`    | 取后 N 行                                                                         |
| `text_wc`      | 统计行/词/字符数（别名 `wc`）                                                     |
| `text_diff`    | 两段文本差异                                                                      |
| `text_replace` | 文本替换（默认字面量，/正则/ 形式启用正则；多命中需 `all`/`maxReplace` 显式表态） |
| `cat`          | 连接/读取文件内容（类似 `cat`；别名 `text_cat`）                                  |

### search（3）

| 工具             | 说明                                              |
| ---------------- | ------------------------------------------------- |
| `search_glob`    | glob 模式匹配文件路径                             |
| `search_content` | 跨文件内容搜索（默认字面量，/正则/ 形式启用正则） |
| `search_which`   | 查找可执行文件路径（类似 `which`/`where`）        |

### process（2）

| 工具           | 说明                  |
| -------------- | --------------------- |
| `process_list` | 列出进程（别名 `ps`） |
| `process_kill` | 终止进程（按 PID）    |

### shell_exec（1）

| 工具         | 说明                                |
| ------------ | ----------------------------------- |
| `shell_exec` | 执行 shell 命令（带超时与编码处理） |

### run_command（1）

| 工具          | 说明                            |
| ------------- | ------------------------------- |
| `run_command` | 直接运行 shell 命令（精简门面） |

### env（3）

| 工具        | 说明         |
| ----------- | ------------ |
| `env_get`   | 读取环境变量 |
| `env_set`   | 设置环境变量 |
| `env_unset` | 删除环境变量 |

### net（7）

| 工具           | 说明                                           |
| -------------- | ---------------------------------------------- |
| `net_get`      | HTTP GET 请求                                  |
| `net_post`     | HTTP POST 请求                                 |
| `net_dns`      | DNS 解析                                       |
| `net_tcp`      | TCP 连接探测                                   |
| `net_listen`   | TCP 监听                                       |
| `net_download` | HTTP 下载文件                                  |
| `ping`         | TCP 连通性探测（类似 `ping`；别名 `net_ping`） |

### pkg（2）

| 工具         | 说明                          |
| ------------ | ----------------------------- |
| `pkg_detect` | 检测包管理器（npm/pnpm/yarn） |
| `pkg_run`    | 运行包脚本                    |

### git（11）

| 工具           | 说明                                        |
| -------------- | ------------------------------------------- |
| `git_status`   | 工作区状态                                  |
| `git_log`      | 提交历史                                    |
| `git_branch`   | 分支列表与切换                              |
| `git_diff`     | 差异                                        |
| `git_add`      | 暂存                                        |
| `git_commit`   | 提交                                        |
| `git_checkout` | 切换分支/恢复文件                           |
| `git_push`     | 推送                                        |
| `git_pull`     | 拉取                                        |
| `git_clone`    | 克隆仓库                                    |
| `git_stash`    | 暂存/恢复变更（`action:'list'` 只读可并发） |

### core（2）

| 工具   | 说明             |
| ------ | ---------------- |
| `pwd`  | 打印当前工作目录 |
| `echo` | 输出文本         |

### hash（1）

| 工具        | 说明                            |
| ----------- | ------------------------------- |
| `hash_file` | 计算文件哈希（md5/sha1/sha256） |

### json（1）

| 工具       | 说明                         |
| ---------- | ---------------------------- |
| `json_get` | 从 JSON 内容取值（路径访问） |

### archive（2）

| 工具              | 说明                 |
| ----------------- | -------------------- |
| `archive_create`  | 创建压缩包（zip）    |
| `archive_extract` | 解压压缩包（zip 等） |

### meta（1）

| 工具        | 说明                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| `batch_run` | 批量编排（多步串行，`assert` 断言，`{{stepId.output.path}}` 模板引用前序输出） |

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

构建产物为多入口 ESM（tsup）：`dist/index.js`（MCP stdio，带 shebang）、`dist/core.js`、`dist/plugin.js`。

### CHANGELOG 维护约定

发版时 `CHANGELOG.md` 条目从 `git log` 的 commit message 汇总提炼，**不要求回顾全量 diff**：

1. 基线：自上个版本标签起（仓库尚无标签时，以最近一次版本提交为基线）；
2. 按 Keep a Changelog 的 Added / Changed / Fixed 分类，并为相关条目补 ADR / 工单交叉引用；
3. 配套要求：commit message 须自带完整主题与 ADR/工单引用（本仓库现有 commit 风格已满足，本约定只是固化现状），使提炼有据可依。

## 项目结构

```
src/
  index.ts          # 入口①：启动 MCP stdio server
  server.ts         # MCP Server 创建与工具分发
  core.ts           # 入口②：通用核心（服务/注册表，无 dsh 依赖）
  plugin.ts         # 入口③：Cordis 插件（apply → ctx.tools），并发分类 + config.exclude
  registry.ts       # 工具注册表（注册全部 58 个工具 + annotations）
  contract/         # 输出契约与错误码
  encoding/         # 编码检测（GBK/UTF-8）
  tools/            # 58 个工具实现，按域分文件
tests/
  server.test.ts    # server 单元测试
  plugin.test.ts    # 插件投影测试
  plugin-integration.test.ts  # 插件 + DSH 环境冒烟
  tools/            # 各工具单元测试 + 并发分类/guard 防漂移护栏
  contract/         # 契约测试
  encoding/         # 编码测试
```

## License

MIT
