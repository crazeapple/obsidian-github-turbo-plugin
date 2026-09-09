# A-008 调试日志挂载点与格式选型（2026-09-08，关联 P-005）

状态：active

## 决策

调试日志内联于 `install()` 拦截器（方案 A），格式 = 单行 `[GT] [REWRITE] <origin 去协议> → <rewritten 去协议>`（全路径）与 `[GT] [DIRECT] <url>`，通道 `console.log`。

## 理由

- 拦截器是 `request-url` 流量唯一咽喉，原 URL 与改写结果同点可得，`getConfig()` 闭包天然贯通开关——引擎侵入数行、零新增挂载/还原生命周期
- 单行 + 去协议（`displayEndpoint` 同口径）避免换行；`[REWRITE]`/`[DIRECT]` 标签对称区分两类流量；`console.log` 默认可见（`console.debug` 被 Verbose 过滤，P-001 教训）

## 否决备选

- 方案 B 独立包装层——双重包装顺序敏感、还原生命周期翻倍、经由判定逻辑两份维护，解耦收益低于成本
- 方案 C 设置页日志查看器——内存无界增长需截断，范围膨胀，与「devtool console 调试」场景不符
- `console.debug` 通道——默认被 Verbose 过滤隐藏，误判开关失效
- 全流量 DIRECT 记录——噪音大且打印其他插件请求 URL
- 两行 ORIGIN/REWRITE 格式——前缀型镜像 REWRITE 行为 ORIGIN 两倍长，拼行必然换行
- host-only 截断格式——丢完整改写 URL，复制测试需脑补拼接

## 影响范围

P-005 引擎实现与设置页结构；无其他提案依赖此决策。
