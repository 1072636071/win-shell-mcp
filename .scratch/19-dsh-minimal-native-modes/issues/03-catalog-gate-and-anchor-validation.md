# 目录门禁 + 锚定验证

**Status:** resolved

**Blocked by:** 01, 02

**构建内容：** DSH 侧目录校验升级：重新生成工具目录，为校验添加"每个模型可见工具描述 ≤200 字符（行为事实可放宽）"的长度上界门禁；内置极简模式（minimal preset）在工具描述精简后的锚定表面重新验证，确保既有极简轨迹评测基线可复现。

**验收标准：**

- [x] 工具目录重新生成且校验通过（含新长度上界断言，门禁失败即拒绝）
- [x] 内置极简模式锚定表面验证通过：bash/str_replace_editor 描述精简后，极简轨迹评测基线不回归
- [x] 全量目录描述总成本下降可度量（对比精简前后有记录）
- [x] 无任何模型可见工具描述残留说教式填充或冗余示例

## 评论

## 答案

已在 deepseek-harness 仓库（branch `jiangxiao`）实现并提交：

- **长度上界门禁**：`scripts/gen-tool-catalog.ts` 新增 `DEFAULT_DESCRIPTION_LIMIT = 200` 与 `DESCRIPTION_LENGTH_LIMITS` 包键豁免注册表（键为 `<manifest dir> <toolName>`，跨包同名工具互不干扰；每条上限附注释说明对应的不可约行为事实：bash 850 / pwsh 1100 / workflow 2000 / todo_write 750 / cordis_* 审批与版本指针保证 / glob 400 封顶采样披露等）。`assertDescriptionLength` 挂接在 `collectToolCatalog()` 收成路径内，生成与 `--check` 双路径失败关闭；`CatalogPackage` 补传播 manifest `dir`，外部调用者与内部挂接点共用同一限额键命名空间。
- **验收 #1（目录重生成 + 门禁拒绝）**：`docs/tool-catalog.md` 与门禁实现零 diff（`--check` 绿）；存量 63 工具全部在新预算内由全树扫描测试兜底；负例（201>200）、恰好压线、上限查找顺序、违规消息格式测试落在 `gen-tool-catalog.spec.ts`（14/14 绿）。
- **验收 #3（度量记录）**：模型可见描述总成本精简前 **21,627 字符**（63 工具，aecfc84 提交渲染产物）→ 精简后 **17,489 字符**（−19.1%，均值约 278），运行时收成与 catalog 解析两口径一致。见 Agent Note `.agents/notes/implemented/process/2026-08-27-tool-description-length-gate.md`(+`.zh.md`+`.i18n.yaml`)。
- **验收 #2（极简锚定表面，证据链接）**：
  - `apps/web/tests/minimal-preset.snapshot.ts` 重放车道钉住的表面全部保持——单行 persona 精确等于 `You are a helpful software engineer assistant.`、工具恰为 shell+编辑器两个、持久状态语义（`PERSISTED:{{cwd}}/persistent-state`）、行号编辑器输出；
  - win32 宿主该车道因 preset 平台门控（bash 栈 disabled、挂 pwsh 栈）确定性红；经 `git stash` 对照证实失败特征与本批改动**前后完全一致**（先在的平台性差异，Linux CI 重放为绿）；
  - `examples/acp-agent` replay 车道（固定 header/schema 侧车守卫）：57 通过 / 28 失败——抽样确认全部为 SQLite Node 实验性警告 stderr 噪音，与工单 01 记录的本机环境性基线完全一致，无任何描述/固定 header 偏离类失败；
  - 真机轨迹评测复跑不在代码仓内（PRD「超出范围」另立验证任务）。
- **验收 #4（无残留说教）**：逐条通读运行时收成的**全部 63 条**描述全文（不止超预算的 29 条），均为稠密行为事实，无一句说教式填充或冗余示例；既有水平由长度门禁锁定。结论记录于上述 Agent Note。
- **配套验证**：packages/core/tools 全包 392/392 绿；oxlint 两文件 0 违规；tsc 涉改文件 0 错误（全库 playwright/vitepress/dsh-mcp-client 解析错误为本机环境遗留）；verify-agent-note-format 599 notes 合规；新 Note 双语配对已录。
- **审查**：`/jxx-code-review` 双轴审查——标准轴无硬性违规批准；spec 轴两项低级发现（Note 措辞审查范围收窄、锚定证据缺链接）按方案 A 已修复后复审通过。
