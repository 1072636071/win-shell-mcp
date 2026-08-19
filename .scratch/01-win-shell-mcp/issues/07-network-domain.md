# 07-网络命令域

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 用户能发起 HTTP 请求（GET/POST，替代 `curl`/`wget`，返回精简响应摘要：状态码、头部摘要、body 截断）、DNS 解析、TCP 可达性探测与网络诊断（`ping`）。纯 Node 实现，不依赖系统 curl。遵循输出精简原则与信任模式。

**验收标准：**

- [ ] HTTP GET/POST 返回精简响应（状态码、头部摘要、body 截断），支持超时；POST 支持 JSON 与文本体
- [ ] 请求失败（非法 URL、连接拒绝、超时）返回结构化错误
- [ ] DNS 解析返回地址列表
- [ ] TCP 探测返回可达性；`ping` 返回结构化结果（或在不支持时给出明确说明）
- [ ] 测试使用本地 mock 服务/localhost，不依赖外网
- [ ] 协议层 seam 测试覆盖成功/失败/边界

## 评论
