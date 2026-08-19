# 03-命令执行逃生舱（run_command 与 shell_exec）

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 用户能执行任意命令作为抽象层无法覆盖时的兜底通道。`run_command` 采用 `spawn(executable, args, {shell:false})` 参数数组形式，不经 shell 解析（从根源消除引号/转义/注入问题，ADR-0004 信任模式）；`shell_exec` 返回 `{exitCode, stdout, stderr}`。支持工作目录、超时、环境变量覆盖；子进程输出 GBK/UTF-8 自动识别；返回精简结构化结果；超时被终止并返回明确错误。同时可读取与设置环境变量（设置作用于后续执行会话）。

**验收标准：**

- [ ] 执行 `node -e` 等真实进程成功，返回精简输出；`shell_exec` 返回 `{exitCode, stdout, stderr}`
- [ ] 参数数组形式生效，不使用 shell 解析
- [ ] cwd / env / timeout 参数生效；超时后进程被终止并返回结构化错误
- [ ] 子进程输出 GBK/CP936 自动转换为 UTF-8
- [ ] 长输出按输出精简原则截断并提供取更多方式（ADR-0003）
- [ ] 读取单个/全部环境变量；设置后对后续会话生效
- [ ] 命令不存在、超时等错误路径有测试；协议层 seam 测试覆盖成功、参数校验失败、超时、编码、截断

## 评论
