# JX 模式（DSH Agent Preset）

> 本目录是 JX 模式的**权威模板**与说明文档。部署实例位于用户配置根 `~/.dsh/.agent-presets/jx-mode/`（2026-08-24 部署）；两者不一致时，以本目录为源同步过去。
>
> 基线：DeepSeek Harness（dsh），`DSH_HOME=C:\Users\jxc123\.dsh`，profile=`web`。
>
> **姊妹文档**：win-shell-mcp 的 WShell 三模式（标准/批量/全量，bundle 插件一键
> 安装）见 [wshell-modes.md](./wshell-modes.md)。两者在模式选择器并存、互不覆盖。

## 这是什么

JX 模式是 dsh 的一个 agent preset（会话工作模式）：在**标准模式的完整能力之上**追加两条工作规则——

1. **工具优先 win-shell-mcp**：凡 win-shell-mcp 有对应工具的操作（文件读写、搜索、shell 执行、git、网络、进程、包管理、归档等），一律调用 `mcp__win-shell-mcp__*` 工具完成，不直接手写 shell 命令；失败可回退内置工具，但必须注明原因。
2. **事实沉淀进 JXK**：过程中的可复用事实（决策理由、bug 根因、环境约束、外部系统行为、用户明确偏好）录入知识库 MCP 的 `add_fact`（content 双语 `中文 | English`，tags 双语命名空间 `namespace:中文/English`）；任务涉及已有领域知识时先 `search_content` 查库再动手。

设计动机：win-shell-mcp 的立项定位就是「AI 调用它而非直接写 shell 命令」。JX 模式把这一偏好从"靠模型自觉"升级为"由会话模式强制注入"，同时把过程知识回流到知识库，形成闭环。

## 目录结构与文件清单

```
docs/dsh/
├── README.md                  # 本文档
├── preset.yml                 # 预设元数据：显示名 / 描述 / 排序
├── agent.cordis.yml           # agent-plane 组合：16 个插件行（standard 全量 + 3 处修改）
└── skills/
    └── jx-mode/
        └── SKILL.md           # 随模式携带的执行细则（完整工具映射表等）
```

| 文件 | 作用 | 部署目标（`${DSH_HOME:-~/.dsh}/.agent-presets/` 下） |
| --- | --- | --- |
| `preset.yml` | 模式选择列表中的显示名「JX模式」、描述、排序 `order: 5` | `jx-mode/preset.yml` |
| `agent.cordis.yml` | 挂载的工具与提示段组合（见下文构建原理） | `jx-mode/agent.cordis.yml` |
| `skills/jx-mode/SKILL.md` | 规则细则：22 行映射表（覆盖 58 工具）、回退规则、记录范围、项目路由、护栏 | `jx-mode/skills/jx-mode/SKILL.md` |

## 构建原理

### dsh preset 机制（30 秒版）

- 模式列表 = 动态扫描 `${DSH_HOME:-~/.dsh}/.agent-presets/` 下每个含 `agent.cordis.yml` 的目录；`preset.yml` 提供 `name`/`description`/`order` 显示元数据，缺失时列表里只显示裸目录名。
- 一个 preset 是一份 **agent-plane Cordis 组合**：新会话选定该模式时挂载一次，随会话作用域卸载；宿主组合保留一切跨会话的东西（注册表、沙箱/审批栈、持久化、模型路由）。
- 硬约束：preset 内**发布 service 的行**必须放进带 `isolate` realm 的 group，否则多会话同名注册冲突、挂载直接被拒。本组合的三个服务组（planning / compaction / delegation）原样沿用 standard 的写法，不要动。
- 发行版自带预设（standard/code/minimal/cordis，位于 harness 安装目录）升级会被覆盖，**禁止直接修改**；自建预设放用户根，升级不碰——JX 模式因此落在用户根。

### 组合内容 = standard 全量 + 三处修改

以发行版 `standard` 的 16 行为底全部保留（shell/fs/搜索/任务/技能/目标/计划模式/压缩/委派与工作流/web 等），仅改三处：

