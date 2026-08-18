# ADR-0005: 实现原则——纯 Node 运行时，不依赖 cmd/PowerShell

状态：Accepted

日期：2026-08-18

## 上下文

项目初衷是避免 AI 在 cmd/PowerShell 上反复出错。可行性分析建议将注册表/服务/WMI 等 Windows 特有操作封装为 `win-*` 子命令、内部调用 PowerShell 实现——但这会重新引入 PowerShell 执行策略、编码、路径解析等坑，与项目初衷相悖。

## 决策

- **实现原则**：所有工具基于 Node 跨平台 API（`fs` / `path` / `child_process` / `os` 等）实现，内部不依赖 cmd 或 PowerShell 作为执行后端。
- `run_command` 为唯一例外：由 AI 显式指定可执行文件（可以是任意 `.exe` 或 `powershell` 等），属逃生舱范畴，不违反原则。
- 注册表/服务/WMI 等 Windows 特有域**后置**，不在 v1 承诺内；未来若实现，优先纯 Node 库方案。

## 后果

- 正向：不引入 PowerShell 执行策略/编码/路径解析坑；行为确定、跨平台一致；测试可预期。
- 负向：注册表/服务等 Windows 特有域在 v1 无覆盖，需依赖 `run_command` 逃生舱或外部工具。

## 替代方案

- 内部调用 PowerShell（分析建议）：实现快、覆盖全，但重新引入执行策略等坑，被否决。
- v1 即引入纯 Node 库做 win-* 域：库质量参差、覆盖不全，推迟到有明确需求时再评估。
