# 只读工具批量 B（system / net / git / 其他）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 约 15 个只读工具全部携带 outputSchema + annotations，guard test 扩展至这批，并发分类测试同步扩展。

**验收标准：**

- [ ] 以下工具补全 output zod schema 与 `annotations: { readOnlyHint: true }`：
  - system 域：`system_info`、`system_disk`、`system_memory`、`system_path`
  - env 域：`env_get`
  - core 域：`pwd`、`echo`
  - net 域：`net_dns`、`net_tcp`、`net_listen`、`ping`
  - pkg 域：`pkg_detect`
  - process 域：`process_list`
  - git 只读子命令：`git_status`、`git_log`、`git_branch`、`git_diff`
  - hash / json：`hash_file`、`json_get`
- [ ] guard test 扩展至覆盖上述全部工具
- [ ] 并发分类测试：验证上述工具在 DSH 投影中被标记为 parallel
- [ ] MCP 投影测试：抽样验证 3 个工具的 `listTools` 输出含正确 outputSchema + annotations

## 评论

- `git_status`/`git_log`/`git_diff`/`git_branch` 虽 spawn 子进程但为短命读进程，论证注释需说明竞态无害（见 ADR-0014）。
- 与 02 工单独立，可并行开始（均阻塞于 01）。
