# net 工具集

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 可发起 HTTP GET/POST 请求（返回状态码与截断的响应体）、做 DNS 解析、做 TCP 可达性探测，替代 curl/wget/nslookup。

**验收标准：**

- [ ] GET 返回 `{status, body(截断)}`，支持超时
- [ ] POST 支持 JSON 与文本体
- [ ] DNS 解析返回地址列表，TCP 探测返回可达性
- [ ] 非法 URL、超时、连接失败等错误路径有测试

## 评论
