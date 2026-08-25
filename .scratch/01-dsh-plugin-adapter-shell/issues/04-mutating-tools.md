# 变更与执行工具批量

**Status:** ready-for-agent

**Blocked by:** 02, 03

**构建内容：** 全部 mutating 工具（~30 个）携带 outputSchema + annotations（readOnlyHint: false），guard test 覆盖全部 58 工具，exclusive 分类测试验证它们独占运行，git_stash 逃生舱测试验证 action:list 可并发。

**验收标准：**

- [ ] 以下工具补全 output zod schema 与 `annotations: { readOnlyHint: false }`（适用处加 `destructiveHint: true`）：
  - fs 变更域：`fs_write`、`fs_mkdir`、`fs_rm`、`fs_cp`、`fs_mv`、`fs_touch`
  - text 变更域：`text_replace`
  - archive 域：`archive_create`、`archive_extract`
  - net 变更域：`net_download`、`net_post`
  - env 变更域：`env_set`、`env_unset`
  - process 域：`process_kill`
  - pkg 域：`pkg_run`
  - git 变更子命令：`git_add`、`git_commit`、`git_checkout`、`git_push`、`git_pull`、`git_clone`、`git_stash`
  - 执行域：`shell_exec`、`run_command`
- [ ] guard test 覆盖全部 58 工具（断言每个工具都有非空 outputSchema 与显式 readOnlyHint）
- [ ] exclusive 分类测试：验证上述工具在 DSH 投影中默认独占（无 isConcurrencySafe 或返回 exclusive）
- [ ] git_stash 逃生舱测试：验证 `action: 'list'` 时 isConcurrencySafe 为 true，其他 action 为 exclusive
- [ ] `net_post` 保守标 `readOnlyHint: false`（服务端副作用语义），注释论证

## 评论

- 本批次包含全部 mutating 与执行类工具，outputSchema 需描述副作用操作的成功确认结构（如 `{ success: true }` 或具体操作结果）。
- `shell_exec`/`run_command` 的 outputSchema 已在现有代码中以 `ShellExecMinimal`/`ShellExecFull` 接口存在，只需转为 zod 等价物。
