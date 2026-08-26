# 引用接入（AGENTS/CODEBUDDY）+ README 工具清单同步

**Status:** ready-for-agent

**Blocked by:** 01（需速查表文件已存在才能引用）

**构建内容：** agent 加载本仓库时，AGENTS.md 与 CODEBUDDY.md 同时指向速查表，优先读 59 行速查表而非整个 README 来建立工具概览——两文件逐字一致地追加同一条引用，遵守仓库约定；同时 README 的工具清单补上 `batch_run` 一行（58→59）并链接速查表，让 README 清单与 registry 不再各自过期。

**验收标准：**

- [ ] AGENTS.md 追加一条指向 `docs/ai-tool-cheatsheet.md` 的引用，说明"agent 建立工具概览时优先读速查表而非整个 README"
- [ ] CODEBUDDY.md 追加与 AGENTS.md **逐字一致**的同一条引用（两文件当前内容一致是本工单前提；改动后 diff 语义相同，仅路径前缀可能因文件定位不同而呈现的差异需人工复核后对齐）
- [ ] README 工具清单补 `batch_run` 一行，工具数从 58 更新为 59（清单标题"工具清单（59 个）"与正文一致）
- [ ] README 工具清单节开头加一行指向速查表的链接
- [ ] README 其余内容不动（本工单只补行与链接，不重构）
- [ ] 全量 `npm test` 保持绿（本工单不改代码行为）

**跨目录依赖：**

- 依赖 01：速查表文件必须先存在，引用才有指向
- 与 11/12/15 无代码耦合：README 环境变量小节（12 号工单新增）与速查表环境变量小节各自维护，本工单仅在 README 清单节加链接，不新增变量内容
- 若 14 号影响 README 内联别名标注，本工单只负责 batch_run 行与链接，其余 README 改动由对应工单负责——避免本工单接手无关 README 变更

## 评论

### 实施记录（2026-08-26）

- **AGENTS.md / CODEBUDDY.md**：在 `## Agent skills` 节末尾（`### 临时文件` 之后）逐字一致追加 `### AI 工具速查表` 小节，文案：
  > agent 建立工具概览时优先读 `docs/ai-tool-cheatsheet.md`（按 15 命令域分节的四列表格：正名｜一句话用途｜关键参数｜别名）而非整个 README；结构与 registry 对账（`tests/tools/guard-cheatsheet.test.ts`），别名以 registry 为单一事实源。
  - 两文件改动后 `Get-FileHash` 哈希比对结果 `IDENTICAL`，逐字一致性已验证。
- **README.md**：
  - 工具清单标题 `## 工具清单（58 个）` → `## 工具清单（59 个）`。
  - 标题下、正文前加一行引用链接：`> AI 建立工具概览优先读 docs/ai-tool-cheatsheet.md（按 15 命令域分节的四列表格：正名｜一句话用途｜关键参数｜别名）。`
  - 在 archive 节之后、`## ⚠️ 安全说明` 之前新增 `### meta（1）` 节，含 `batch_run` 一行（说明：批量编排，多步串行，assert 断言，`{{stepId.output.path}}` 模板引用前序输出）。
  - 其余内容不动；README 顶部/正文其他位置的"58"系指域工具数（不含 meta），语义自洽，由对应工单负责。
- **测试**：本工单不改代码行为，全量 `npx vitest run` 42 文件 1879 passed | 2 skipped 保持绿。

（引用文案最终稿、两文件逐字一致性核对记录追加于此，新内容置于最前。）
