# AI 工具速查表

> 面向 AI 的极简速查：每个工具一行（正名｜一句话用途｜关键参数｜别名），按 15 命令域分节。
> 人类向完整说明见 `README.md`「工具清单」节；本表只锁结构与 registry 对账（见 `tests/tools/guard-cheatsheet.test.ts`），一句话用途允许人工措辞演化。
> 域内顺序与 `src/registry.ts` 的 `builtinTools` 注册顺序一致；别名以 registry 的 `aliases` 字段为单一事实源。
> 关键参数只列高频/有坑字段（含默认值与边界），不是全量 schema 复述——首次调用写错的坑（如 `endByte` 0-based 含、`encoding` 默认 auto、pattern 双模语义）在此标明。

## system

| 正名            | 一句话用途                            | 关键参数                      | 别名 |
| --------------- | ------------------------------------- | ----------------------------- | ---- |
| `system_info`   | 系统信息（os/arch/hostname/cwd/node） | `verbose` 加 uptime/cpus/内存 | —    |
| `system_disk`   | 磁盘用量（total/free/used，字节）     | `all=true` 枚举所有盘         | `df` |
| `system_memory` | 内存信息（total/free，字节）          | `verbose` 加 used/swap        | —    |
| `system_path`   | PATH 条目列表                         | `verbose` 加 count/existing   | —    |

## fs

| 正名       | 一句话用途             | 关键参数                                                             | 别名                   |
| ---------- | ---------------------- | -------------------------------------------------------------------- | ---------------------- |
| `fs_list`  | 列目录，返回相对路径   | `verbose` 加 type/size/mtime；`recursive`；`sort`/`type`/`glob` 过滤 | `ls`, `list_directory` |
| `fs_read`  | 读文件                 | `start`/`end` 行范围（1-indexed 闭区间）；编码 auto；截断            | —                      |
| `fs_stat`  | 文件/目录元信息        | 返回 type/size/mtime/birthtime                                       | —                      |
| `fs_write` | 写文件                 | `encoding` utf-8/gbk；`append`；`mkdirParents` 默认 true             | —                      |
| `fs_mkdir` | 建目录                 | `recursive` 默认 true（≈ mkdir -p）                                  | —                      |
| `fs_rm`    | 删除文件/目录          | `recursive` 删目录树；`force` 忽略不存在                             | `rm`                   |
| `fs_cp`    | 复制文件/目录          | 目录需 `recursive`                                                   | `cp`                   |
| `fs_mv`    | 移动/重命名            | `dest` 为目录时移入；`overwrite` 覆盖                                | `mv`                   |
| `fs_touch` | 创建空文件或更新 mtime | —                                                                    | —                      |
| `fs_du`    | 递归累计目录大小       | `verbose` 加 files/dirs                                              | `du`                   |

## text

| 正名           | 一句话用途                    | 关键参数                                                                                                                                                     | 别名       |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `text_grep`    | 单文件搜匹配行                | pattern 默认字面量子串（元字符原样、反斜杠免转义）；`/正则/` 启用正则（flags i/m/s）；歧义向字面量收敛；`context` 上下行                                     | `grep`     |
| `text_head`    | 取文件头 N 行                 | `n` 默认 10                                                                                                                                                  | —          |
| `text_tail`    | 取文件尾 N 行                 | `n` 默认 10                                                                                                                                                  | —          |
| `text_wc`      | 统计行/词/字符/字节数         | —                                                                                                                                                            | `wc`       |
| `text_diff`    | 生成 unified diff（LCS 行级） | `same` 表示是否完全相同                                                                                                                                      | —          |
| `text_replace` | 文件内查找替换                | pattern 同 text_grep；`/正则/` 加 `g` 表全量；`replacement` 纯字面（正则模式支持 `$1`/`$&`）；0 命中报错、多命中须 `all`/`maxReplace` 表态；`write` 原地写回 | —          |
| `cat`          | 读文件整体                    | 编码 auto（GBK/UTF-8）；字节范围 0-based 含；行范围 1-based 含；截断                                                                                         | `text_cat` |

