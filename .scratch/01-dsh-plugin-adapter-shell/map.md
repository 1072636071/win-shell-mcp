# 工单地图：DSH 插件适配壳（01-dsh-plugin-adapter-shell）

## 上下文指针

- **PRD**：`.scratch/01-dsh-plugin-adapter-shell/PRD.md`
- **Memorial**：`docs/memorial/006-ptc-vs-win-shell-mcp/`（含 ADR-0014 草稿）
- **全局 ADR**：`docs/adr/0014-mcp-annotations-as-concurrency-source.md`
- **相关 ADR**：`docs/adr/0010-dual-entry-thin-shell.md`、`0011-full-tool-registration.md`、`0012-single-package-multi-entry.md`
- **相关 Memorial**：`docs/memorial/002-win-shell-mcp-dsh-plugin/`（双入口架构决策）

## 决策汇总（已冻结，实施期不可推翻）

| 决策 | 内容 | 来源 |
|------|------|------|
| 定位 | 双模并存：通用 MCP 面 + DSH 原生插件面 | memorial 006 D2 |
| 深度 | 适配壳 = 薄壳 + 能力元数据，不接 approval/jobs/渲染 | memorial 006 D3 |
| 标注体系 | MCP 标准 ToolAnnotations 单一事实源，插件派生 isConcurrencySafe | memorial 006 D4 / ADR-0014 |
| 分类规则 | 只读族标 true / 必独占族标 false / git_stash list 逃生舱 | memorial 006 D5 |
| 工具面 | 维持全量 58，部署级裁剪走 Config.exclude | memorial 006 D6 |
| 验收 | 护栏测试 + dsh 双模式冒烟 + SDK .d.ts 审计 | memorial 006 D7 |
| 交付 | 同分支两阶段，版本 0.1.0 → 0.2.0 | memorial 006 D8 |
| outputSchema | 纳入首版，与第一阶段合并实施 | memorial 006 D9 |

## 工单依赖图

```
01-core-infra → 02-readonly-fs-text-search → 04-mutating-tools → 05-plugin-integration → 06-cleanup
              ↘ 03-readonly-system-net-git ↗
```

## 工单清单

| 编号 | 文件 | 标题 | 阻塞于 |
|------|------|------|--------|
| 01 | `issues/01-core-infra.md` | 核心基础设施与试点工具（fs_read） | 无 |
| 02 | `issues/02-readonly-fs-text-search.md` | 只读工具批量 A（fs / text / search 域） | 01 |
| 03 | `issues/03-readonly-system-net-git.md` | 只读工具批量 B（system / net / git / 其他） | 01 |
| 04 | `issues/04-mutating-tools.md` | 变更与执行工具批量 | 02, 03 |
| 05 | `issues/05-plugin-integration.md` | DSH 插件完整集成与冒烟 | 04 |
| 06 | `issues/06-cleanup.md` | 收缩与最终验证 | 05 |

## 领域词汇（本功能专用）

- **适配壳**：DSH 专用模式深度 = 薄壳 + 能力元数据（isConcurrencySafe/outputSchema/annotations）
- **单一事实源**：MCP 标准 ToolAnnotations 同时服务 MCP 面与 DSH 插件面
- **防漂移护栏**：单测强制每工具显式声明 annotations 与 outputSchema
- **规范 JSON 值**：工具主体返回的、匹配 output schema 的精确结构化值
- **逃生舱**：参数级只读细分（已知一例：git_stash action:'list'）
