# WShell 三模式（DSH Agent Presets · Bundle 插件）

> 本文档是 WShell 标准/批量/全量三模式的**权威说明与使用指南**。三模式以
> `win-shell-mcp` DSH **bundle 插件**提供：一条命令安装后，模式选择器出现三个
> 「WShell」模式，各自以 native 全量注入、单行极简 persona 工作。
>
> 与 [JX 模式](./README.md) 并存（分列模式选择器），互不干扰。
>
> 基线：DeepSeek Harness（dsh），profile=`web`。实现记录见
> `.scratch/19-dsh-minimal-native-modes/`（PRD/工单 04/05/06/07）与
> `docs/adr/0018-dsh-minimal-native-integration.md`、`docs/memorial/007-dsh-minimal-alignment/`。

## 是什么

WShell 是 win-shell-mcp 的 DSH 插件定制形态：用 `bundle` 插件一键安装三个 agent
preset，使 DSH 会话 native 呈现 win-shell-mcp 的确定性命令工具（描述精简，
30–80 字符/条）+ DSH 原生补缺，persona 全程单行极简（`You are a helpful software
engineer assistant.`；`complete:true` / `includeRuntimeContext:false`）。

| 模式 | 目录 | 定位 |
| --- | --- | --- |
| **WShell 标准模式**（order 6） | 58 win-shell 域工具 + DSH 原生 fs 组（read/write/edit/read_image）+ web 组（web_fetch/web_search）+ lsp = 65 | 精确编码的默认选择：确定性命令替代冗长 shell/编辑器描述 |
| **WShell 批量模式**（order 7） | 标准 + 放行 `batch_run`（win-shell 59）| 多步操作（读→改→写、批量改多文件）被 persona 引导用 `batch_run` 一次完成，减少往返 |
| **WShell 全量模式**（order 8） | 58 win-shell + DSH 官方 `standard`（完整编码 agent）原生组合 | 能力最大化：win-shell 命令 + full coding-agent 编排（subagent/subagent_fork/workflow/ralph/goal/jobs/skill/todo/ask-user/plan-mode 等） |

> **全量模式口径**：原始 PRD 以 "~121 = 58 + DSH 全量原生" 粗估目录；经实施裁定
> （工单 06 评论）取「DSH 官方 standard 组合 + win-shell」，剔除 experimental/
> opt-in 包（experimental-tool-agent-team、tool-cordis）与生产未装 provider
> （codex/claude-code），实际目录远低于 121。选择全量 = 以 DSH 完整编码 agent
> 能力为准，而非追逐目录数字。

## 一键安装

顶层包 `win-shell-mcp` 即 DSH bundle：`package.json` 声明
`dsh.bundle.patch` → `cordis.patch.yml`（insert `wshell-bundle` 行），
运行时把包内 `presets/` 树同步进 `~/.dsh/.agent-presets/`。

```bash
# 本地开发（仓库根 build 后，link: 安装）
cd E:\work\sp\win-shell-mcp
pnpm build
dsh plugin --profile web add link:$(pwd)

# npm 发布版
dsh plugin --profile web add win-shell-mcp

# git 直装（部署用，会在 prepare 阶段自动构建）
dsh plugin --profile web add github:1072636071/win-shell-mcp#<branch>
```

> `link:$(pwd)`、`github:#branch` 等为 dsh CLI 的包规范语法，跨平台一致；
> 在 Windows PowerShell 下 `$(pwd)` 展开为当前路径，可在 PowerShell 中运行
> 同一命令。本地开发也可先 `npm run build` 后用 `link:` 协议指向仓库根。

**升级自动刷新**：bundle 的 `wshell-bundle` 插件挂载即 sync——版本升级后重启
dsh web，`~/.dsh/.agent-presets/wshell-*` 三目录按字节幂等刷新（源与目标一致则
跳过）。新增/改名 preset 也随 sync 传播。卸载模式 = 从 profile 移除插件，
`RETIRED_PRESETS` 保留用于已停发 presets 的清理。

**安装冲突**：若与其他 DSH bundle 聚合包（如 `dsh-web-all`）共装，`cordis.patch.yml`
的行 `id` 可能冲突（聚合包行 id 常带前缀如 `wshell-bundle` vs 独立装原 id，参考
PRD 补充说明/dsh-web-ui 文档）。冲突不阻断共存，但同一插件双源加载无收益；
建议只保留一个来源（优先级：独立 `win-shell-mcp` bundle > 聚合包）。

