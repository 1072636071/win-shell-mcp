# git-diff-and-search-regex

**Status:** ready-for-agent

**构建内容：** AI 可对比任意 ref（`git_diff` against）、跨文件正则搜索（`search_content`）。

**验收标准：**

- [ ] `callTool("git_diff", {against, path?})` 对比指定 ref（如 HEAD~1、main）
- [ ] `callTool("search_content", {pattern, regex: true})` 支持正则跨文件搜索
- [ ] 正则形式与 `text_grep` 对齐（`/` 包围或显式标志）
- [ ] 错误场景：无效 ref、正则语法错误
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
