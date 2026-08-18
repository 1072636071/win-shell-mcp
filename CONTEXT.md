# 词汇表

win-shell-mcp 的领域词汇。

## 工具（tool）

MCP server 暴露给 AI 的一个可调用能力。本项目中的每个工具对应一个或多个 Windows 下易出错的命令。

## 短名（short name）

工具的主命名，采用 Unix 风格短名，如 `ls`、`cat`、`grep`。AI 对这类名字有本能调用习惯。参见 ADR-0001。

## 别名（alias）

工具的语义化副命名，如 `list_directory`、`read_file`，与短名指向同一实现。兼顾 MCP 生态命名惯例（与官方 filesystem MCP 命名兼容）。参见 ADR-0001。

## 逃生舱（escape hatch）

`run_command` 工具的定位：允许执行任意命令，但强制 `spawn(executable, args, {shell:false})`，不经过 shell 解析，从根源消灭引号/转义/注入问题。作为结构化工具无法覆盖的场景（启动服务、跑测试）的兜底出口。

## 命令域（command domain）

工具集按功能划分的领域，每个命令域对应一组短名工具。v1 覆盖八大域（参见 ADR-0002）：

1. 文件系统：`ls` / `cd` / `mkdir` / `rm` / `cp` / `mv` / `touch` / `stat` / `find`
2. 文本处理：`cat` / `head` / `tail` / `grep` / `sed` / `awk` / `wc` / `diff`
3. 搜索：`which` / `where` / 文件名搜索 / 内容搜索
4. 网络：HTTP 请求（替代 `curl` / `wget`）、`ping`、DNS 查询
5. 进程：`ps` / `kill` / 环境变量
6. 包管理：检测并执行 `npm` / `pip` / `cargo` 等
7. 系统信息：OS 信息、磁盘用量、CPU 信息
8. Git：常用 Git 操作封装

域内具体命令清单在实施阶段以命令注册表形式维护，不在此处逐一列出。

## 命令注册表（command registry）

支撑「全命令域覆盖 + 持续扩展」的机制：每个命令域独立模块，声明式注册 短名 / 别名 / 参数 schema / 描述，server 启动时动态装载。参见 ADR-0002。

## 信任模式（trust mode）

工具集默认全权访问：文件/进程/run_command 均不做目录或命令白名单。注入风险已由 `spawn(executable, args)` 参数数组架构消除。参见 ADR-0004。

## 输出精简（minimal output）

所有工具输出遵循 token 最小化原则：结构化 JSON 只含必要字段、无装饰性格式化、长输出默认截断并提供取更多方式。参见 ADR-0003。

## 纯 Node 实现原则（pure-node principle）

工具内部一律基于 Node 跨平台 API（fs/path/child_process/os）实现，不依赖 cmd 或 PowerShell 作为执行后端。`run_command` 是唯一例外（AI 显式指定可执行文件，属逃生舱）。参见 ADR-0005。
