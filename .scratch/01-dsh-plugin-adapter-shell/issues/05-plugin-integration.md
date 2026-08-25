# DSH 插件完整集成与冒烟

**Status:** done

**Blocked by:** 04

**构建内容：** DSH 本地可通过 cordis.yml 加载 `tool-win-shell` 插件，全量 58 工具注册成功；Code Mode 程序内并发与排他行为符合预期。

**验收标准：**

- [x] `plugin.ts` 移除临时回退逻辑，全量注册 58 工具（遍历 `builtinTools`，每项调用 `defineTool`）
- [x] DSH 本地 `cordis.yml` 配置：使用 `file:` 路径加载 `win-shell-mcp/plugin`，`tools: { mode: code }` 启用 Code Mode
- [x] Native 模式冒烟：一步内并行调用两个 read-only 工具，验证 rolling pool 重叠（通过 `tool/code-dispatch` 事件计时或日志观察）
- [x] Code Mode 冒烟：程序内 `Promise.all([tools.fs_read(...), tools.git_status(...)])` 验证子调用重叠（`tool/code-dispatch-start`/`tool/code-dispatch` 事件对显示并发）
- [x] Exclusive 冒烟：程序内顺序提交 `tools.fs_write(...)` 与 `tools.fs_read(...)`，验证 exclusive 调用排空池、阻挡后续
- [x] 插件 Config `exclude` 验证：排除 `shell_exec` 后，注册列表中无该工具

## 评论

- 本工单依赖 04 完成全部 58 工具的 metadata，否则 plugin 无法全量注册。
- 冒烟测试需要本地 DSH 环境（`E:\work\sp\deepseek-harness`），测试脚本应检测 DSH 是否存在，不存在则跳过并打印提示。
- 参考 002 D9 的验收策略：仓库内 vitest 单测 + DSH 本地冒烟。
