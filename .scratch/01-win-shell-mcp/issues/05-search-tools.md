# search 工具集

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 可按 glob 模式在目录下找文件、跨目录递归搜索文件内容（返回命中的文件/行/文本）、并在 PATH 中定位可执行文件，替代 find/grep/which。

**验收标准：**

- [ ] 按 glob 匹配返回文件路径列表（可递归）
- [ ] 跨文件内容搜索返回 `[{file, line, text}]` 且截断
- [ ] which 在 PATH 中定位可执行文件（Windows 含 .exe/.cmd 后缀）
- [ ] 空结果、无权限目录、非法 glob 等边界有测试

## 评论
