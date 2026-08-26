# 12-tool-whitelist-env — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/12-tool-whitelist-env/PRD.md`（来源 07 源点 P1-2）。

## 目标

MCP server 面新增 `WIN_SHELL_TOOLS` 环境变量白名单（逗号分隔正名）：未列出工具不注册、砍掉固定开销；调用被裁工具返回清晰文案、与拼错工具名相区分；白名单解析收敛于一个纯函数配置模块，作为本批优化唯一新增代码 seam，供本工单与 11/15 号工单共用。

## 关键决策

- **配置模块 = 公共 seam（本批唯一新增代码）**：纯函数、不读 `process.env`（读取留唯一调用点）、接受原始字符串/`undefined` 入参，可注入测试。初版接口=白名单解析；11 号 `WIN_SHELL_LAZY`、15 号 `WIN_SHELL_TRUNCATE` 随后并入同一模块。**这是 11/15 的阻塞依赖点，宜优先落地（工单 01）。**
- **别名随正名共进退**：白名单按正名书写，写 `fs_list` 则 `ls`/`list_directory` 一起进退；别名不出现在白名单语法中，写别名归为未知条目。
- **错误区分**：被裁但内置存在 → "未在当前部署暴露（WIN_SHELL_TOOLS）"；内置不存在 → 维持 `Unknown tool: X`；`batch_run` 步骤解析同样受白名单约束、短路语义不变。
- **生效位置**：stdio 入口创建 server 时过滤内置工具表后注入（`createServer(tools)`/`callTool(name,args,tools)` 既有参数注入结构天然支持，无需全局态）；dsh 插件面不接入（已有 `config.exclude`）。
- **fail-fast**：白名单含未知工具名 → 启动即抛错并列出全部非法条目；不做忽略未知项的宽容模式。
- **组合语义固定**：白名单先过滤，11 号懒加载基于过滤后集合。
- **测试策略**：解析逻辑只测纯函数（表驱动）；server 行为只测外部可观察面（`listTools` 结果集、`callTool`/`batch_run` 错误文案），不测进程级启动失败（以纯函数错误返回值等价覆盖）。

## 涉及文件

- 配置模块（新建，seam）：`src/config/*.ts`（或仓库约定位置）——纯函数解析 `WIN_SHELL_TOOLS`，常量收敛于此
- `src/server.ts`：`startStdioServer`（用解析结果过滤后注入 `createServer`）；`callTool`（新增"被裁工具"错误分支，与 `Unknown tool` 区分）——现有参数注入结构复用，无新设施
- `src/tools/batch.ts`：`batchRunHandler` 步骤工具查找改为受注入工具表/白名单约束（当前用 `findTool` 全局表）
- 测试：`tests/contract/` 纯函数表驱动先例（`errors.test.ts` 风格）；`tests/server.test.ts` 工具子集注入（`createServer(baseline)` 先例）
- `README.md`：新增"环境变量"小节（本批共用，11/15 同节追加）
- `CHANGELOG.md`：Unreleased 段本特性条目

## 实施顺序

01（配置模块，公共 seam）→ 02（白名单生效+错误区分）→ 03（fail-fast+文档）。01 阻塞 02、03；02 阻塞 03；03 中 README 小节为 11/15 共用槽位，其自身即本批文档落地。

## 超出范围

- 不做黑名单语法（排除语义已由"未列出"表达；dsh 面另有 `config.exclude`）
- 不做按域白名单（`WIN_SHELL_TOOLS=domain:git` 语法）——11 号落地后若有需求另立工单
- 不做运行时热更新白名单（进程重启生效）
- 不改 dsh 插件面行为
- 不承担 AI 速查表内容落地（13 号工单负责）；仅在其落地后确认同步一行

## 评论

（对话历史与补充追加于此，新内容置于最前。）

- 收尾（captain）：本批 3 工单全部落地并通过 t9 终审。配置模块由 11 批 t2 合并交付（`src/config/env.ts`，一次并入两变量解析，协调竞态消除）；fail-fast 启动校验随 12-02 提前落地，12-03 聚焦 README「环境变量」共用小节 + CHANGELOG。工作树未 commit，待用户裁决提交。
