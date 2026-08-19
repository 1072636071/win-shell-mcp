# PRD / Spec — win-shell-mcp

- 状态：ready-for-agent
- 域：全命令域（fs/text/search/net/process/system/pkg/git）
- 类型：task

## 1. 概述

AI 原生的跨平台命令抽象层。以 MCP Server 形态提供确定性命令工具集，抹平 Windows/Linux/macOS 在路径、编码、引号、命令可用性上的差异，替代 AI 直接编写 shell 命令。统一 JSON 极简输出，降低 token 消耗。

## 2. 定位与交付

- 定位：可发布开源产品（npm 包 + MCP Server），面向所有 AI 客户端（Claude Desktop / Cursor / Trae / 通义灵码等）。
- 交付形态：仅 MCP Server，命令以 MCP tool 暴露；无 CLI 层、不拆分独立核心库（ADR-0001）。
- 技术栈：TypeScript + 官方 `@modelcontextprotocol/sdk`，Node ≥ 18，tsup 打包，stdio 传输（HTTP 后续可选项）。
- 安全模型：无沙箱全权限，与裸 shell 等价（ADR-0002）。

## 3. 架构

```
src/
├── index.ts              # MCP server 入口，注册全部工具
├── types.ts              # 工具上下文、参数/结果类型
├── utils/
│   ├── result.ts         # ok/err 序列化（极简 JSON）
│   ├── encoding.ts       # GBK/UTF-8 自动检测与转换
│   └── path.ts           # 路径标准化
└── commands/             # 每域一个模块，导出 tool 定义数组
    ├── fs.ts  ├── text.ts  ├── search.ts  ├── net.ts
    ├── process.ts  ├── system.ts  ├── pkg.ts  └── git.ts
```

## 4. 输出契约（极简 + verbose）

- 成功：`{"ok":true,"data":<最小字段集>}`
- 失败：`{"ok":false,"error":{"code":"<机器可读错误码>","message":"<一行中文提示>"}}`
- `verbose`（可选参数，默认 false）：开启后返回完整字段；关闭时省略冗余字段、长内容截断。
- 截断规则：文本内容默认截断至约 2000 字符，并附 `"truncated":true`。
- 路径输出优先相对路径（基于 cwd），仅当用户要求绝对路径时用绝对。

## 5. 命令域与工具清单

> 共 46 个工具。部分工具采用 Unix 短名为主 + 语义别名（ADR-0001），如 `find` 别名 `fs_find`、`fs_list` 别名 `ls`/`list_directory`；`tools/list` 与 `tools/call` 均支持别名解析（工单 02/04）。

### core 域（src/commands/core.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| pwd | 无 | 返回当前工作目录绝对路径 |
| echo | args[], [format] | 回显参数数组（text 空格拼接 / json 原始数组） |
| run_command | command, args[], [cwd], [env], [timeoutMs] | 以参数数组直接执行，不经 shell 解析；超时返回 EXEC_TIMEOUT（工单 03） |

### fs 域（src/commands/fs.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| fs_list | path | 列目录：`{"names":[相对路径]}`，verbose 含 type/size；别名 `ls`/`list_directory` |
| fs_read | path, [range], [verbose] | 读文件（编码自动检测），支持行/字节范围 |
| fs_write | path, content | 写文件（UTF-8，可指定 encoding） |
| fs_mkdir | path, [recursive] | 建目录 |
| fs_rm | path, [recursive] | 删除文件/目录 |
| fs_cp | src, dest, [recursive] | 复制 |
| fs_mv | src, dest | 移动/重命名 |
| fs_stat | path, [verbose] | 文件信息（type/size/mtime） |
| fs_touch | path | 创建空文件或更新 mtime |

### text 域（src/commands/text.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| text_grep | path, pattern, [caseInsensitive], [context] | 行内匹配：`[{line, text}]`，内容截断 |
| text_head | path, [n=10] | 前 n 行 |
| text_tail | path, [n=10] | 后 n 行 |
| text_wc | path | 行/词/字符数 |
| text_diff | a, b | 两段文本差异（简化 LCS，输出统一 diff 风格） |
| text_replace | path, pattern, replacement, [inPlace] | 替换（默认返回结果文本；inPlace 写回） |
| cat | path, [encoding], [startLine], [endLine], [startByte], [endByte] | Unix cat：读文件，编码 auto 识别（GBK/UTF-8）、范围、截断 |

### search 域（src/commands/search.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| find | pattern, [path], [maxDepth], [verbose] | Unix find：按文件名通配递归搜索；别名 `fs_find`/`search_file`/`find_files`（工单 04） |
| search_glob | dir, pattern, [recursive], [exclude] | glob 匹配文件路径列表（支持忽略规则） |
| search_content | dir, pattern, [text], [recursive], [exclude] | 跨文件内容搜索：`[{file, line, text}]`（支持忽略规则） |
| search_which | command | 在 PATH 中定位可执行文件 |