**启用**：新开一个 DSH 会话，模式选择器选「WShell 标准/批量/全量模式」。
（选择器动态扫描 `.agent-presets/` 根，通常无需重启；未出现就重启 dsh web。）
当前进行中的会话不会中途切换——设计如此。

## 与 JX 模式并存

| 维度 | WShell 三模式（本 bundle） | JX 模式（`docs/dsh/README.md`） |
| --- | --- | --- |
| 方式 | native 全量注入 win-shell 命令工具 | standard 之上追问「工具优先 win-shell + 事实入知识库」 |
| persona | 单行极简，无规则堆砌 | JX 身份 + 两条工作规则注入 |
| 知识库 | 无（不强制沉淀） | 强：事实入 jxk/imageTUTU |
| 目录 | 标准 65 / 批量 66 / 全量（standard+win-shell） | standard 全量 + MCP 补层 |
| 适用 | 精确编码、批量改动、编排任务 | 知识沉淀、长任务闭环 |

共存：三模式独立命名、分列选择器，互不覆盖。按任务选：**精确编码 → 标准**、
**批量多步 → 批量**、**编排型 → 全量**、**知识沉淀 → JX**。WShell 不带 jx-mode
的工具优先/知识库规则，不注入工具映射表。

> **MCP 补层说明**：win-shell-mcp MCP server 与知识库 MCP 也可挂在 profile 补丁层
> `~/.dsh/profiles/web/cordis.patch.yml` 供一切模式共享；WShell 三模式经 preset
> 内 `./tool-win-shell.mjs`（re-export `win-shell-mcp/plugin`）在 agent-plane
> 注册工具，故**不依赖** MCP 补层即可 native 用 win-shell 命令工具。

## Windows 注意事项

- DSH PTY 后端 linux/darwin-only：WShell 三模式目录以 win-shell-mcp 工具为主
  （全 one-shot、无持久 PTY 会话），不受影响；若会话需持久 shell，DSH 侧需按
  梁神模式先例走 Git Bash 无状态方案。
- baseline shell 平台二选一：一次性 shell 工具（bash/pwsh）按 `process.platform`
  门控，Win 挂 pwsh 栈、POSIX 挂 bash 栈（沿用官方 standard 写法）。
- 安装路径含非 ASCII 主目录（如 `C:\Users\姜**`）：bundle sync 走 per-entry
  复制而非 `fs.cpSync(recursive)`（Node 22 会崩溃），兼容 CJK 主目录。

## 描述 token 预算（目录设计第一度量）

原则（ADR-0016 优先级链、PRD 补充）：**描述 token 成本是目录设计的第一度量**。
新增/修改工具描述保持一行话风格；模型可见描述受 DSH `verify-tool-catalog`
长度门禁约束（工单 03，默认 ≤200 字符，行为事实可放宽）。

三模式目录描述成本（实测，win-shell registry + DSH 工单 03 收成数据）：

| 模式 | 描述字符 | 估算 token（~3.5 字符/token） |
| --- | --- | --- |
| WShell 标准模式 | 5,037 | ~1,439 |
| WShell 批量模式 | 5,093（= 标准 + 56 字符批量规则） | ~1,455 |
| WShell 全量模式 | 11,019（58 win 4,133 + 官方 standard 原生 ~6,886） | ~3,148 |

> PRD/ADR-0018 曾以 "~4.5K 描述" 粗估标准模式成本——该值为 PRD 阶段拍值，
> 工单 07 实测（win-shell registry + DSH 收成）为 **5,037 字符**，以实测为准。
> 全量按 POSIX(bash) 单侧计；WIN(pwsh) 原生略高（~6,892，因 pwsh 描述 1,039 vs
> bash 795，两者之差即 shell 单侧选择差异），总 ~11,025 字符 ≈ 3.15K token。
> token 按英文描述 ~3.5 字符/token 估算（保守 ~4 字符/token 时三模式分别约
> 1,259 / 1,273 / 2,755）。
>
> 对比：DSH 精简前全目录描述 21,627 字符 → 精简后 17,489（−19.1%，工单 03）；
> WShell 标准模式 5.0K 字符 ≈ 原 DSH 全量的四分之一不到，是"描述 token 成本
> 第一度量"下的务实形态。全量模式依赖 01/02/03 精简才能让 11K 字符的目录可接受。

