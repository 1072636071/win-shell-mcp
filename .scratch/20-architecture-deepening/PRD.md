# PRD — 架构深化（21 候选）

Status: in-progress
日期：2026-08-27
来源：jxx-improve-codebase-architecture 技能，7 子 agent 并行审查 59 工具
分支：architecture-deepening

## 概述

逐工具深化审查发现 21 个候选深化机会（强烈 3 / 值得探索 9 / 试探性 9）。本工单目录含 21 个 issue，按强度排序。

## 执行批次

1. **批次 1（强烈 3）**：D-1, E-1, C-1 — 接缝泄漏/局部性违反，纯重构
2. **批次 2（值得探索·重构/测试 5）**：A-1, C-2, E-2, F-2, F-4
3. **批次 3（值得探索·大重构 2）**：B-1, G-2
4. **批次 4（值得探索·设计变更 3）**：B-2, D-2, F-1
5. **批次 5（试探性 9）**：B-3, B-4, C-3, D-3, F-3, F-5, G-1, G-3

## 验收

- 全部 issue 修复或显式拒绝（附理由）
- vitest 全绿，覆盖率 ≥ 阈值（lines/functions/statements ≥85%, branches ≥84%）
- tsup build 成功
- CHANGELOG Unreleased 追加条目
