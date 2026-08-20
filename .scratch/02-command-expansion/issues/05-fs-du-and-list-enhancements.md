# fs-du-and-list-enhancements

**Status:** ready-for-agent

**构建内容：** AI 可排查目录大小（`fs_du`）、排序过滤列目录、写文件自动建父目录、移动文件可覆盖/移入目录。

**验收标准：**

- [ ] `callTool("fs_du", {path})` 返回目录递归累计大小
- [ ] `callTool("fs_list", {path, sortBy, filter, type})` 支持按名称/大小/修改时间排序与类型/glob 过滤
- [ ] `callTool("fs_write", {path, content})` 父目录不存在时自动创建
- [ ] `callTool("fs_mv", {src, dest, overwrite})` 支持覆盖已存在目标；dest 为目录时移入该目录
- [ ] 错误场景：路径不存在、权限不足
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
