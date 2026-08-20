# ADR-0011: dsh 插件全量注册 58 工具，不做域裁剪

- 状态：已接受（2026-08-20）
- 关联：memorial 002 D2

## 背景

dsh 内置 shell/fs 工具（bash / pwsh / read / write / edit / read_image），与 win-shell-mcp 的 shell_exec / fs_read / fs_write 等域重叠；但 git / pkg / archive / hash / json / net(dns/tcp/ping/listen) 域在 dsh 中完全空白。

工具命名经查证无冲突：dsh 用裸名（read/write/bash），win-shell-mcp 全部域前缀命名（fs_read/shell_exec/net_get…）。

## 决策

插件全量注册 58 个工具；部署时由 dsh 侧配置 disable 内置 tool-bash / tool-fs 等重叠工具，win-shell-mcp 成为统一命令来源。dsh 无 aliases 概念，仅注册正名（aliases 保留给 MCP 侧）。

## 被否决的替代

- **只补空白域**（git/pkg/archive/hash/json/net 等）：模型需同时学两套工具心智（bash 自由命令 + 确定性工具），命令来源分裂，错误率问题未解决。否决理由：用户目标正是"统一确定性命令来源"。
- **只做 shell_exec 强化版**：未发挥 58 工具存量价值。

## 后果

- 模型可见工具集合大幅扩大，需依赖 dsh system prompt 的工具排序/描述质量。
- 与 dsh 内置工具并存时（未 disable），模型可能混淆两套 fs 工具——部署文档需明确 disable 清单。