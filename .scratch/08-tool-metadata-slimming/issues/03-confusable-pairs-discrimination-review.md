# 易混工具对判别语义集中评审

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 对精简后最易混淆的三对工具做集中判别评审，确认 AI 在只看 description（不给 schema 细节）时仍能正确区分、不会误选——这是兜底"描述过简导致误选"这一本批次唯一实质风险的复核环节。

**验收标准：**

- [ ] 对三对易混工具逐一评审：`fs_read` vs `cat` vs `text_head`/`text_tail`（读文件 vs 读文本首尾）、`find` vs `search_glob` vs `search_content`（文件系统查找 vs 内容检索）、`shell_exec` vs `run_command`（raw shell vs 结构化命令）
- [ ] 每对确认或修复：精简后 description 仍包含足够的判别点（适用对象、返回值形态、副作用差异）
- [ ] 发现判别语义丢失时，修订对应 description（仍须满足 01 号预算护栏），并同步修正 02 号的校验结论
- [ ] 评审结论（每对保留的判别点摘要）追加到本工单评论区

## 评论

（三对工具的判别点评审结论、必要修复记录追加于此，新内容置于最前。）
