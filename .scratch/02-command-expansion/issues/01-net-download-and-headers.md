# net-download-and-headers

**Status:** ready-for-agent

**构建内容：** AI 可下载文件到磁盘（`net_download`），且 `net_get`/`net_post` 支持自定义请求头。

**验收标准：**

- [ ] `callTool("net_download", {url, saveTo})` 成功落盘并返回 `{saved, bytes, path}` 回执
- [ ] `callTool("net_get", {url, headers})` 请求携带自定义头并返回正确 body
- [ ] `callTool("net_post", {url, body, headers})` 请求携带自定义头
- [ ] 错误场景：无效 URL、超时、网络失败返回统一错误码
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
