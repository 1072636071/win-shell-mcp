# hash-file

**Status:** ready-for-agent

**构建内容：** AI 可计算文件 sha256/md5（`hash_file`）。

**验收标准：**

- [ ] `callTool("hash_file", {path, algorithm})` 返回对应摘要
- [ ] 支持算法：sha256、md5（可扩展 sha1）
- [ ] 错误场景：文件不存在、算法不支持
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
