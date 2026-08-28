# 04 · net HTTP 深模块

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** `net_get` / `net_post` / `net_download` 共享同一 HTTP 机器（fetch + 超时 + 重定向 + 错误码映射）；`net_download` 超时返回与其余两个工具一致的 `NET_TIMEOUT` 错误码，同一失败条件不再有两种语义。

**验收标准：**

- [ ] `net_download` 超时返回 `NET_TIMEOUT`（与 `net_get`/`net_post` 一致）；连接失败返回 `NET_FAIL`
- [ ] 三个工具共享同一超时与错误映射实现（流式与非流式消费形态同源）
- [ ] `net_get`/`net_post` 输出与现状一致；`net_download` 其余行为不变
- [ ] 超时错误码变化已记 CHANGELOG（0.x 窗口，ADR-0007）
- [ ] 单测覆盖：注入伪 fetch 的超时/连接失败映射、流式下载语义

## 评论

来源：PRD 决策 4（P2）。`net_download` 的自建 AbortController+fetch 并入 HTTP 深模块，`EXEC_TIMEOUT` 分叉消除。
