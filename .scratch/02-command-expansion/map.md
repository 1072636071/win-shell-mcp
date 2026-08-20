# Map — 02-command-expansion

## 上下文指针

- **PRD / Spec**：`.scratch/02-command-expansion/PRD.md`
- **Memorial（决策来源）**：`docs/memorial/001-command-coverage-extension/context.md`
- **审计报告**：`docs/memorial/001-command-coverage-extension/sub-task/001.md`
- **全局 ADR**：`docs/adr/0006-new-domains-archive-hash-json.md`、`docs/adr/0007-compatibility-redline.md`

## 已做决策

- 新域设立：archive / hash / json（语义独立即可成域，不设规模门槛）
- 兼容性红线：发布前允许破坏，发布后只加不改
- 决策粒度：命令清单 + 优先级 + 一句话职责；参数级设计留给实现工单
- 12 个新命令 + 15 项拓展 + 2 项一致性修复的完整清单见 PRD 实现决策节

## 工单列表

| # | 工单 | 状态 | 阻塞 |
|---|------|------|------|
| 01 | net-download-and-headers | ready-for-agent | 无 |
| 02 | archive-pack-unpack | ready-for-agent | 无 |
| 03 | git-branch-ops | ready-for-agent | 无 |
| 04 | git-remote-ops | ready-for-agent | 无 |
| 05 | fs-du-and-list-enhancements | ready-for-agent | 无 |
| 06 | hash-file | ready-for-agent | 无 |
| 07 | json-get | ready-for-agent | 无 |
| 08 | net-listen | ready-for-agent | 无 |
| 09 | shell-and-process-enhancements | ready-for-agent | 无 |
| 10 | git-diff-and-search-regex | ready-for-agent | 无 |
| 11 | text-correctness-fixes | ready-for-agent | 无 |
| 12 | system-info-time | ready-for-agent | 无 |

## 集成注意

多个工单会同时修改 `registry.ts` 导入区。建议实施时串行处理 registry 导入，或最后统一做集成验证。
