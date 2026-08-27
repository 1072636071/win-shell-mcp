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

## 实施状态

- 04（bundle 骨架 + WShell 标准模式）：**已实现**。标准模式按 D9 落地 = 65 工具（58 win-shell 域工具经 `config.exclude` 剔除 3 meta + fs 组 4 + web 组 2 + lsp 1）；persona 补齐官方 minimal 的 `complete:true`/`includeRuntimeContext:false`；`src/dsh-bundle/` + `presets/wshell-standard/` + `tests/dsh-bundle/` 全绿（1928 passed）。批量/全量 preset、一条命令安装文档、~4.5K token 度量留 05/06/07。

## 迷雾

- 全量模式轨迹评测（~121 工具）结果未知，留给 07 后另立验证
