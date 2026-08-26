## 多代理要求

AGENTS.md 和 CODEBUDDY.md 内容必须保持一致。

## 设计原则

交互与输出设计总纲——四层优先级链（ADR-0016），优先级从高到低：

1. 交互轮速最少（用户输入轮次最少）
2. LLM 请求次数最少
3. 输出 token 最少
4. 输入 token 最少

下游项是上游项的让步对象：为少一轮可多请求；为少一次请求可多输出；为少输出可多输入。

## Agent skills

### Issue tracker

Issue 以本地 markdown 文件形式存放在仓库 `.scratch/` 下。参见 `docs/agents/issue-tracker.md`。

### triage 标签

五个标准 triage 角色的标签字符串等于其名称（如 `needs-triage`、`wontfix`）。参见 `docs/agents/triage-labels.md`。

### 领域文档

单一上下文：仓库根目录 `CONTEXT.md` + `docs/adr/`。参见 `docs/agents/domain.md`。

### 临时文件

所有临时脚本统一放在仓库 `.temp/scripts/` 下；其他临时文件（脚本输出、日志等）也要分类，放在 `.temp/` 的子目录下（如 `.temp/output/`、`.temp/logs/`），保证仓库根目录干净。