## 目录构成

以下为三模式 `agent.cordis.yml` 的构成摘要（组挂载）；完整文件随 bundle 安装后
在 `~/.dsh/.agent-presets/wshell-*/agent.cordis.yml`，仓库权威源在
`presets/wshell-*/`。

```yaml
# 公共：persona 单行极简 + tool-win-shell（exclude 3 meta，58 域工具）
# 标准/批量：+ tool-fs / tool-web / tool-lsp 三组
# 批量：+ tool-win-shell 保留 batch_run（exclude 只剔 2 meta，win-shell 59）
# 全量：+ DSH 官方 standard 原生组合（one-shot shell/fs/fs-search/jobs/skill/
#        goal/plan-mode/subagent/subagent_fork/workflow/ralph/ask-user/todo/web）
```

## 维护约定

- **权威源 = `presets/wshell-*/`**（仓库）。修改 preset → `git` 提交发布 → 升级
  bundle → 重启 dsh web → 新会话验证（sync 自动把新 preset 刷进用户根）。
- 模式配套单测：`tests/dsh-bundle/presets.test.ts`（结构/目录构成/persona 极简/
  win-shell 注册数）与 `index.test.ts`（bundle 纳入 + sync）。
- 三模式从 iOS 选取时 meeting 首轮请求只带本模式的目录（无 MCP 补层依赖）。

## 文件清单

```
presets/
├── wshell-standard/            # WShell 标准模式（order 6，65 工具）
│   ├── preset.yml
│   ├── agent.cordis.yml
│   └── tool-win-shell.mjs
├── wshell-batch/               # WShell 批量模式（order 7，66 工具）
│   └── ...
└── wshell-full/                # WShell 全量模式（order 8，standard 组合 + win-shell）
    └── ...
cordis.patch.yml                # bundle patch：insert wshell-bundle 行
src/dsh-bundle/                 # sync/mountOnce/schema 实现
```

## 端到端验证边界

工单 07 的端到端验证（安装→选模式→会话→工具调用）依赖 DSH host + 模型 key +
浏览器环境，本机（Windows 开发机）无 dsh CLI、无模型 key，无法完整执行。以下为
已验证的部分与验证边界：

| 验证项 | 验证方式 | 状态 |
| --- | --- | --- |
| 三模式 `agent.cordis.yml` 结构校验 | `validateAgentCordis`（单测 presets.test.ts） | ✅ 通过 |
| 目录构成（persona/tool-win-shell/DSH 原生行/剔除 experimental/opt-in） | 断言逐一比对（presets.test.ts） | ✅ 通过 |
| win-shell 注册数（58 域工具） | 从 registry 推导（单一来源，presets.test.ts） | ✅ 通过 |
| persona 极简（complete/includeRuntimeContext/<200 字符） | 正则断言（presets.test.ts） | ✅ 通过 |
| bundle 纳入（presets 树发现） | `bundledPresetsRoot` 断言（index.test.ts） | ✅ 通过 |
| sync 到 agent-presets | 临时 DSH_HOME 模拟同步（index.test.ts） | ✅ 通过 |
| 模式选择器出现「WShell 标准/批量/全量模式」 | 需真实 DSH host + 浏览器 | ⏳ 留用户环境 |
| 会话内工具调用可用 | 需真实 DSH host + 模型 key | ⏳ 留用户环境 |
| 全量模式轨迹评测（~11K 字符目录） | 评测专属任务，不在本仓库 | ⏳ 另立验证 |

> 真机部署验证步骤（待用户环境执行）：
> 1. 在 DSH 开发机运行 `dsh plugin --profile web add win-shell-mcp`（或 `link:`/`github:` 方式）
> 2. 重启 `dsh web` 进程（页面刷新不够）
> 3. 新建会话，检查模式选择器出现三个「WShell」模式
> 4. 选择标准模式，验证工具目录含 65 工具（58 win-shell + fs/web/lsp）
> 5. 选择批量模式，验证工具目录含 batch_run
> 6. 选择全量模式，验证工具目录含 subagent/workflow 等编排工具
> 7. 验证各模式工具调用正常、描述无截断/混乱