# PRD: win-shell-mcp —— AI 的跨平台命令抽象层

Status: ready-for-agent

Date: 2026-08-18

## 问题陈述

AI 在 Windows 上执行命令时反复出错。根因是 AI 训练语料以 Linux 环境为主，肌肉记忆是 bash 语法（`ls`、`cat`、`grep`、`sed`），而 Windows 的 cmd/PowerShell 在命令名、参数语法、引号转义、路径分隔符、输出编码上全部不同：

- 命令名差异：`ls`→`dir`、`grep`→`findstr`
- 引号/转义地狱：Windows 引号嵌套规则混乱
- 路径差异：`/` vs `\`、盘符 `C:`、空格路径、长路径限制
- 编码差异：中文 Windows 默认 GBK (CP936)，AI 输出 UTF-8 导致乱码
- 命令缺失：`grep`、`awk`、`which` 等在原生 Windows 不可用
- PowerShell 执行策略：脚本可能被禁止执行

现状没有现成工具解决这个痛点：官方 filesystem MCP 只做文件 CRUD，社区 shell MCP 只是 `exec` 包装器、不处理跨平台差异，server-fetch / server-git / WinGet 都是碎片化单点工具。**缺少一个统一的、面向 AI 的跨平台命令抽象层。**

## 解决方案

构建 `win-shell-mcp`：一个纯 MCP server（Node.js + TypeScript，stdio 传输），把 Windows 下易出错的命令替换为 AI 可直接调用的结构化工具。AI 不再"写命令"，而是"调用工具"；工具内部用 Node 跨平台 API（`fs`/`path`/`child_process`/`os`）实现，自动处理路径分隔符、编码、跨平台差异，并以 token 最小化的结构化 JSON 返回。

核心设计（参见 ADR-0001~0005 与 CONTEXT.md 词汇表）：

- **短名主名 + 语义化别名**：工具主名用 Unix 短名（`ls`、`cat`、`grep`），同时注册语义化别名（`list_directory`、`read_file`），与官方 filesystem MCP 命名兼容。
- **命令注册表**：每命令域独立模块，声明式注册 短名/别名/参数 schema/描述，server 启动时动态装载，支撑持续扩展。
- **run_command 逃生舱**：`spawn(executable, args, {shell:false})` 参数数组执行，从根源消灭引号/转义/注入问题。
- **信任模式**：全权访问，不做目录/命令白名单（注入风险已由架构消除）。
- **输出精简**：结构化 JSON 只含必要字段、无装饰性格式化、长输出默认截断并提供取更多方式，token 最小化。
- **纯 Node 实现原则**：工具内部不依赖 cmd/PowerShell 作为执行后端。

v1 覆盖八大命令域（ADR-0002）：文件系统、文本处理、搜索、网络、进程、包管理、系统信息、Git。

## 用户故事

1. 作为 AI 编码 agent，我想要用熟悉的 `ls` 命令名列出目录内容（而非记忆 `dir` 的语法），以便我在 Windows 上不再因命令名差异报错。
2. 作为 AI 编码 agent，我想要用 `cat`/`read_file` 读取文件内容，以便读取源码时不受换行/编码/BOM 干扰。
3. 作为 AI 编码 agent，我想要用 `rm` 递归删除文件或目录（支持安全确认参数），以便清理构建产物时不用记 `del /s /q` 或 `Remove-Item -Recurse`。
4. 作为 AI 编码 agent，我想要用 `cp`/`mv` 复制和移动文件，以便处理文件组织时避免 `copy`/`move` 的 Windows 语法坑。
5. 作为 AI 编码 agent，我想要用 `mkdir -p` 语义递归创建目录，以便创建嵌套目录时不需要先创建父目录。
6. 作为 AI 编码 agent，我想要用 `touch` 创建空文件或更新时间戳，以便初始化文件时行为与 Linux 一致。
7. 作为 AI 编码 agent，我想要用 `stat` 获取文件元数据（大小/权限/时间戳），以便判断文件状态而不解析平台相关的 `ls -l` 输出。
8. 作为 AI 编码 agent，我想要用 `find` 按文件名模式递归搜索文件树，以便定位文件时不用记 Windows 的 `dir /s /b`。
9. 作为 AI 编码 agent，我想要用 `grep` 在文件中搜索文本并返回命中位置与行内容，以便定位代码引用时替代 `findstr`。
10. 作为 AI 编码 agent，我想要用 `head`/`tail` 读取文件头部/尾部指定行数，以便快速预览大文件而不会把整个文件读入上下文。
11. 作为 AI 编码 agent，我想要用 `wc` 获取行/词/字节计数，以便了解文件规模。
12. 作为 AI 编码 agent，我想要用 `sed` 的常用子集（替换、行区间删除）做就地文本变换，以便避免在 Windows 上拼写不存在的 `sed`。
13. 作为 AI 编码 agent，我想要用 `awk` 的常用子集（按分隔符取字段）处理文本，以便替代 Windows 上没有的 `awk`。
14. 作为 AI 编码 agent，我想要用 `diff` 比较两个文件/目录的差异，以便了解改动而不依赖 `fc.exe` 的输出格式。
15. 作为 AI 编码 agent，我想要用 `which`/`where` 定位可执行文件的绝对路径，以便确认工具链安装位置。
16. 作为 AI 编码 agent，我想要用文件名搜索与内容搜索工具查找目标文件，以便不依赖平台差异化的搜索命令。
17. 作为 AI 编码 agent，我想要用 HTTP 请求工具（替代 `curl`/`wget`）发起 GET/POST 请求并拿到精简的响应摘要，以便在 Windows 上不因 curl 缺失/参数差异失败。
18. 作为 AI 编码 agent，我想要用 `ping`/DNS 查询工具诊断网络，以便不解析平台不同的输出格式。
19. 作为 AI 编码 agent，我想要用 `ps` 列出进程，以便了解运行中的进程而不记 Windows 的 `tasklist` 参数。
20. 作为 AI 编码 agent，我想要用 `kill` 终止进程（按 pid 或按名称），以便管理失控进程时不记 `taskkill` 语法。
21. 作为 AI 编码 agent，我想要读取/设置环境变量，以便运行程序前配置环境而不记 `set`/`$env:` 差异。
22. 作为 AI 编码 agent，我想要检测并执行包管理器（`npm`/`pip`/`cargo`），以便安装依赖时不必担心 Windows 上的路径与可执行文件后缀。
23. 作为 AI 编码 agent，我想要获取系统信息（OS/磁盘用量/CPU），以便了解环境资源。
24. 作为 AI 编码 agent，我想要常用 Git 操作的封装，以便执行 status/commit/log 等而不记各平台一致的 git 差异（git 本身跨平台，重点在封装高频组合）。
25. 作为 AI 编码 agent，我想要调用 `run_command` 逃生舱执行任意命令（`spawn` 参数数组形式），以便结构化工具未覆盖的场景（启动服务、跑测试）仍可完成。
26. 作为 AI 编码 agent，我想要在 `run_command` 中显式指定工作目录与超时，以便控制长任务行为。
27. 作为 AI 编码 agent，我想要任何命令都能用**短名或别名**调用同一工具，以便我用习惯的名字即可工作。
28. 作为 AI 编码 agent，我想要每个工具的描述中注明「≈ Unix 的 xxx」及 Windows 对应命令，以便我理解工具的语义并正确选用。
29. 作为 AI 编码 agent，我想要工具输出是结构化 JSON 且 token 最小化（无装饰性格式化、长输出默认截断），以便节省上下文窗口并稳定解析。
30. 作为 AI 编码 agent，我想要工具输出在内容被截断时明确告知并给出取更多的方式，以便我按需获取完整数据。
31. 作为 AI 编码 agent，我想要参数缺失或类型错误时返回简短、结构化、可行动的错误，以便我立即修正调用。
32. 作为 AI 编码 agent，我想要文件内容按 UTF-8 读取，并在检测到 GBK/CP936 编码时自动转换，以便中文 Windows 上的文件不再乱码。
33. 作为 AI 编码 agent，我想要所有文件/路径参数自动标准化（`/` 与 `\`、绝对/相对路径），以便我不用手工处理平台路径差异。
34. 作为维护者，我想要新命令以声明式注册方式加入（注册表机制），以便持续扩展命令域而不用改 server 主逻辑。
35. 作为维护者，我想要所有命令都有严谨的测试、最大化测试覆盖，以便功能在 Windows/跨平台上稳定可靠。
36. 作为维护者，我想要测试统一走 MCP 协议层 seam（in-memory transport），以便只测外部行为、不测实现细节。
37. 作为使用者，我想要通过 stdio 传输将 server 接入任意支持 MCP 的客户端（TRAE、Claude Desktop 等），以便零额外配置使用。

## 实现决策

- **技术栈**：TypeScript + 官方 `@modelcontextprotocol/sdk`，交付为纯 MCP server，stdio 传输（无 CLI 入口、无 HTTP 传输）。
- **命令注册表（command registry）**：每命令域为独立模块，声明式注册 短名 / 别名 / 参数 schema（JSON Schema 或等价类型系统）/ 描述；server 启动时动态装载全部工具，短名与别名指向同一实现。
- **八大命令域**：文件系统、文本处理、搜索、网络、进程、包管理、系统信息、Git。域内命令清单以注册表维护，PRD 不逐一列举（见 CONTEXT.md）。
- **run_command 逃生舱**：契约 `spawn(executable, args[], {cwd, timeout, env})`，`shell:false`，不经 shell 解析。支持工作目录、超时、环境变量覆盖。从根源消除引号/转义/注入问题。
- **输出契约**：结构化 JSON，只含必要字段；禁止装饰性格式化；长输出默认截断并返回「截断标记 + 取更多参数」；不重复输出调用已提供的上下文；错误为简短的结构化消息且含可行动建议。
- **编码处理**：读取/执行输出统一按 UTF-8 解码，检测到 GBK/CP936 时自动转换（用 iconv-lite）。Windows 中文环境文件/输出不再乱码。
- **路径处理**：所有文件/路径参数内部标准化（分隔符、绝对/相对、盘符），调用方无需关心平台差异。
- **信任模式**：无目录/命令白名单，全权访问；每个工具 description 提示谨慎使用。安全责任交给宿主客户端的确认机制。
- **纯 Node 实现原则**：工具内部仅用 Node 跨平台 API，不依赖 cmd/PowerShell 作为执行后端。`run_command` 是唯一例外（由 AI 显式指定可执行文件）。
- **工具注册契约**：每个注册项包含 短名、别名列表、参数 schema、description（含「≈ Unix xxx / Windows 对应」）、处理函数；server 按此生成 MCP `tools/list` 与 `tools/call`。

## 测试决策

- **单一测试 seam**：官方 SDK 的 MCP Client ↔ Server（in-memory transport）。所有测试通过 `tools/list` / `tools/call` 断言 MCP 结构化响应。
- **只测外部行为**：不测命令内部实现细节；命令用什么 Node API 不重要，只要通过 MCP 调用返回正确结果。
- **覆盖面**：每个命令域至少覆盖 成功路径 / 参数校验失败 / 边界（不存在文件、空目录、长输出截断、编码乱码、超时）。每个工具同时验证 短名与别名均可调用且结果一致。
- **真实环境集成**：文件操作在 `os.tmpdir()` 下的隔离临时目录中做真实读写；`run_command` 用 `spawn node -e` 跑真实进程验证。
- **框架**：Vitest。
- **测试先例**：本项目为全新代码库，无内部先例；参考官方 `@modelcontextprotocol/sdk` 自带的测试实践作为先例。

## 超出范围

- 注册表 / 服务 / WMI 等 Windows 特有操作（`win-*` 域）——后置，v1 不承诺（ADR-0005）。
- 工具内部依赖 cmd/PowerShell 作为执行后端——禁止（ADR-0005，run_command 逃生舱除外）。
- 面向用户的独立 CLI 入口——不做（run_command 已覆盖命令行调用需求）。
- HTTP/SSE 传输——v1 仅 stdio。
- 目录/命令白名单与沙箱——不做（ADR-0004 信任模式）。
- 有状态功能（会话、缓存、历史）——server 无状态。
- 浏览器自动化、数据库操作等垂直领域——由生态中专门 MCP server 承担，不在本项目范围。

## 补充说明

- 本项目差异化价值：不是又一个 shell 库，而是「面向 AI Agent 的跨平台命令抽象层」，填补「统一命令抽象 + Windows 编码/路径/引号处理」的市场空白。
- 输出 token 最小化是硬性约束（ADR-0003），每个工具的 schema 设计都要为此服务。
- 全面测试覆盖是硬性质量要求（用户明确），每个命令必须有测试，越全面越好。
- 所有实现必须遵守 CONTEXT.md 词汇表术语与 ADR-0001~0005。
