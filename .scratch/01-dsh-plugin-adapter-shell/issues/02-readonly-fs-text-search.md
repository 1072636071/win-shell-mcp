# 只读工具批量 A（fs / text / search 域）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 约 12 个只读工具全部携带 outputSchema + annotations，guard test 覆盖这批工具，并发分类测试验证它们被标为 parallel。

**验收标准：**

- [ ] 以下工具补全 output zod schema 与 `annotations: { readOnlyHint: true }`：
  - fs 域：`fs_read`（已在 01 完成，验证即可）、`fs_stat`、`fs_list`、`fs_du`
  - text 域：`text_cat`、`text_head`、`text_tail`、`text_grep`、`text_wc`、`text_diff`
  - search 域：`search_glob`、`search_content`、`search_which`
- [ ] guard test 扩展至覆盖上述全部工具（断言 outputSchema 非空且 readOnlyHint 为显式 true）
- [ ] 并发分类测试：验证上述工具在 DSH 投影中被标记为 `isConcurrencySafe: () => true`
- [ ] MCP 投影测试：抽样验证 3 个工具的 `listTools` 输出含正确 outputSchema + annotations

## 评论

- 本批次均为纯读取/探测/计算类工具，outputSchema 相对简单（多为对象或字符串）。
- 与 03 工单独立，可并行开始（均阻塞于 01）。
