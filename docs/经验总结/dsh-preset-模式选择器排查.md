# DSH Preset 模式选择器只显示全量模式问题排查经验总结

## 问题现象

DSH Web GUI 的 Agent 模式选择下拉框中，只显示「WShell 全量模式」，而「WShell 标准模式」和「WShell 批量模式」未出现。

![问题截图](../dsh/wshell-modes.md)

## 排查过程

### 第一阶段：怀疑 CRLF 换行符问题

**现象**：PowerShell 读取 `~/.dsh/.agent-presets/wshell-standard/preset.yml` 时中文字符显示为乱码（`标准模式` → `鏍囧噯妯″紡`）。

**分析**：
- 发现 Git 全局配置 `core.autocrlf=true`，导致仓库中的 LF 文件被转换为 CRLF
- DSH 的 YAML 解析器对 CRLF + UTF-8 的处理可能有问题

**操作**：
1. `git config --global core.autocrlf false`
2. `git checkout HEAD -- presets/` 恢复原始 LF 文件
3. 重新构建并同步 preset

**结果**：乱码问题解决，但模式选择器仍只显示全量模式。

---

### 第二阶段：检查 DSH Preset 发现机制

**关键发现**：阅读 DSH 源码 `packages/preset/agent-presets/src/discovery.ts`，了解到 DSH 的 preset 发现机制会：

1. 扫描 `~/.dsh/.agent-presets/` 目录下的所有子目录
2. 检查每个子目录是否包含 `agent.cordis.yml`
3. **验证 `agent.cordis.yml` 中引用的每个插件是否可解析**（`compositionProblem` 函数）
4. 如果任何插件无法解析，整个 preset 被标记为 `broken`，不会显示在模式选择器中

**验证方法**：

```powershell
# 检查 DSH 插件是否存在
Test-Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\@deepseek-ai\dsh-tool-lsp"
# 结果：False（不存在）
```

---

### 第三阶段：定位根本原因

**对比分析三个 WShell preset 的 `agent.cordis.yml`**：

| Preset | 引用的插件 | dsh-tool-lsp | 显示状态 |
|--------|-----------|--------------|---------|
| wshell-standard | persona, tool-win-shell, tool-fs, tool-web, **tool-lsp** | ❌ 引用 | ❌ 不显示 |
| wshell-batch | persona, tool-win-shell, tool-fs, tool-web, **tool-lsp** | ❌ 引用 | ❌ 不显示 |
| wshell-full | persona, tool-win-shell, tool-bash, tool-pwsh, tool-fs, tool-fs-search, tool-jobs, skill-filesystem, tool-skill, tool-goal, planning, delegation, tool-ask-user, tool-todo, tool-web | ❌ 未引用 | ✅ 显示 |

**根本原因**：

`@deepseek-ai/dsh-tool-lsp` 不是 DSH base/web-app bundle 的标准依赖，在 `~/.dsh/profiles/web/node_modules/` 中不存在。WShell 标准/批量模式的 `agent.cordis.yml` 引用了这个不存在的插件，导致 DSH 的 preset 健康检查失败，preset 被标记为 `broken`。

梁神模式（liangshen）也没有引用 `dsh-tool-lsp`，所以它能正常显示。

---

## 解决方案

从 WShell 标准模式和批量模式的 `agent.cordis.yml` 中**移除 `tool-lsp` 行**：

```yaml
# 移除以下行：
- id: tool-lsp
  name: '@deepseek-ai/dsh-tool-lsp'
```

**理由**：
1. LSP 是可选能力，非所有 DSH 部署都安装
2. WShell 全量模式（依赖 DSH standard 组合）已包含 LSP
3. 需要 LSP 的会话可选用 WShell 全量模式

---

## 修改后的目录构成

| 模式 | 工具数 | 构成 |
|------|--------|------|
| WShell 标准模式 | 64 | 58 win-shell + 4 fs + 2 web |
| WShell 批量模式 | 65 | 59 win-shell(含batch_run) + 4 fs + 2 web |
| WShell 全量模式 | ~121 | 58 win-shell + DSH standard 完整组合 |

---

## 关键经验

### 1. DSH Preset 健康检查机制

DSH 不会静默跳过有问题的 preset，而是会：
- 在发现阶段检查每个 preset 的 `agent.cordis.yml` 格式
- 验证每个引用的插件是否能在 `node_modules` 中解析
- 将不可用的 preset 标记为 `broken`，不显示在 UI 中

**排查方法**：检查 DSH 源码 `discovery.ts` 的 `compositionProblem` 和 `unresolvableRows` 函数。

### 2. CRLF 换行符的坑

Windows 开发 + Git `core.autocrlf=true` 会导致：
- 仓库中的 LF 文件被转换为 CRLF
- 某些工具（如 PowerShell `Get-Content`）在特定 code page 下读取 UTF-8 + CRLF 会出现乱码

**建议**：
```bash
git config --global core.autocrlf false
```

### 3. 插件依赖的验证

在编写 preset 时，必须确保引用的所有插件都存在于 DSH 的依赖树中。验证方法：

```powershell
# 检查插件是否在 profile 的 node_modules 中
Test-Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\@deepseek-ai\dsh-tool-xxx"

# 或检查是否在 deepseek-harness 的 packages 目录中
Test-Path "E:\work\sp\deepseek-harness\packages\xxx\tool-xxx"
```

### 4. DSH 重启要求

DSH 的 preset 发现机制在**启动时**扫描 `~/.dsh/.agent-presets/`，运行时不会自动重新扫描。修改 preset 后必须重启 DSH web 服务器：

```powershell
# 查找并终止 DSH 进程
netstat -ano | Select-String ":3080"
taskkill /PID <PID> /F
```

### 5. 文档与实现的一致性

原始文档（`docs/dsh/wshell-modes.md`）描述标准模式为「65 工具（58 + 4 fs + 2 web + 1 lsp）」，但实际 DSH 部署中 `dsh-tool-lsp` 并非总是可用。需要根据实际情况调整文档和实现。

---

## 相关文件

- `presets/wshell-standard/agent.cordis.yml` — WShell 标准模式组合
- `presets/wshell-batch/agent.cordis.yml` — WShell 批量模式组合
- `presets/wshell-full/agent.cordis.yml` — WShell 全量模式组合
- `src/dsh-bundle/sync.ts` — preset 同步逻辑
- `docs/dsh/wshell-modes.md` — WShell 模式文档

---

## 参考：DSH Preset 发现机制源码

来源：`E:\work\sp\deepseek-harness\packages\preset\agent-presets\src\discovery.ts`

核心函数：
- `scanRoot()` — 扫描 preset 目录
- `compositionProblem()` — 检查 composition 文件是否可加载
- `unresolvableRows()` — 检查不可解析的插件行
- `packageInstalled()` — 向上查找 node_modules 验证包是否存在
