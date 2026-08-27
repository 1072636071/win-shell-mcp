# bundle 插件骨架 + WShell 标准模式

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 在 win-shell-mcp 仓库交付 DSH bundle 插件：一条命令安装后，DSH 模式选择器出现「WShell 标准模式」；新会话中以单行极简 persona + 65 工具（58 个 win-shell-mcp 命令工具 + DSH 原生 fs/web/lsp 组）native 工作，描述总成本 ~4.5K。同时扩展插件测试套件，验证 preset 可解析、目录构成符合约定、persona 满足极简约束。

**验收标准：**

- [ ] 一条命令安装 bundle 插件，模式选择器出现「WShell 标准模式」
- [ ] 标准模式会话注册 65 工具（58 win-shell-mcp + fs 组 4 + web 组 2 + lsp 1），模型可见描述总成本 ~4.5K
- [ ] persona 保持单行极简（`You are a helpful software engineer assistant.`），无工具映射表/规则堆砌注入
- [ ] 插件升级后 preset 自动刷新（bundle sync 机制）
- [ ] 测试绿：preset 文件可解析、引用的插件行存在、目录构成断言、persona 极简约束断言（复用现有插件测试 seam）
- [ ] MCP 通用形态零改动，现有 MCP 测试全绿

## 评论

## 答案

交付 DSH bundle 插件骨架 + WShell 标准模式 preset（commit 随本批落地）：

- **bundle 插件**：`src/dsh-bundle/`（index 挂载 + sync 幂等同步 + schema 校验 + dsh-home 路径解析 + mountOnce 单实例）。`package.json` 声明 `dsh.bundle.patch → cordis.patch.yml`（insert `wshell-bundle` 行），`files`/`exports` 含 `presets`、`cordis.patch.yml`、`./dsh-bundle`；tsup 新增该入口。按梁神模式机制安装后，启动同步 `presets/` 树到 `~/.dsh/.agent-presets/`，升级自动刷新（sync 字节幂等）。
- **标准模式 preset**：`presets/wshell-standard/`（agent.cordis.yml + preset.yml「WShell 标准模式」order 6 + tool-win-shell.mjs 包装器）。目录 = persona + tool-win-shell + fs/web/lsp 三组。按 memorial 007 D9，标准模式需 65 工具 = 58 win-shell 域工具 + 4 fs + 2 web + 1 lsp；registry 现 61 = 58 域 + 3 meta（batch_run/tool_groups/list_domain_tools），故 `agent.cordis.yml` 对 tool-win-shell 行加 `config.exclude: [batch_run, tool_groups, list_domain_tools]`，剔除 3 meta 得 58 域工具。
- **persona 单行极简**：`text: You are a helpful software engineer assistant.`，并补齐官方 minimal 的 `complete: true` / `includeRuntimeContext: false`。
- **测试**：`tests/dsh-bundle/`（index/sync/schema/presets）新增并修复。presets.test 断言目录构成、tool-win-shell 剔除 3 meta、按 exclude 注册计数 = 58、persona 极简约束。修复 skeleton 遗留 3 处测试红（schema toContain-on-array、persona 块度量、mountOnce 全局态隔离）。
- **审查整改**：plugin.ts 陈旧「59 工具」注释更新为 61/58 语义；schema 解析正则/helper 导出供测试复用以消重；`docs/memorial/007` 与 `docs/adr/0018` 修正/澄清 58 域工具口径。
- **验收对照**：65 工具/58 域口径由新建断言强制；「一条命令安装 + 升级自动刷新 + 模式选择器 + ~4.5K token 度量」端到端留工单 07（e2e 验证 + 文档）。

后续工单 05/06 交付批量（复用标准 + batch_run）/全量模式；07 做安装文档与端到端验证。
