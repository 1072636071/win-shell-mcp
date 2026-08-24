# Map · AI 误用拦截——指纹纠错与先读后写

**PRD**：`.scratch/05-misuse-interception-guard/PRD.md`（Status: ready-for-agent）
**设计依据**：docs/memorial/004-destructive-misuse-protection/context.md（R1–R6，含 D3 议题改向与代理决策授权）· memorial 内 ADR-0014 草案（fingerprint-guard-and-read-before-write，结项时同步全局 ADR 目录）

## 已做决策（摘要）

- 双档制指纹纠错在分发层参数校验唯一收口单点实现：特征参数命中他工具 → EINVAL+指路（加权消解）；无关杂质 → warnings[] 放行；全注册工具含黑盒通道参数层自动生效
- 先读后写仅约束「覆盖已存在文件」：进程内已读路径集合（四种读类工具计入），新建/追加豁免；重启清空为已知边界
- 跨仓库移交：deepseek-harness 原生 write/edit 的同款治理以工单草案交付，见 docs/memorial/004-destructive-misuse-protection/sub-task/002-dsh-native-tool-ticket.md——不在本仓库发跟踪票
- 删除类防护（危险目标守卫 Bmin、回收站落地 ADR-0008/0009）用户明示「后面再议」，既有 .scratch/03-destructive-op-protection/ 另册保留
- 关键论证：哑错误带坏数据继续跑，响错误只花一轮——拦截层把最高频的两类哑错误（用错工具、盲写覆盖）变成响错误

## 工单图

01 指纹纠错双档制（无阻塞）∥ 02 先读后写覆盖门槛（无阻塞）——两片完全独立，可并行推进。

## 迷雾/备注

- 多义指路的加权启发式细节实现期调优（原则已定）
- warnings 字段命名与位置随实现定，保持输出契约增量兼容

