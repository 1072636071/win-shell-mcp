# 02 · tasklist 解析深模块

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** `process_list` 与 `net_listen` 的进程名解析走同一 tasklist CSV 解析接口，解析行为（引号/逗号字段切分、映像名/PID/内存提取）永不漂移；两工具对同一数据的解释完全一致。

**验收标准：**

- [ ] `process_list` 与 `net_listen` 共用同一 tasklist 解析接口，各自本地解析副本删除
- [ ] `process_list` 输出含内存列且与现状一致（千分位剥离、KBytes→字节）
- [ ] 畸形行返回 null 的行为与现状一致（解析失败静默跳过）
- [ ] `net_listen` 进程名映射输出与现状一致
- [ ] 解析器表驱动单测（含引号/逗号/千分位/畸形行边界）

## 评论

来源：PRD 决策 2（P1）。`net_listen` 现为无单测的派生副本，收敛后解析行为单一事实源。
