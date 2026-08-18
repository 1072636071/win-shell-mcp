# system 工具集

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 可查询操作系统/架构/主机名/当前目录/Node 版本、磁盘用量、内存总/可用、PATH 条目，替代 uname/df/free 等。

**验收标准：**

- [ ] 系统信息返回 OS/arch/platform/hostname/cwd/node 版本
- [ ] 磁盘用量与内存信息在 Windows 与 unix 均正确
- [ ] PATH 条目列表化输出
- [ ] 跨平台分支均有测试

## 评论