| # | 行 | 修改 | 目的 |
| --- | --- | --- | --- |
| 1 | `persona`（@deepseek-ai/dsh-persona） | 文本换成 JX 身份 + 两条规则的紧凑版 | 每个请求都在场，模式不依赖模型自觉 |
| 2 | `skill-filesystem`（@deepseek-ai/dsh-skill-filesystem） | 增加 `customSkillDirs`，用 `!!js baseUrl` 表达式指向预设自带 `skills/` 目录 | 细则表不占 persona 体积，经 tool-skill 按需加载（与内置 cordis 预设携带编辑技能同一机制） |
| 3 | `planning` → `plan-mode.section` | 段尾追加一条：计划阶段 JX 规则休眠（只读检查仍可走 win-shell-mcp，但不入库事实） | 与 plan mode 的"不许变更"语义对齐 |

### MCP 为什么不在 preset 里

win-shell-mcp 与知识库 MCP（imagetutu/jxk）等服务器挂在 **profile 补丁层** `~/.dsh/profiles/web/cordis.patch.yml`，对一切模式的会话共享。preset 只负责改变"优先用谁"，不负责接线——这样其他模式也能手动调这些工具做对照实验。

### 双载体

同一套规则有两个载体，按使用场景选用：

| 载体 | 位置 | 生效方式 |
| --- | --- | --- |
| DSH preset（本目录） | `~/.dsh/.agent-presets/jx-mode/` | 新建会话时在模式选择中选「JX模式」 |
| CodeBuddy skill | `~/.codebuddy/skills/jx-mode/SKILL.md` | 会话内说「JX模式」「进入JX模式」等触发词 |

## 使用方式

**部署**（首次或从本目录同步）：

> 本模式连同 jx-test（JX模式Test）已打包在 [`docs/自定义模式/`](../自定义模式/README.md)，那里有覆盖两个模式的通用安装脚本；下面是 jx-mode 单独部署的等价命令。

```powershell
$src = "E:\work\sp\win-shell-mcp\docs\dsh"
$dst = "$HOME\.dsh\.agent-presets\jx-mode"
New-Item -ItemType Directory -Force "$dst\skills\jx-mode" | Out-Null
Copy-Item "$src\preset.yml", "$src\agent.cordis.yml" $dst
Copy-Item "$src\skills\jx-mode\SKILL.md" "$dst\skills\jx-mode"
```

**启用**：新开一个 DSH 会话，模式选择里选「JX模式」（列表动态扫描用户根，通常无需重启 harness；未出现就刷新页面）。当前运行中的会话不会中途切换——这是设计如此。

**会话内行为**：Agent 开工前加载 `jx-mode` 技能取完整映射表；重大事实当场入库；收尾回顾补漏。

**卸载**：删除 `~/.dsh/.agent-presets/jx-mode/` 目录即从列表移除，不影响其他模式与会话。

**验证部署成功**：新会话中工具目录应出现 `mcp__win-shell-mcp__*` 系列，且系统提示含两条 JX 规则；技能目录出现 `jx-mode`。

## 知识库接口差异

| 接口 | 特征 | 录入方式 |
| --- | --- | --- |
| jxk（JxKnowledgeBase，多租户） | 工具带 `project_name` 参数 | 先 `list_projects` 找当前项目的同名库；没有按约定新建（jxk 仓库 `data/projects/<name>/`）；跨 repo 事实拿不准就问用户 |
| imageTUTU（旧版单租户，当前 DSH profile 实际指向） | 工具无 `project_name` 参数 | 直接录入即可；该库已整体迁移为 jxk 的 `imagetutu` 项目，数据同源 |

若要让 DSH 直连 jxk：把 profile 补丁层 `mcp-imagetutu` 行的启动入口改为 `E:/work/sp/JxKnowledgeBase/src/index.js` 并重启 harness（改动影响所有会话，需自行权衡时机）。

## 维护约定

- **权威源 = 本目录**。修改流程：改这里 → 复制到用户根 → 新会话验证。
- 已部署副本若被单独现场调优，记得**回流**到本目录，避免两份漂移。
- 细则版本记录在 `skills/jx-mode/SKILL.md` frontmatter 的 `metadata.version`（当前 1.2.0，对应 win-shell-mcp 0.2.0：58 工具全量映射、pattern 三工具双模语义与表态要求、失败统一转 fail 契约）。
