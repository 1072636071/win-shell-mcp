# PRD / Spec — 命令扩展批次（12 新命令 + 15 项拓展）

- 状态：ready-for-agent
- 域：fs/text/search/net/process/system/pkg/git + 新增 archive/hash/json
- 类型：task
- 来源：memorial 001-command-coverage-extension（D1-D8 决策，docs/memorial/001-command-coverage-extension/context.md）；覆盖审计报告 docs/memorial/001-command-coverage-extension/sub-task/001.md

## 问题陈述

AI Agent 在 Windows 上做日常开发操作时，win-shell-mcp 的 46 个命令存在两类缺口，把 AI 推回易错的 shell_exec 兜底：

1. **缺失命令**：下载文件到磁盘（net_get 只返回截断 2000 字符的 body 文本，拿不到完整内容也无法落盘）、tar/zip 打包解包（完全无能力）、git 主干工作流缺 checkout/push/pull/clone/stash 五个子命令、文件哈希校验、目录磁盘占用排查、当前时间获取、端口监听排查、JSON 结构化取值。
2. **现有命令能力缺口**：net 无法带认证头调 API、跨文件搜索不支持正则、shell_exec 在 Windows 只能用 cmd 不能用 PowerShell、杀进程杀不掉子进程、写文件父目录不存在即失败、移动文件不能覆盖。另有两个**正确性缺口**：text_replace 会把 GBK 文件静默改写为 UTF-8；text_diff 是朴素逐行对比，插入一行即全文失真，AI 据此判断「改了什么」会出错。

## 解决方案

按 memorial D8 批次清单扩展命令抽象层：新增 12 个命令（含 archive/hash/json 三个新命令域）、拓展现有 13 个命令、顺手修复 2 项一致性缺口。全部命令经命令注册表声明式接入，统一 JSON 极简输出契约，命名遵循「Unix 短名主名 + 语义别名」策略。

兼容性分两阶段（ADR-0007）：本批次处于发布前（0.x）窗口，允许破坏性修改，应借此集中修正不合理设计（编码保持、真 diff、区间语义统一）；正式发布后转入只加不改。

## 用户故事

### 新命令 — P0

1. 作为 AI Agent，我想要把 URL 内容直接下载保存到磁盘文件，以便获取依赖包/二进制/资源文件而不受 2000 字符截断限制
2. 作为 AI Agent，我想要下载后得到保存路径与字节数的确认回执，以便校验下载是否完整
3. 作为 AI Agent，我想要把目录或文件打包为 tar/zip 归档，以便交付构建产物或传输项目快照
4. 作为 AI Agent，我想要解包 tar/zip 归档到指定目录，以便使用下载的依赖与资源包

### 新命令 — git 主干工作流（P1）

5. 作为 AI Agent，我想要切换或创建分支，以便在不同功能线之间工作而不退回 shell_exec
6. 作为 AI Agent，我想要还原工作区文件到某版本，以便撤销误改
7. 作为 AI Agent，我想要推送提交到远端仓库，以便完成交付
8. 作为 AI Agent，我想要拉取远端更新并合并，以便同步他人工作
9. 作为 AI Agent，我想要克隆仓库到本地，以便开始一个全新的代码任务
10. 作为 AI Agent，我想要暂存当前工作区改动并可恢复，以便临时切换任务而不丢改动

### 新命令 — 其他域（P1）

11. 作为 AI Agent，我想要计算文件的 sha256/md5 哈希，以便校验下载完整性与文件去重
12. 作为 AI Agent，我想要递归累计目录占用大小，以便定位 node_modules、构建产物等占空间的目录
13. 作为 AI Agent，我想要列出本机监听端口及占用进程，以便排查「端口被占用」类问题
14. 作为 AI Agent，我想要按路径从 JSON 文件或字符串中取值，以便解析 package.json、CI 输出与 API 响应字段

### 现有命令拓展（P1）

