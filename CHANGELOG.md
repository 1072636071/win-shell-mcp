# Changelog

本文件记录 win-shell-mcp 的显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 0.x 语义化（0.x 发布前窗口允许破坏性修改，正式发布后只加不改，见 ADR-0007）。

## [0.2.0] - 2026-08-25

### Added

- **DSH / Cordis 插件入口**：新增 `./core` 与 `./plugin` 两个子入口（配 `.` 默认 MCP 入口），
  `apply(ctx, config)` 全量注册 58 工具到 `ctx.tools.defineTool`，支持 `config.exclude` 按名裁剪
  （系列决策见 ADR-0010/0011/0012）。
- **并发分类**：以 MCP 标准 `ToolAnnotations.readOnlyHint` 为单一事实源（ADR-0014）派生
  dsh 的 `isConcurrencySafe`（只读→并发；其余 fail-closed 独占）；参数级例外走插件层小覆盖表，
  当前含 `git_stash action:'list'`（只读可并发）。`@deepseek-ai/dsh-tools`/`@deepseek-ai/cordis`
  为 optional peer dep。
- **工具扩充至 58 个**：新增 `fs_du`、`fs_find`(find)、`text_cat`(cat)、`net_ping`(ping)、
  `net_listen`、`net_download`、`run_command`、`pwd`、`echo`、`hash_file`、`json_get`、
  `archive_create`、`archive_extract` 及 git `checkout`/`push`/`pull`/`clone`/`stash`。
- **防漂移护栏**：guard/并发/投影测试组强制每个工具声明非空 `outputSchema` 与显式 `readOnlyHint`
  （只读 34 + 变更 24 + 总数 58）。

### Changed

- 版本号不再覆盖旧版；首次发布 58 工具 + 双入口形态（registry `latest` 0.1.0 → 0.2.0）。

## [Unreleased]

### ⚠️ Changed（破坏性变更）：`text_replace` 从纯正则改为双模 + 安全三分支

依据 ADR-0013（pattern 双模统一与误用可观测层），`text_replace` 与 `text_grep`/`search_content`
对齐同一套 pattern 语义，并补上替换数量防护。**升级前请检查所有对 `text_replace` 的既有调用。**

#### 语义变化一览

| 维度 | 旧行为 | 新行为 |
| --- | --- | --- |
| pattern 解释 | 一律按正则字符串编译 | 默认按**字面量子串**匹配（`.` `\` `*` 等原样）；`/…/` 包裹启用正则 |
| Windows 路径 | `C:\\Users` 需双重转义，`\U` 被当转义吃掉 | 字面量模式直接写 `C:\Users\alice`，反斜杠原样匹配替换 |
| replacement | 总是展开 `$1`/`$&`/`$$` 回引用 | **字面量 pattern → 纯字面插入，回引用记号原样保留**；正则 pattern → 沿用 JS 风格回引用（零迁移） |
| flags | 不适用（整体即正则） | `/正则/` 尾部可选 `i`/`m`/`s`；另收 **`g` = 全量替换语义开关**；单字母白名单外 flag（如 `/foo/q`）→ EINVAL 并列明合法标志 |
| 0 命中 | 静默成功（`replaced: 0`） | **EINVAL 报错**并附双向 hint（含正则元字符提示改用 `/…/`、拼写大小写提示、反斜杠路径转义提示） |
| 恰 1 命中 | 直接替换 | 自动替换，并回显命中位置（原文 `行:列`）与替换后上下文片段供核验 |
| 多于 1 命中 | 默认全量替换 | 未显式表态时 **拒绝执行（EINVAL）**，列出命中总数与各命中位置清单（行:列） |

#### 表态方式（多命中时三选一，优先级从高到低）

1. `all: true` —— 显式全量替换开关（新增可选布尔参数）；
2. 正则 pattern 尾部带 `g` 标志（如 `/foo/g`）—— 等价显式全量表态（ADR-0013「g=全量语义开关」）；
3. `maxReplace: N` —— 限量替换前 N 处（既有参数保留）。

`all` 与 `maxReplace` 同时提供时 `all` 优先；表态判定对 `write: true/false` 一致生效。

#### 判定规则要点（严格、永远向字面量收敛）

- 整串按正则解释，当且仅当：以 `/` 开头、存在未转义收尾 `/`、体非空、末段 flags 通过三级分类；
- 任一结构条件不满足 → 整串按字面量（如 `/usr`、`//`、`/api/v1/`）；
- 多字母词组形状的尾段（如 `/usr/bin` 的 "bin"）判为词组而非 flag 手误，安全收敛字面量
  （队长终版裁定：三级分类，优于一律 EINVAL 口径）；
- 已知残余洞（文档化接受）：形如 `/tmp/` 的恰好首尾斜杠短字面量会被判为正则，
  由「命中异常偏多」hint 兜底。

#### 成功响应新增字段（增量输出，兼容）

- `patternMode`: `'literal' | 'regex'` —— 本次 pattern 被解释的模式；
- `totalMatches`: 命中总数（限量替换时可能大于 `replaced`）；
- 恰 1 命中时附 `position`（原文 `{line, col}`，均 1-based）与 `context`（替换后所在行片段）。

#### 新语义示例

```jsonc
// 1) 字面量默认：反斜杠路径免转义，replacement 原样插入
{ "path": "config.txt", "pattern": "C:\\Users\\alice", "replacement": "D:\\backup" }
// → { "ok": true, "replaced": 1, "patternMode": "literal", ... }
//    文件中 $1 等记号若存在于 replacement，将原样写入而非展开

// 2) 正则模式：/…/ 包裹 + 回引用
{ "path": "a.txt", "pattern": "/(\\d+)x(\\d+)/", "replacement": "$2x$1" }

// 3) 恰 1 命中：自动替换 + 核验信息
{ "path": "a.txt", "pattern": "target", "replacement": "goal" }
// → { "ok": true, "replaced": 1, "position": { "line": 2, "col": 9 },
//      "context": "hit the goal here", "patternMode": "literal", ... }

// 4) 多于 1 命中且未表态：拒绝并列出位置清单
{ "path": "a.txt", "pattern": "foo", "replacement": "x" }
// → { "ok": false, "error": { "code": "EINVAL",
//      "message": "发现 3 处命中，未显式表态替换范围，已拒绝执行。请提供 all:true（全量替换）
//                  或 maxReplace:N（限量替换）。命中位置：1:1, 1:9, 2:1" } }

// 5) 显式全量 / 限量 / g 标志表态
{ "path": "a.txt", "pattern": "foo",     "replacement": "x", "all": true }
{ "path": "a.txt", "pattern": "/o/g",    "replacement": "0" }              // g 等价 all:true
{ "path": "a.txt", "pattern": "/\\d/",   "replacement": "X", "maxReplace": 2 }
```

#### 迁移指引

- 旧调用里的正则 pattern 请改写为 `/…/` 包裹形式（体内斜杠写作 `\/`）；
- 依赖「默认全量替换」的调用请补 `all: true`（或正则尾部 `g`）；
- replacement 中需要回引用展开的场景必须改用正则 pattern；字面量场景下 `$` 记号不再展开（多数情况这正是期望行为）；
- 原「0 命中静默成功」的调用需处理新的 EINVAL 错误。

### Added

- `text_replace` 新增可选布尔参数 `all`（显式全量替换开关，见上）。
- 共享基础设施（工单 01/02 产物）：`src/utils/pattern.ts`（双模严格判定解析器）、
  `src/utils/hints.ts`(双向 hint 引擎)，`text_grep` 同批获得 `patternMode` 输出与 hint 字段。
