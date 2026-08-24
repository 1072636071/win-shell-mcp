# Map · pattern 双模统一与误用可观测层

**PRD**：`.scratch/04-pattern-dual-mode-observability/PRD.md`（Status: ready-for-agent）
**设计依据**：docs/adr/0013-pattern-dual-mode-and-observability.md · docs/memorial/003-ai-tool-misunderstanding/context.md（R1–R6 全程论证）· 实施移交清单 memorial 003 sub-task/001

## 已做决策（摘要）

- 三工具统一双模：字面量默认、斜杠包裹正则；严格判定、永远向字面量收敛；标志白名单 i/m/s（replace 另收 g）
- 输出增量：模式标识字段 + 可选提示字段；replace 新增全量开关参数，0/1/>1 命中三分支表态
- 残余洞接受并文档化：恰好首尾斜杠的短字面量会被判为正则，由异常命中提示兜底
- 关键论证：字面量默认的失误看得见（0 命中可提示），正则默认的失误看不见（错配还带结果）——可观测投资只对前者有效
- 否决替代方案：全线纯正则、全线显式开关、仅改文档

### 实施期决策（2026-08-24 实施批次）

- **flags 段三级判定【终版】**：全合法→正则；单字母白名单外→EINVAL；搜索场景含 g→EINVAL；其余多字母词形→字面量收敛（/usr/bin、/etc/hosts 判字面量）。决策链：实现者发现 ADR 效果表 /usr/bin 行与 EINVAL 规则结构同形不自洽 → 提出三级判定 → 队长初批一律 EINVAL → 复核全部具名示例后终审采纳三级判定（唯一同时满足 PRD 收敛原则、工单 AC 与 ADR 效果表的解）。完整轨迹见工单01评论。
- **replace 表态语义**：表态优先级 `all:true` > 尾部 g > `maxReplace`；g 标志等价显式全量表态（ADR「g=全量语义开关」）；分支判定与 write 参数无关。
- **共享层落位**：解析器 `src/utils/pattern.ts`（parsePattern + SEARCH/REPLACE_PATTERN_FLAGS）、提示引擎 `src/utils/hints.ts`（buildSearchHint + 判据常量集中单点，异常偏多阈值 ABSOLUTE=200/RATIO_MIN_LINES=20/RATIO=0.5 可调参）。

## 工单图

01 严格判定落地 text_grep ✅resolved → 02 提示表 ✅resolved → 03 search_content 对齐 ✅resolved；04 replace 双模+三分支 ✅resolved；05 文案收口 ✅resolved。**全部工单闭环（2026-08-24 实施批次），含双工具一致性对照表 10 组防回归。**

## 迷雾/备注

- 提示阈值与元字符清单为实现期调参项（方向已由双向表锁定；常量落位 src/utils/hints.ts，注释含调参依据）
- 破坏性变更窗口：0.x 发布前批次，与 memorial 001 D8 清单同批（本次已随批实施，见 CHANGELOG.md）

