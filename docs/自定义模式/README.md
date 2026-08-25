# 自定义模式：JX 模式 / JX 模式 Test

本目录是两个 dsh agent preset 的**可安装打包**：每个子目录就是一个完整模式，复制到用户配置根即生效。

```
docs/自定义模式/
├── README.md                  # 本文档（安装方法）
├── jx-mode/                   # JX 模式
│   ├── preset.yml             # 模式列表显示元数据（显示名「JX模式」、order: 5）
│   ├── agent.cordis.yml       # agent-plane 组合（persona 两条规则 + standard 全量底座）
│   └── skills/jx-mode/SKILL.md        # 随模式携带的执行细则
└── jx-test/                   # JX 模式 Test
    ├── preset.yml             # 显示名「JX模式Test」
    ├── agent.cordis.yml       # jx-mode 组合 + persona 第三条规则
    └── skills/jx-test/SKILL.md        # 细则 + bug 登记契约
```

## 模式一览

| | jx-mode | jx-test |
| --- | --- | --- |
| 定位 | 标准能力 + 两条工作规则 | jx-mode 全部内容 + 测试职责 |
| 规则一 | 工具优先 win-shell-mcp（58 工具映射表见自带技能） | 同左 |
| 规则二 | 过程事实沉淀进 JXK 知识库（`add_fact`，中英双语） | 同左 |
| 规则三 | — | 发现 win-shell-mcp / jxk 的问题当场登记到 bug 收集（tag `type:bug/bug`），登记后按回退规则继续干活 |

细则内容见各自 `SKILL.md`；设计原理与 dsh preset 机制说明见 [../dsh/README.md](../dsh/README.md)。

## 前置条件

1. 已安装 DeepSeek Harness（dsh）；用户配置根默认 `~/.dsh`，设置了 `DSH_HOME` 则以其为准。
2. win-shell-mcp 以 MCP 形式挂在 profile 补丁层（工具名 `mcp__win-shell-mcp__*`）。preset 不负责接线——未挂载时模式仍可用，按技能内回退规则走内置工具。
3. （可选，规则二/三需要）知识库 MCP（imagetutu / jxk）同样挂在 profile 补丁层；未连接时按技能内异常处理兜底。

## 安装方法

在目标机器上用 PowerShell 执行（把 `$src` 改成仓库实际路径）：

```powershell
$src = "<仓库路径>\win-shell-mcp\docs\自定义模式"
$dst = "$HOME\.dsh\.agent-presets"

# 安装全部模式
foreach ($mode in @("jx-mode", "jx-test")) {
    New-Item -ItemType Directory -Force "$dst\$mode\skills\$mode" | Out-Null
    Copy-Item "$src\$mode\preset.yml", "$src\$mode\agent.cordis.yml" "$dst\$mode"
    Copy-Item "$src\$mode\skills\$mode\SKILL.md" "$dst\$mode\skills\$mode"
}
```

只装一个模式时，把循环体里的 `$mode` 直接换成 `"jx-mode"` 或 `"jx-test"` 执行一次即可。

### 启用与验证

- 新开一个 dsh 会话，模式选择列表应出现「JX模式」（排序 order 5）和「JX模式Test」。列表动态扫描用户根，通常无需重启 harness；未出现就刷新页面。
- 会话内验证三点：系统提示含 JX 规则；工具目录出现 `mcp__win-shell-mcp__*` 系列；技能目录出现 `jx-mode` / `jx-test`。
- 运行中的会话不会中途切换模式——设计如此，新开会话即可。

### 卸载

删除对应部署目录即可，不影响其他模式与运行中的会话；已录入知识库的事实与 bug 保留：

```powershell
Remove-Item -Recurse -Force "$HOME\.dsh\.agent-presets\jx-test"   # 以 jx-test 为例
```

### 升级

改文件后重新执行上面的安装命令覆盖即可（Copy-Item 覆盖同名文件）。升级不影响知识库数据。

## 维护约定（权威源与同步）

- **jx-mode**：细则权威源是 [`../dsh/skills/jx-mode/SKILL.md`](../dsh/skills/jx-mode/SKILL.md)（历史原因位于 docs/dsh）；本目录 `jx-mode/` 是它的等价打包副本，两处必须同步修改。
- **jx-test**：权威源就是本目录 `jx-test/`（仓库内唯一副本）。
- 部署副本（`~/.dsh/.agent-presets/`）若被现场调优，记得回流到权威源，避免漂移。
- jx-mode 另有一个 CodeBuddy 技能载体（`~/.codebuddy/skills/jx-mode/SKILL.md`），表格类改动需一并同步。
- 版本记录在各 `SKILL.md` frontmatter 的 `metadata.version`（当前 jx-mode 1.2.0 / jx-test 1.1.0，对应 win-shell-mcp 0.2.0）。
- 不要手动改 `agent.cordis.yml` 里 planning / compaction / delegation 三个 group 行：preset 内发布 service 的行必须放在带 `isolate` realm 的 group 里，否则多会话挂载直接被拒（机制见 [../dsh/README.md](../dsh/README.md) 构建原理一节）。