15. 作为 AI Agent，我想要 net_get/net_post 支持自定义请求头，以便调用带 Authorization/API key 的接口
16. 作为 AI Agent，我想要 git_diff 支持指定目标 ref，以便回答「和上次提交比」「和 main 比」
17. 作为 AI Agent，我想要跨文件内容搜索支持正则，以便做模式化代码检索而不逐个文件调 text_grep
18. 作为 AI Agent，我想要进程列表能看到完整命令行，以便在杀进程前确认「它到底在跑什么」
19. 作为 AI Agent，我想要进程名过滤大小写不敏感，以便在 Windows 上不漏匹配
20. 作为 AI Agent，我想要终止进程时连同子进程树一起杀，以便清理 dev server 的 watcher/子进程残留
21. 作为 AI Agent，我想要 shell_exec 可选 PowerShell，以便使用管道/对象等现代 shell 能力
22. 作为 AI Agent，我想要向执行中的命令喂 stdin 数据，以便驱动交互式程序与管道式用法
23. 作为 AI Agent，我想要列目录时按名称/大小/修改时间排序，以便快速定位目标文件
24. 作为 AI Agent，我想要列目录时按类型与 glob 过滤，以便「只看 *.ts」「只看目录」
25. 作为 AI Agent，我想要写文件时自动创建不存在的父目录，以便直接写新路径而不必先调 fs_mkdir
26. 作为 AI Agent，我想要移动文件时允许覆盖已存在目标，以便完成常规的替换式移动
27. 作为 AI Agent，我想要把文件移入一个目录（而非仅重命名），以便整理文件结构
28. 作为 AI Agent，我想要获取当前日期时间，以便生成带时间戳的文件名、日志与提交信息

### 正确性修复（P1）

29. 作为 AI Agent，我想要 text_replace 原地写回时保持文件原编码，以便不静默破坏下游工具依赖的 GBK 文件
30. 作为 AI Agent，我想要 text_diff 输出真实的行级差异，以便插入一行后其余行不被误报为全部变更

### 一致性修复（P2 提拔）

31. 作为 AI Agent，我想要 fs_read 与 cat 的区间语义一致，以便不因选错工具而拿到错位的内容
32. 作为 AI Agent，我想要 env_get 全量返回时可过滤并截断，以便控制 CI 等环境变量较多会话的 token 成本

## 实现决策

### 新域与命名（ADR-0006、命名 ADR）

- 新增三个命令域：**archive**（archive_create / archive_extract）、**hash**（hash_file）、**json**（json_get）。新域闸门：语义独立即可成域，不设规模门槛，逐域论证并回写 CONTEXT.md。
- 所有新命令遵循「Unix 短名主名 + 语义化别名」策略，description 写明「≈ Unix 的 xxx」及 Windows 对应命令。
- 新命令以声明式注册接入命令注册表，不改动 server 分发逻辑。

### 新命令契约（12 个）

- **net_download**（net 域，独立命令，非 net_get 参数）：url + 目标路径 → 落盘并返回 `{saved, bytes, path}` 回执；net_get 保持「返回 body 文本」单一形态不变。
- **archive_create / archive_extract**（archive 域）：tar/zip 打包与解包；Windows 平台可借助系统 tar.exe，跨平台优先纯 Node 实现（遵循纯 Node 无 PowerShell 依赖的既有约束）。
- **git_checkout / git_push / git_pull / git_clone / git_stash**（git 域内补全）：覆盖切换/创建分支、还原文件、推送、拉取、克隆、暂存/恢复。
- **hash_file**（hash 域）：基于 node:crypto 计算文件 sha256/md5 摘要。
- **fs_du**（fs 域，非 system_disk 扩展）：递归累计目录大小，操作对象是目录树而非文件系统。
- **net_listen**（net 域）：列出本机监听端口及占用进程。
- **json_get**（json 域）：按路径表达式从 JSON 文件/字符串取值（jq-lite 子集）。

