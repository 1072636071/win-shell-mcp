---
name: jx-mode
description: JX 工作模式细则：工具优先使用 win-shell-mcp（跨平台确定性命令抽象层），并把过程中值得记住的事实沉淀到 JXK 知识库。本技能随 JX 模式 preset 携带，进入该模式的会话应在开始任务前加载它。
metadata:
  version: 1.1.0
---

# JX 模式细则

JX 模式 = 标准能力 + 两条规则。规则要点已写在 persona 里，本文件是执行细则。

## 规则一：工具优先 win-shell-mcp

| 要做的事 | 绕开 | 优先调用 |
| --- | --- | --- |
| 读文件 | 内置 read / `cat` / `Get-Content` | `fs_read`（带行号）；要原始全文用 `cat` |
| 写/覆盖文件 | 内置 write / 重定向 | `fs_write`（默认 utf-8，支持 gbk 与追加） |
| 定点修改 | 内置 edit | `text_replace`（正则 + `$1` 回引用） |
| 找文件路径 | 内置 glob / `find` | `search_glob`；按名字递归找用 `find` |
| 搜内容 | 内置 grep / `grep` | `search_content`（跨文件）；单文件带上下文用 `text_grep` |
| 列目录 | `ls` / 内置列目录 | `fs_list`（glob 过滤、recursive、sort） |
| 复制/移动/删除/建目录 | `cp` `mv` `rm` `mkdir` | `fs_cp` / `fs_mv` / `fs_rm` / `fs_mkdir` |
| 元数据 | `stat` `touch` `du` | `fs_stat` / `fs_touch` / `fs_du` |
| 执行外部程序 | 直调 pwsh/bash/cmd | `run_command`（argv 直执行，不经 shell 解析）；确需 shell 语法时 `shell_exec` |
| 环境变量 | `$env:` / export | `env_get` / `env_set` / `env_unset` |
| 进程 | tasklist / kill | `process_list` / `process_kill` |
| 包管理 | 直调 npm/pip | `pkg_detect` 探测 → `pkg_run` 执行 |
| git | 手敲 git 命令 | `git_status` `git_add` `git_commit` `git_diff` `git_log` `git_branch` `git_checkout` `git_clone` `git_pull` `git_push` `git_stash` |
| HTTP | curl / fetch | `net_get` / `net_post`；下载落盘用 `net_download` |
| 网络诊断 | ping/nslookup/netstat | `ping` / `net_dns` / `net_tcp` / `net_listen` |
| 归档 | tar / zip | `archive_create` / `archive_extract` |
| 校验和 | sha256sum | `hash_file` |
| JSON 取值 | jq | `json_get` |
| 系统信息 | uname / df / free | `system_info` / `system_disk` / `system_memory` / `system_path` |

### 回退规则

win-shell-mcp 是首选，不是枷锁。以下情况允许回退到内置工具：

- **MCP 未连接或工具不存在**：直接用内置工具，无需解释。
- **调用失败且换内置确实能成**：回退一次即可，并在回复中注明「`<工具名>` 失败（错误码），已回退」。禁止反复重试同一失败调用。
- **交互式/TUI 场景**（需要人实时输入的程序）：win-shell-mcp 覆盖不了，改用内置方案并告知局限。
- **需要沙箱审批语义的场景**：DSH 内置 pwsh/write/edit 自带沙箱与审批策略；涉及越权重试时以内置通道为准。

边界提醒：复杂管道、重定向属于 shell 语法范畴——先考虑 `shell_exec`（它本来就是 win-shell-mcp 的兜底通道），仍不行才回退内置 shell。

## 规则二：事实记忆写入 JXK

### 记什么（满足任一即记）

- **决策及理由**：技术选型、方案取舍、用户拍板的结论。
- **根因结论**：bug 的真正原因、修复方式、复现条件。
- **环境约束**：特殊路径、版本要求、编码坑（GBK）、服务端口这类下次还会踩的事实。
- **外部系统行为**：第三方 API / MCP 工具的非显然行为。
- **用户的明确偏好**：用户在对话中立下的规矩。

### 不记什么

- 密钥、token、密码等敏感信息（用户明确要求除外）。
- 临时中间状态、一次性命令输出。
- 打开代码或文档就能直接看到的常识。
- 未经验证的猜测。

### 怎么记

- 默认 `add_fact`：50~200 字，一条只讲一个事实；content 用中英双语格式 `中文 | English`。
- tags 必填，双语命名空间格式 `namespace:中文/English`，至少两个维度，例如：
  - `project:<项目名>/<project-name>`（归属项目）
  - `type:决策/decision`、`type:根因/root-cause`、`type:环境/environment`
- 成体系的长知识（完整方案、教程）先写成 `.md` 文件再 `add_document`；零散事实可用 `source_document_uuid` 挂到来源文档下。
- 拿不准要不要记：记。宁可多存一条短事实，也不要让同一个坑踩两次。

### 项目路由与接口差异

- **连接的是 jxk（JxKnowledgeBase）多租户接口**：工具带 `project_name` 参数。先 `list_projects` 找当前项目的同名库，有就用；没有按约定 `create_project` 新建（jxk 仓库 `data/projects/<name>/` 下）；跨 repo 的通用事实拿不准就问用户放哪。
- **连接的是旧版 imageTUTU 单租户接口**（工具无 `project_name` 参数，如 DSH profile 当前配置）：直接录入即可，该库已整体迁移为 jxk 的 `imagetutu` 项目，数据同源。

### 时机

- 过程中出现重大事实（决策、根因）→ 当场记，别攒到最后丢上下文。
- 任务收尾 → 回顾一遍补漏，剩余事实一次批量补齐。

## 任务开始：先查再干

进入 JX 模式后，若任务涉及已有领域知识，先花一次 `search_content` 查 JXK（减少重复搜索成本）。查到了直接引用出处 UUID；没查到正常开工，过程中产生的新事实回流入库。

## 护栏

- **输出契约不动**：win-shell-mcp 成功 `{ok:true,...}`、失败 `{ok:false,error:{code,message}}`；向用户汇报时翻译成人话，不要原样倾倒 JSON。
- **长输出先看截断标记**：默认 2000 字符截断；确实要全量再加 `verbose:true`，不要凭截断输出下结论。
- **破坏性操作照旧谨慎**：`fs_rm`、`fs_mv` 覆盖、`git_push --force` 这类操作，标准模式该确认的这里照样确认。

## 反模式

- **嘴上 JX 模式，手上内置工具**——映射表里有的操作却直写 shell，是最常见的失效方式。
- **把 JXK 当聊天记录**——流水账式记录每次调用会稀释知识库检索质量，只记可复用的事实。
- **失败后静默换工具**——回退可以，但不注明原因会让用户误以为一切正常。

## 异常处理

| 场景 | 处理方式 |
| ---- | -------- |
| 知识库 MCP 未连接 | 正常完成任务；结束时提示「有 N 条事实待录入」，并列出事实草稿 |
| `add_fact` 返回重复（is_duplicate=true） | 不重复录入；内容需修正时改用更新接口改原条目 |
| win-shell-mcp 与内置工具结果不一致 | 以 win-shell-mcp 为准复查一次；确认是它的 bug 则回退内置，并把这条差异作为事实记入 JXK |
| 用户中途要求退出 JX 模式 | 切换会话模式即可；已录入的事实保留 |
