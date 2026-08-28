# 01 · run_command 收敛到命令执行深模块并修复超时树杀

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** `run_command` 超时后，连同其子孙进程整棵树被彻底终止（Windows 上不再残留持有管道、挂起不归还的子进程）；输出字节预算（`maxOutputBytes`）与 signal 语义改由命令执行深模块统一提供，四条执行通道（shell_exec / pkg_run / git / run_command）共享一套子进程机器。工具对外的输出契约字段与现状一致。

**验收标准：**

- [ ] `run_command` 超时后进程树被终止（Windows 经 taskkill /T /F 语义），不再有子进程残留
- [ ] `run_command` 输出契约字段（stdout/stderr/exitCode/signal/truncated）与现状逐字段一致
- [ ] `maxOutputBytes` 字节预算行为保持：按流独立前缀截断、超限标记 `truncated`、超时错误码仍为 `EXEC_TIMEOUT`
- [ ] 命令执行深模块接口新增字段均为可选，shell_exec / pkg_run / git 行为零变化（回归绿）
- [ ] 深模块机器级单测补齐：字节预算截断、signal 携带、超时树杀路径

## 评论

来源：PRD 决策 1（P1）。删除 run_command 的自造子进程机器（含 `proc.kill("SIGKILL")` 单进程超时），收敛到既有深模块；修复的真 bug 正是深模块注释警告过的 Windows 树杀缺失。
