# json-get

**Status:** ready-for-agent

**构建内容：** AI 可按路径取 JSON 值（`json_get`，jq-lite）。

**验收标准：**

- [ ] `callTool("json_get", {path, expression})` 从 JSON 文件按路径取值
- [ ] `callTool("json_get", {content, expression})` 直接解析 JSON 字符串取值
- [ ] 支持路径表达式：点号键访问（如 `dependencies.zod`）与数组索引（如 `scripts[0]`）
- [ ] 错误场景：无效 JSON、路径不存在
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
