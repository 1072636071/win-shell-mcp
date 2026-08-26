# 沉淀首批开发分析脚本（元数据长度 + 覆盖率短板）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 开发本项目的 AI 在 `.temp/scripts/` 下获得两个现成的独立 Node 分析脚本，可随时直接复用来定位"哪些工具元数据超长"与"覆盖率短板在哪些文件"，不再每次手写一次性分析脚本。第一个脚本读取 `listTools()` 投影，输出各工具 description 长度与 `JSON.stringify` 后 inputSchema/outputSchema 长度的降序排行，供 08 号工单式精简直接复用；第二个脚本解析 `coverage/` 的 v8 产物，列出低于门槛（lines 85 / branches 84，与 vitest 配置一致）的文件清单，供补测定位一步到位。

**验收标准：**

- [ ] 元数据长度分析脚本落地于 `.temp/scripts/`，为独立可运行的 Node 脚本，直接调用 `listTools()` 投影（覆盖当前全部工具），输出各工具 description 长度与 inputSchema/outputSchema 序列化长度按降序排行，附具体字节数
- [ ] 覆盖率短板脚本落地于 `.temp/scripts/`，为独立可运行的 Node 脚本，解析 `coverage/` 下 v8 覆盖率产物（vitest 覆盖率报告运行后生成），列出 lines < 85 或 branches < 84 的文件清单；门槛值与 `vitest.config.ts` 一致
- [ ] 两个脚本头部注释均写明：用途、运行方式、输出说明（遵循 `.temp/` 临时但可复用的仓库约定）
- [ ] 两脚本均在本仓库实际跑通：输出非空、格式正确（元数据脚本对每个工具给出 name + 长度数字；覆盖率脚本给出文件路径 + 指标数值），冒烟产物置于临时目录、不入测试管线
- [ ] 不触碰 `src/`、不改任何测试断言、不改覆盖率门槛与 include 范围；全量 `npm test` 保持绿
- [ ] 不新增入库测试文件；两脚本的验收以一次性实测记录代替

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **2026-08-26 实施完成**：
  - `.temp/scripts/metadata-length-report.mjs`：import `dist/core.js` 的 `listTools()`，输出 61 个工具的 description/inputSchema/outputSchema 长度降序排行（含合计）。实测跑通：batch_run 2432 字符最长、text_replace 1724 次之。产物 `.temp/output/metadata-length-report.txt`。
  - `.temp/scripts/coverage-shortfalls.mjs`：不传参时自动跑 `vitest run --coverage --coverage.reporter=json-summary` 生成 `coverage-summary.json`（落到 `.temp/output/coverage-json/`），再解析 lines.pct/branches.pct，列出 lines<85% 或 branches<84% 的文件；或传参直接解析指定 json。实测跑通（42 文件 1897 passed，列出 16 个短板文件）。产物 `.temp/output/coverage-shortfalls.txt`。
  - 两脚本头部注释均写明用途/运行方式/输出说明，遵循 `.temp/scripts/` 约定；冒烟产物入 `.temp/output/`，不入测试管线。
- 冒烟验证：两脚本需在本仓库实际运行并记录输出，产物（如排行榜文本、短板清单）放入 `.temp/output/` 或 `.temp/logs/` 分类目录，不提交入库。
- 范围边界：本工单只保证首批两个脚本落地；其他脚本按需后续另立工单（超出范围）。
