# 05 · 懒模式装配注入

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** `tool_groups` 的懒模式判定经装配期注入（与其统计口径注入走同一通道），不再直读环境变量；env 原始读取收敛到 stdio 入口单点，测试无需伪装 `process.env`。

**验收标准：**

- [ ] `tool_groups` handler 不再直读环境变量；懒模式值随装配注入
- [ ] 懒 / 全量 / 白名单各组合下 `tool_groups` 输出与现状一致（懒模式附 `visible: false`，全量省略）
- [ ] 配置模块"env 读取单点"约定恢复成立
- [ ] 装配纯函数单测：注入伪 lazy 值即可验证，不依赖 process.env

## 评论

来源：PRD 决策 5（P2）。源码注释自认的"过渡读取点"关闭。