### 现有命令拓展契约（13 项）

- net_get / net_post：新增可选 `headers`（自定义请求头）。
- git_diff：新增可选 `against`（目标 ref）。
- search_content：pattern 支持正则（与 text_grep 的正则形式对齐）。
- process_list：verbose 增加 cmdline；filter 改为大小写不敏感（发布前窗口允许的行为修正）。
- process_kill：新增可选 `tree`（进程树终止）。
- shell_exec：新增可选 `shell`（cmd / powershell / auto）。
- shell_exec / run_command：新增可选 `stdin`。
- fs_list：新增排序（名称/大小/修改时间）与类型/glob 过滤；verbose 补 mtime。
- fs_write：支持自动创建不存在的父目录（默认行为在实现 issue 中定，倾向 AI 直觉优先）。
- fs_mv：新增可选 `overwrite`；dest 为目录时语义化为移入该目录。
- system_info：增加当前时间（ISO 8601）——选扩展落地，不单列命令。
- **正确性修复**：text_replace 原地写回沿用源文件编码（检测为 GBK 则写回 GBK）；text_diff 引入真行级 diff 算法（LCS/Myers），替换按索引逐行配对。

### 一致性修复（2 项）

- 统一 fs_read 与 cat 的区间语义（含/不含端点对齐，借发布前窗口消除重叠歧义）。
- env_get 全量返回新增 filter 与截断，对齐极简输出原则。

### 明确不做（本批）

- M9-M14（符号链接、watch、base64、剪贴板、CSV、open）与 P2 拓展其余 17 项：按「AI 高频场景唯一标准」留 shell_exec 兜底，待真实使用信号再议。

## 测试决策

- **Seam**：唯一 seam 为 server 层 `callTool(name, args)`（查找工具 → 参数验证 → handler → 统一输出契约）。不新建 seam。全部新命令与拓展经此 seam 做行为测试。
- **好测试标准**：只测外部行为（输出契约字段、错误码、副作用落盘结果），不测内部实现（不 mock 内部模块、不断言调用次数）。
- **测试先例**：
  - fs/archive/hash/json 类：tests/tools/fs_read.test.ts、fs_write.test.ts 的临时目录 + 真实文件副作用断言模式。
  - git 类：临时 git 仓库先例（git 域测试）。
  - net_download / net_listen / headers：tests/tools/net.test.ts 的本地 HTTP server 模式。
  - server 层别名/参数验证：tests/server.test.ts。
  - 正确性修复：text_replace 编码保持需构造 GBK 样本文件断言写回编码不变；text_diff 需断言「插入一行仅影响对应 hunk」。
- 覆盖率沿用仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）。

## 超出范围

- P2 清单 23 项（见「明确不做」）。
- streamable HTTP 传输、沙箱/权限模型（既有 ADR 已定论，不变）。
- 后台执行/任务管理面（E-14）、注册表级环境变量持久化（E-30）：超本批，留后续决策。
- watch 类长驻能力：与 MCP 单次调用模型不匹配，明确留兜底。
- 参数级细节（inputSchema 字段名、错误码、截断阈值）：按 memorial D3 留给实现 issue。

## 补充说明

- 所有决策的完整追问与论证过程见 memorial：`docs/memorial/001-command-coverage-extension/context.md`（D1-D8）与 `docs/memorial/001-command-coverage-extension/sub-task/001.md`（47 条审计明细，含每条缺口在源码中的位置与新命令/扩展二选一的去重说明）。
- 全局决策已回写：CONTEXT.md（三新域术语 + 命令域扩展 + 兼容性红线）、docs/adr/0006（新域设立）、docs/adr/0007（兼容性红线）。
- 实施拆分建议：两个正确性修复（text_replace 编码、text_diff 真 diff）优先排期；git 五个子命令可作为独立 issue；archive 域涉及跨平台归档实现，建议单独 issue 并先定纯 Node vs 系统 tar 的取舍。
