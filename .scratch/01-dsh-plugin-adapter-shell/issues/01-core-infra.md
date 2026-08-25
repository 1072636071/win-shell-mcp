# 核心基础设施与试点工具（fs_read）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** `fs_read` 可通过 MCP 和 DSH 插件两个宿主调用，且两个宿主都正确识别其 outputSchema 与 readOnlyHint 注解；构建系统产出三入口包（`./mcp` `./plugin` `./core`）。

**验收标准：**

- [ ] tsup 配置改为多 entry（`src/index.ts` `src/plugin.ts` `src/core.ts`），构建产出 `dist/index.js` `dist/plugin.js` `dist/core.js`
- [ ] `package.json` exports 增加 `"./core"` `"./plugin"` 子路径；`@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 以 optional peerDependencies 声明
- [ ] `Tool` 接口扩展 `outputSchema?: z.ZodType` 与 `annotations?: ToolAnnotations`（先可选，带默认值回退）
- [ ] `server.ts` 的 `listTools()` 条件透传 `outputSchema` 与 `annotations`（有则传，无则省略）
- [ ] `plugin.ts` 骨架：导出 Cordis 插件对象（`name: 'tool-win-shell'`、`Config: { exclude?: string[] }`、`apply()`），内含 `defineTool` 注册模式与 `execute` 解包适配器（`AnyToolResult.ok ? return data : throw ToolCallError`）
- [ ] `fs_read` 补全 output zod schema（描述 success data 结构）与 `annotations: { readOnlyHint: true }`
- [ ] 测试：构建产物验证（三入口文件存在、exports 可解析）；`fs_read` MCP 投影测试（`listTools` 输出含正确 outputSchema + annotations）；`fs_read` DSH 投影测试（mock defineTool 调用含正确 output.schema + isConcurrencySafe）；execute 解包测试（ok→return data, fail→throw ToolCallError）

## 评论

- 来自 memorial 006 / PRD 01：本工单是全部后续工单的根基。execute 解包适配器的模式（`AnyToolResult → canonical value / ToolCallError`）在此确立，后续工单只复用不改动。
- outputSchema/annotations 先设为可选，允许 02-04 工单分批填充；06 工单最终收缩为必填或保留 guard test 强制。
