# WIN_SHELL_TRUNCATE 截断阈值环境变量（并入配置模块）

**Status:** ready-for-agent

**Blocked by:** 12-01（工具白名单配置模块——截断环境变量解析并入该模块；该模块已 `ready-for-agent` 可先行落地，本工单的配置解析部分需等其存在）

**构建内容：** 部署者可通过 `WIN_SHELL_TRUNCATE=800` 把全局内容截断默认值压到更小，小上下文模型或长会话尾段下长内容默认回得更短。不设该变量时截断行为与现状完全一致（默认 2000）。工具级 `maxLen`/同类参数仍然优先于环境变量，单次调用的精确控制不被全局设置覆盖。

**验收标准：**

- [ ] 截断默认值来源改为"配置模块读取后的默认值"，各调用点语义不变；`WIN_SHELL_TRUNCATE` 未设置时行为与现状完全一致（2000）
- [ ] 环境变量解析并入 12 号工单创建的配置模块，env 读取仍只有一处，不新增第二个事实源
- [ ] 解析规则：`WIN_SHELL_TRUNCATE` 取正整数；缺省 2000；非法值（非正整数，如 0、负数、非数字）启动 fail-fast 报错并点名该条目，与白名单的严格风格一致
- [ ] 生效优先级固化并可用最小工具（如 `fs_read`）验证三层关系：工具级 `maxLen`/同类参数 > 环境变量 > 常量 2000
- [ ] 截断函数默认值参数从硬编码常量改为读取配置后的默认值；既有不传参调用点语义不变
- [ ] `git` 域内部对 stderr 的 500 字符内联截断保持原样（那是错误面降噪，不属于内容截断契约，不接入本变量）
- [ ] 配置模块纯函数测试覆盖 `WIN_SHELL_TRUNCATE` 解析：合法值 / 缺省 / 非法值（表驱动，先例：`tests/contract/errors.test.ts`）
- [ ] 截断优先级测试用 `fs_read` 类最小工具验证工具级参数 > 环境变量 > 常量的三层关系

## 评论

### 实施记录（2026-08-26）

**改动文件**：

- `src/config/env.ts`：新增 `ENV_WIN_SHELL_TRUNCATE` 常量、`TruncateLimitResult` 类型、`parseTruncateLimit` 纯函数（缺省返回 2000，正整数返回该值，非法值返回 `{ ok: false, reason }`）。
- `src/contract/output.ts`：新增模块级截断配置 `getTruncateLimit`/`setTruncateLimit`/`resetTruncateLimit`；`truncate` 默认参数从 `DEFAULT_TRUNCATE_LIMIT` 改为 `getTruncateLimit()`。
- `src/server.ts`：`startStdioServer` 解析 `WIN_SHELL_TRUNCATE`，非法值 fail-fast 抛错，合法值 `setTruncateLimit` 注入。
- `src/tools/fs_read.ts`：`maxLen` 缺省回退从 `2000` 改为 `getTruncateLimit()`。
- `src/tools/text_cat.ts`：截断判定与 `truncate` 调用改用 `getTruncateLimit()`。
- `src/tools/git.ts`：`git_diff` 截断判定与 `truncate` 调用改用 `getTruncateLimit()`。
- `src/tools/shell_exec.ts`：stdout/stderr 截断判定与 `truncate` 调用改用 `getTruncateLimit()`。
- `tests/config/env.test.ts`：新增 `parseTruncateLimit` 表驱动测试（合法/缺省/非法）。
- `tests/tools/fs_read.test.ts`：新增截断优先级三层测试（常量 2000 > 环境变量 800 > 工具级 300），`afterEach` 复原配置。

**设计决策**：

- 配置模块 `parseTruncateLimit` 返回 result 类型（与 `parseToolsWhitelist` 风格一致），不抛异常；`startStdioServer` 负责 fail-fast。
- 模块级可变状态 `currentTruncateLimit` 由 `setTruncateLimit` 在启动时注入，未调用时保持 `DEFAULT_TRUNCATE_LIMIT`（零破坏）。测试用 `resetTruncateLimit` 复原。
- `env.ts` 内 `DEFAULT_TRUNCATE = 2000` 局部常量，避免 config→contract 循环依赖。
- git stderr 500 字符截断不动（错误面降噪，不接入本变量）。

**验收**：`pnpm test` 全绿（1897 passed）、`pnpm typecheck` 通过。

（评论与对话历史追加于此，新内容置于最前。）
