# 01 保护内核 + fs_rm 删除保护全链路

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 设置 `WIN_SHELL_PROTECT=1` 后，AI 调用 fs_rm 删除文件/目录树时：目标先被完整备份到 `<日志根>/backup/<操作ID>/`（含 meta.json），删除成功后审计流 `<日志根>/logs/operations.jsonl` 追加一行记录；删除 node_modules 等低价值路径（内置名单 + `WIN_SHELL_LOWVALUE_LIST` 追加）或超体积目标（`WIN_SHELL_BACKUP_MAX_BYTES`，默认 1GB）时直接真删仅审计；备份失败则删除中止并返回 AI 可理解的语义化错误。未设置开关时行为与现状逐字节一致。

**验收标准：**

- [ ] Tool 接口新增可选 protection 元数据（delete/overwrite/audit-only + 目标路径参数），既有工具注册不受影响
- [ ] 工具分发点对带元数据的工具执行保护流程，未开启保护时直接透传原 handler，行为与现状一致
- [ ] 4 个环境变量（WIN_SHELL_PROTECT / WIN_SHELL_LOG_DIR / WIN_SHELL_LOWVALUE_LIST / WIN_SHELL_BACKUP_MAX_BYTES）启动时读取生效；日志根默认 `D:\log`
- [ ] 开启保护后 fs_rm 删除单文件与目录树（recursive）均生成备份批次：完整拷贝 + meta.json（原路径/工具/参数/时间/操作 ID/结果），操作 ID 唯一
- [ ] 低价值名单任意层级 basename 匹配，命中即真删不备份；`WIN_SHELL_LOWVALUE_LIST` 逗号分隔追加到内置名单
- [ ] 目录体积超阈值跳过备份直接真删；审计行记录跳过原因
- [ ] 审计流每破坏操作一行 JSON（时间/工具/参数/目标/操作 ID/备份路径/结果）；非破坏操作不记录
- [ ] 备份失败（磁盘满/无权限/IO）时 fs_rm 不执行，返回语义化错误（原因 + 可行出路），新增错误码
- [ ] 单元测试：配置读取（含默认值与自定义）、名单/阈值判定、备份批次结构、审计行格式、开启/关闭差异；走临时目录，不触碰真实 D:\log

## 评论

（评论与对话历史追加于此，新内容置于最前。）