## search

| 正名             | 一句话用途               | 关键参数                                        | 别名                                   |
| ---------------- | ------------------------ | ----------------------------------------------- | -------------------------------------- |
| `search_glob`    | glob 匹配文件路径        | 支持 `*`、`**`、`?`、`[]`                       | —                                      |
| `search_content` | 跨文件递归搜内容         | pattern 同 text_grep；返回 `[{file,line,text}]` | —                                      |
| `search_which`   | 在 PATH 中定位可执行文件 | Windows 自动尝试 .exe/.cmd/.bat/.ps1            | —                                      |
| `find`           | 按文件名模式递归找文件   | 支持 `*` 通配；非内容搜索                       | `fs_find`, `search_file`, `find_files` |

## process

| 正名           | 一句话用途     | 关键参数                                                                          | 别名 |
| -------------- | -------------- | --------------------------------------------------------------------------------- | ---- |
| `process_list` | 列出运行中进程 | `verbose` 加内存/命令行；`maxResults` 截断                                        | `ps` |
| `process_kill` | 终止进程       | `pid` 或 `name` 至少其一；`signal` 默认 SIGTERM；`force` SIGKILL；`tree` 连子进程 | —    |

## shell_exec

| 正名         | 一句话用途            | 关键参数                                            | 别名 |
| ------------ | --------------------- | --------------------------------------------------- | ---- |
| `shell_exec` | 执行 shell 命令字符串 | 管道/重定向/通配由 shell 解释；非零退出码是正常结果 | —    |

## env

| 正名        | 一句话用途   | 关键参数                        | 别名 |
| ----------- | ------------ | ------------------------------- | ---- |
| `env_get`   | 读取环境变量 | `name` 指定单个；省略返回全部   | —    |
| `env_set`   | 设置环境变量 | 写入 process.env 对后续会话生效 | —    |
| `env_unset` | 删除环境变量 | 从 process.env 移除             | —    |

## net

| 正名           | 一句话用途                 | 关键参数                                                    | 别名           |
| -------------- | -------------------------- | ----------------------------------------------------------- | -------------- |
| `net_get`      | HTTP GET                   | `body` 截断（阈值默认 2000，随截断环境变量）                          | —              |
| `net_post`     | HTTP POST                  | `json=true` 设 Content-Type；`headers` 覆盖                 | —              |
| `net_dns`      | DNS 解析                   | `recordType` 默认 A，支持 A/AAAA/CNAME/MX/TXT               | —              |
| `net_tcp`      | TCP 可达性探测             | `timeout` 默认 3000ms；`reachable` 非错误                   | —              |
| `net_listen`   | 列出本机监听端口及占用进程 | `filter` 按端口/协议/地址/进程名                            | `listen_ports` |
| `net_download` | 下载 URL 到本地文件        | 流式写入；支持重定向                                        | `wget`         |
| `ping`         | TCP 探测 ping 诊断         | 返回 sent/received/loss/alive；不可达返回 ok（alive=false） | `net_ping`     |

## pkg

| 正名         | 一句话用途         | 关键参数                   | 别名 |
| ------------ | ------------------ | -------------------------- | ---- |
| `pkg_detect` | 检测包管理器可用性 | npm/yarn/pnpm/pip/cargo 等 | —    |
| `pkg_run`    | 执行包管理器命令   | 非零退出码是正常结果       | —    |

## git

