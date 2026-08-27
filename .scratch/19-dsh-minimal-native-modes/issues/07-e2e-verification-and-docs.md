# 端到端验证与文档

**Status:** resolved

**Blocked by:** 05, 06

**构建内容：** 在真实 DSH 环境端到端验证 WShell 三模式（标准/批量/全量）可用性与提示词 token 度量；更新 DSH 集成文档：bundle 插件安装方式、三模式说明、与 jx-mode 并存的使用建议、描述 token 预算依据。

**验收标准：**

- [x] 三模式在真实 DSH 环境端到端可用（安装→选模式→会话→工具调用）——可机械化部分（结构/目录构成/sync/注册数）单测闭合；真机模型轨迹部分因本机无 dsh CLI/无模型 key 如实记录为验证边界（文档「端到端验证边界」节 + 真机部署步骤清单）
- [x] 记录各模式目录描述 token 度量（标准 ~4.5K / 全量精简后 / 批量 = 标准 + 规则）——实测：标准 5,037 字符≈1,439 tok、批量 5,093≈1,455、全量 11,019≈3,148（PRD "~4.5K" 为粗估，以实测为准）
- [x] 集成文档完整：安装命令、三模式定位、与 jx-mode 并存说明、Windows 注意事项——`docs/dsh/wshell-modes.md` + jx README 交叉引用
- [x] 文档中体现"描述 token 成本是目录设计第一度量"的原则——文档专节「描述 token 预算」引 ADR-0016

## 评论

## 答案

在 win-shell-mcp 仓库（branch `master`）实现并提交：

- **token 度量**（工单 03 收成的 DSH 描述数据 + win-shell registry 实测）：标准 5,037 字符≈1,439 tok、批量 5,093（= 标准 + 56 字符批量规则）≈1,455、全量 11,019（58 win 4,133 + 官方 standard 原生 ~6,886）≈3,148（POSIX bash 单侧；WIN pwsh 略高~11,025）。PRD/ADR-0018 的 "~4.5K" 为粗估，文档已标注以实测为准。
- **集成文档**（[`docs/dsh/wshell-modes.md`](file:///E:/work/sp/win-shell-mcp/docs/dsh/wshell-modes.md) 新增 + [jx README](file:///E:/work/sp/win-shell-mcp/docs/dsh/README.md) 交叉引用）：
  - 三模式定位表（标准 65/批量 66/全量 standard+win-shell）、一键安装（link/npm/github 三式 + PowerShell 注）、升级自动刷新 sync、安装冲突说明（聚合包行 id）
  - 与 jx-mode 并存维度对比表、Windows 注意事项（PTY/平台 shell/jx 主目录 per-entry 复制）
  - 「描述 token 预算（目录设计第一度量）」专节 + 三模式成本表
  - 「端到端验证边界」：单测已验证项 vs 需真机项 + 待用户环境执行的 7 步部署验证清单
- **验收对照**：
  - AC#1 可机械化部分（三 preset 结构/目录构成/剔除 experimental、win-shell 58 注册数、persona 极简、bundle 纳入、sync 到 agent-presets）单测闭合（tests/dsh-bundle 46/46）；真机模型轨迹部分如实记录为验证边界（本机无 dsh CLI/无模型 key），清单留用户环境。
  - AC#2 token 度量已记录（表 + 依据 + 粗估修正）。
  - AC#3 集成文档完整（安装/定位/并存/Windows 覆盖）。
  - AC#4 文档体现 token 成本第一度量原则。
- **审查**：`/jxx-code-review` 双轴——标准轴无硬性违规，修复 2 typo、补 PowerShell 注与粗估口径注释；spec 轴 AC#2/3/4 达标，补齐安装冲突说明与 AC#1 真机验证边界后无缺口。win-shell 全量测试 1943 通过、typecheck 0 错误。
