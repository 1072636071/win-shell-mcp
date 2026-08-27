# map — DSH 极简原生集成（19）

## 上下文指针

- PRD：`PRD.md`（Status: ready-for-agent）
- 决策记录：`docs/memorial/007-dsh-minimal-alignment/context.md`（D1–D11）
- ADR：`docs/adr/0018-dsh-minimal-native-integration.md`
- DSH 侧工单：`deepseek-harness/.agents/notes/proposed/feature/2026-08-27-concise-tool-descriptions-for-minimal-native.md`（+ .zh.md）

## 已做决策

- native 全量呈现（非 PTC/两阶段）；persona 单行极简
- 三模式：标准 65 / 全量 ~121 / 批量（标准 + batch_run 规则）
- 双形态：MCP 通用（不动）+ DSH 插件定制（bundle 插件）
- 与 jx-mode 并存；三缺口（read_image/web_search/lsp）用 DSH 原生
- DSH 全部 63 工具描述精简（最短可准确表达语义，保留行为/安全事实）
- 实施顺序：01/02（DSH 描述精简）→ 04（bundle+标准）→ 03（门禁+锚定）→ 05/06（批量/全量）→ 07（验证+文档）
- 01 已完成（2026-08-27）：DSH 侧 shell/fs/编辑/终端族描述精简落地于 `deepseek-harness` branch `jiangxiao`（提交含 6 包源码 + tool-catalog 重生成 + acp-agent pin sidecar + py-sdk 快照 + Agent Note）；详见 `issues/01-trim-dsh-shell-fs-descriptions.md` 答案。极简锚定工具默认描述改动已标注，重验归 03。
- 03 已完成（2026-08-27，commit `fba88ece98`）：tool-catalog 长度上界门禁落地（默认 200 字符 + `DESCRIPTION_LENGTH_LIMITS` dir 键豁免注册表；断言挂 `collectToolCatalog()` 内部，生成/`--check` 双路失败关闭；`CatalogPackage` 传播 dir 统一限额键命名空间）。度量：模型可见描述总成本 21627→17489 字符（−19.1%，63 工具，约 278 均值，运行时收成与 catalog 解析两口径一致）。锚定重验：minimal snapshot 的车道钉住的 persona/两工具/持久态全保持，win32 平台门控红经 stash 对照证实与本批无关；ACP replay 57 绿/28 环境失败与工单 01 基线一致、零描述偏离。残留说教审查通读全 63 条为稠密行为事实。详见 `issues/03-catalog-gate-and-anchor-validation.md` 答案 + Agent Note `.agents/notes/implemented/process/2026-08-27-tool-description-length-gate.md`。

## 实施状态

- 03（catalog 门禁 + 锚定验证）：**已实现**（见上文 03 已做决策；commit `fba88ece98`）。
- 04（bundle 骨架 + WShell 标准模式）：**已实现**。标准模式按 D9 落地 = 65 工具（58 win-shell 域工具经 `config.exclude` 剔除 3 meta + fs 组 4 + web 组 2 + lsp 1）；persona 补齐官方 minimal 的 `complete:true`/`includeRuntimeContext:false`；`src/dsh-bundle/` + `presets/wshell-standard/` + `tests/dsh-bundle/` 全绿（1928 passed）。一条命令安装文档、~4.5K token 度量留 07。
- 05（WShell 批量模式）：**已实现**。`presets/wshell-batch/` 落地，按工单 05 口径**放行 batch_run**（exclude 只剔 tool_groups/list_domain_tools），win-shell 59、目录共 66（刻意见工单「65 一致」略出 1）；persona = 极简身份 + 一条 batch_run 优先规则。测试重构为 `describe.each(MODES)` 覆盖 standard+batch，全绿（1936 passed）。验收 #4（模型实际用 batch_run 合并步骤）为 DSH 运行时 E2E，留 07。
- 全量模式（06）、e2e 验证+文档（07）待实施。

## 迷雾

- 全量模式轨迹评测（~121 工具）结果未知，留给 07 后另立验证