| 正名           | 一句话用途              | 关键参数                                                                | 别名       |
| -------------- | ----------------------- | ----------------------------------------------------------------------- | ---------- |
| `git_status`   | 仓库状态                | 返回 branch/changed/staged/untracked；`verbose` 加 files                | —          |
| `git_log`      | 提交历史                | `limit` 默认 10；`verbose` 完整 40 字符 hash                            | —          |
| `git_branch`   | 分支列表                | `verbose` 加 all（含 remote 上游）                                      | —          |
| `git_diff`     | git 差异                | `staged` 显示暂存区；`against` 指定 ref；`path` 限范围；默认截断        | —          |
| `git_add`      | 暂存文件                | —                                                                       | —          |
| `git_commit`   | 提交暂存变更            | `amend` 修改上一提交；不推送                                            | —          |
| `git_checkout` | 切换/创建分支或还原文件 | `branch` 切换；`create=true` 创建；`paths` 还原（可配 `branch` 源 ref） | `checkout` |
| `git_push`     | 推送到远程              | `remote` 默认 origin；`force` 强制推送                                  | `push`     |
| `git_pull`     | 拉取并合并              | `remote` 默认 origin                                                    | `pull`     |
| `git_clone`    | 克隆仓库                | —                                                                       | `clone`    |
| `git_stash`    | 暂存/恢复工作区变更     | `action` push/pop/list/drop，默认 push                                  | `stash`    |

## core

| 正名   | 一句话用途           | 关键参数                                       | 别名 |
| ------ | -------------------- | ---------------------------------------------- | ---- |
| `pwd`  | 当前工作目录绝对路径 | —                                              | —    |
| `echo` | 回显参数             | `format=text` 空格拼接；`format=json` 原始数组 | —    |

## run_command

| 正名          | 一句话用途     | 关键参数                                                         | 别名 |
| ------------- | -------------- | ---------------------------------------------------------------- | ---- |
| `run_command` | 结构化执行命令 | `args` 数组，不经 shell 解析（无管道/通配/注入）；适合带空格路径 | —    |

## archive

| 正名              | 一句话用途 | 关键参数                                         | 别名                         |
| ----------------- | ---------- | ------------------------------------------------ | ---------------------------- |
| `archive_create`  | 创建归档   | `format` tar/tar.gz/zip(STORE)；默认按扩展名推断 | `tar_create`, `zip_create`   |
| `archive_extract` | 解压归档   | 支持 tar/tar.gz/zip；`dest` 默认归档所在目录     | `tar_extract`, `zip_extract` |

## hash

| 正名        | 一句话用途   | 关键参数                                                    | 别名                  |
| ----------- | ------------ | ----------------------------------------------------------- | --------------------- |
| `hash_file` | 计算文件摘要 | `algorithm` 默认 sha256，支持 sha1/md5/sha512；流式读大文件 | `sha256sum`, `md5sum` |

## json

| 正名       | 一句话用途         | 关键参数                   | 别名 |
| ---------- | ------------------ | -------------------------- | ---- |
| `json_get` | 按路径从 JSON 取值 | 路径仅 `.foo.bar` 与 `[0]` | `jq` |

## meta

> 编排/导航类元工具，不占 15 命令域名额。`tool_groups`/`list_domain_tools` 为懒加载导航（11 号工单），`batch_run` 为多步编排。

| 正名                | 一句话用途                             | 关键参数                                                                                                            | 别名 |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---- |
| `batch_run`         | 多步操作编排，一次完成避免多轮往返     | `steps` 串行短路；`assert` 10 种操作符；引用 `{{stepId.output.path}}`；默认 `{allOk,summary}`，`verbose` 取每步详情 | —    |
| `tool_groups`       | 浏览 15 域概览（用途/工具数/代表工具） | 只读无参数；先定位域再调 `list_domain_tools`                                                                        | —    |
| `list_domain_tools` | 取指定域全部工具完整定义               | `domain` 为 15 域之一；只读                                                                                         | —    |

## 环境变量

| 变量                 | 语义                                                             | 默认             | 所属工单        |
| -------------------- | ---------------------------------------------------------------- | ---------------- | --------------- |
| `WIN_SHELL_TOOLS`    | 工具白名单，逗号分隔正名；仅暴露列出的工具；含未知条目启动即失败 | 未设置=全量暴露  | 12 号（已落地） |
| `WIN_SHELL_LAZY`     | 懒加载开关，仅精确等于 `1` 启用；ListTools 只返回 3 个 meta      | 未设置=全量模式  | 11 号（已落地） |
| `WIN_SHELL_TRUNCATE` | 输出截断阈值（正整数；非法值启动失败）                           | 未设置=2000       | 15 号（已落地） |
