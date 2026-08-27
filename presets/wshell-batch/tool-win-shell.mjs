// WShell 系列 preset 的 win-shell-mcp 工具挂载点。
//
// 行 name 以 `./` 开头（preset 目录内相对解析），本文件 re-export
// `win-shell-mcp/plugin` 的 Cordis 插件对象（tool-win-shell）。具体注册哪些
// 工具由 preset 的 `agent.cordis.yml` 里 `tool-win-shell` 行的 `config.exclude`
// 决定——WShell 批量模式只剔除 2 个 meta 导航工具，保留 batch_run（58 域 +
// batch_run = 59，见工单 05 裁定）。`win-shell-mcp` 需可被 Node 从 profile 的
// node_modules 解析（dsh plugin 安装后）。
export { default } from "win-shell-mcp/plugin";
