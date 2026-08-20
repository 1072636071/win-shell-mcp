# text-correctness-fixes

**Status:** ready-for-agent

**构建内容：** `text_replace` 不破坏原编码、`text_diff` 输出真实差异、`fs_read` 与 `cat` 区间语义统一。

**验收标准：**

- [ ] GBK 文件经 `text_replace` 原地写回后编码不变（字节级断言）
- [ ] `text_diff` 对「插入一行」仅标记对应 hunk，不级联失真（引入 LCS/Myers 行级 diff）
- [ ] `fs_read` 与 `cat` 的 start/end 区间语义一致（含/不含端点对齐，借发布前窗口修正）
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
