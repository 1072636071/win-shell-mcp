# archive-pack-unpack

**Status:** ready-for-agent

**构建内容：** AI 可 tar/zip 打包（`archive_create`）与解包（`archive_extract`）。

**验收标准：**

- [ ] `callTool("archive_create", {source, dest, format})` 生成 tar/zip 文件
- [ ] `callTool("archive_extract", {source, dest})` 解包到目标目录
- [ ] 错误场景：源不存在、格式不支持、目标目录冲突
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