### net 域（src/commands/net.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| net_get | url, [timeoutMs], [verbose] | HTTP GET：`{status, body(截断)}` |
| net_post | url, [body], [json] | HTTP POST（json 或 text） |
| net_dns | host | DNS 解析：`{addresses}` |
| net_tcp | host, port, [timeoutMs] | TCP 可达性检测：`{reachable}` |
| ping | host, [count], [port], [timeoutMs] | 网络诊断：TCP 连通性探测 `{sent, received, loss, avg, alive}`（工单 07） |

### process 域（src/commands/process.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| process_list | [filter] | 进程列表（Windows tasklist / unix ps）：`[{pid, name}]` |
| process_kill | [pid] / [name], [force] | 终止进程（Windows taskkill / unix signal；支持按名称终止，工单 08） |
| env_get | [name] | 读取环境变量 |
| env_set | name, value | 设置子进程环境变量（作用于后续 shell_exec 会话） |
| env_unset | name | 删除环境变量 |
| shell_exec | command, [cwd], [timeoutMs] | 兜底执行：`{exitCode, stdout, stderr}` |

### system 域（src/commands/system.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| system_info | 无 | OS/arch/platform/hostname/cwd/node 版本 |
| system_disk | [path] | 磁盘用量（Windows 用 powershell，unix 用 statfs） |
| system_memory | 无 | 内存总/可用 |
| system_path | 无 | PATH 条目列表 |

### pkg 域（src/commands/pkg.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| pkg_detect | 无 | 检测可用包管理器：`{npm, pnpm, yarn, bun, pip, cargo, go, python}` |
| pkg_run | manager, args[], [cwd] | 执行包管理器命令（转发 shell_exec 能力） |

### git 域（src/commands/git.ts）
| tool | 参数 | 行为 |
| --- | --- | --- |
| git_status | [cwd] | 简洁状态：`{branch, ahead, behind, staged[], unstaged[], untracked[]}` |
| git_log | [n=10], [cwd] | 最近提交：`[{hash, author, date, subject}]` |
| git_branch | [cwd] | 当前分支与本地分支列表 |
| git_diff | [cwd], [staged] | 工作区/暂存区 diff（截断） |
| git_add | files[], [cwd] | 暂存文件 |
| git_commit | message, [cwd] | 提交（不 push） |

## 6. 编码策略

- 读文本：优先 UTF-8 严格解码；出现替换字符 U+FFFD 时回退 iconv-lite 按 GBK 解码（Windows 中文环境）。BOM 优先。
- 子进程输出（shell_exec/proc_list/git）：对 stdout/stderr 缓冲区执行同样检测。
- 依赖：`iconv-lite`。

## 7. 错误码约定

- `ENOENT` 路径不存在 / `EACCES` 无权限 / `EISDIR` 是目录而非文件 / `ENOTDIR` 不是目录 / `EINVAL` 参数非法 / `EUNKNOWN` 未知错误
- `ETIMEOUT` 操作超时 / `EEXEC` 执行失败（旧通用码，保留兼容）
- `INVALID_URL` 非法 URL / `NET_TIMEOUT` 网络超时 / `NET_FAIL` 网络连接失败（net 域）
- `PROC_NOT_FOUND` 进程不存在 / `PROC_KILL_FAIL` 终止进程失败（process 域）
- `EXEC_FAIL` 命令执行失败 / `EXEC_TIMEOUT` 命令执行超时（exec 相关）
- `GIT_FAIL` git 命令失败（git 域，附 stderr 摘要）

## 8. 测试计划

- 框架：vitest。
- 每域独立测试文件（tests/*.test.ts），覆盖：正常路径、边界（空目录、大文件、特殊字符路径、中文/GBK 文件）、错误路径（不存在/无权限/非法参数）。
- 跨平台：Windows 与 unix 分支各写用例；CI 矩阵（windows-latest / ubuntu-latest / macos-latest）。
- 集成测试：MCP server 启动 + 通过 client 调用部分代表性工具。
- 覆盖率目标：lines/functions/statements ≥ 85%，branches ≥ 84%（跨平台工具含平台专属分支，单平台无法全覆盖）。

## 9. 实施顺序

1. 脚手架 + 核心 utils
2. fs → text → search → system（纯 JS 域，先立测试基线）
3. process → net → pkg → git（含子进程/网络）
4. MCP 入口注册 + 集成测试
5. 构建（tsup）、CI（GitHub Actions）、README

## 10. 里程碑验收

- `npm run build` 通过，产出单文件 dist。
- `npm test` 全绿，覆盖率达标。
- 任一 AI 客户端可配置 `npx win-shell-mcp` 启动并调用全部工具。
