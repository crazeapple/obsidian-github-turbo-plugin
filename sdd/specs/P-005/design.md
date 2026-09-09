---
id: P-005
type: design
status: finalized
updated: 2026-09-08
---
# P-005 调试日志开关设计

## 方案概述（引 A-ID）

拦截器内联日志（A-008）：`install()` 经由判定点按 `config.debug` 短路输出单行日志——命中映射 `[GT] [REWRITE] <origin 去协议> → <rewritten 去协议>`，其余流量（未命中映射、非 GitHub 域、探针预改写）一律静默（v1.1 删 DIRECT 行）；设置页「恢复初始状态」上方新增 Debug 分组承载开关（默认关、持久化 `accelerator.debug`）；通道 `console.log`。

## 接口

- `AcceleratorConfig` 增加只读字段 `debug: boolean`（`TurboSettings.accelerator` 透传，`getConfig()` 闭包天然贯通引擎）；`DEFAULT_ACCELERATOR_CONFIG` 补 `debug: false`
- 引擎公开接口零变化：`install()` 签名与生命周期不变，仅新增日志旁路
- 设置页新增 `debugRow`（Debug 分组内 toggle）；持久化沿 `saveSettings()` 现有链路

## 数据

- `accelerator.debug: boolean` 持久化于 data.json，默认 `false`（`DEFAULT_ACCELERATOR_CONFIG` 补默认值，存量用户数据缺字段时取默认）
- 日志为纯输出副作用，不落地任何状态

## 关键流程

- 请求 → 拦截器 → `config.enabled` 短路（加速关闭无日志，spec 边界）→ `config.debug` 短路（关闭零开销）→ 经由判定复用现有分支：命中映射 = 改写 + `[REWRITE]` 行；未命中 + 已知域 = `[DIRECT]` 行；其余静默
- 去协议压缩复用 `displayEndpoint` 口径（settings.ts 现有函数，引擎侧如需则提为共享或在引擎内等价实现——实现期定，避免跨文件循环依赖）

## 关键决策表

| 决策 | 选项 | 选择 | 理由 | 关联 |
| --- | --- | --- | --- | --- |
| 日志挂载点 | 拦截器内联 · 独立包装层 | 拦截器内联 | 唯一咽喉、零新增生命周期；包装层双倍维护 | A-008 |
| 日志格式 | 两行标签 · 单行全路径 · host-only 截断 | 单行 `[GT] [REWRITE] origin → rewritten`（去协议全路径） | 不换行且完整可复制 | A-008 |
| 通道 | console.log · console.debug | console.log | debug 被 Verbose 过滤隐藏（P-001 教训） | A-008 |
| Debug 行落位 | 独立 SettingGroup · 恢复初始组内首行 | 独立组置于恢复初始状态上方 | 用户原话「重置区域上方」；延续 P-004 分区形态 | spec 开放问题① |
| 日志事件范围 | 仅请求发出 · 含观测超时/回复成败 | 仅请求发出时刻 | 噪音最小；范围外另议（spec 开放问题②） | spec 范围外 |
| DIRECT 日志分支 | 保留 · 删除 | 删除 | 双映射强制使正常路径不可达（用户真机实测证实不出现）；未覆盖告知保留 | spec v1.1 |

## 任务清单

| 任务 ID | 标题 | 状态 | 分组 | 备注 |
| --- | --- | --- | --- | --- |
| `T-022` | Debug 分组开关与持久化 | done | 配置 | 配置字段 + 设置页 Debug 分组（含 DEFAULT_ACCELERATOR_CONFIG 补默认） |
| `T-023` | 拦截器调试日志 | done | 引擎 | 经由判定点三分支输出、config.debug 短路、去协议格式 |
| `T-024` | 日志单测 | done | 测试 | 伪造 ipc + console 捕获：REWRITE/DIRECT/静默/关闭零输出/探针排除 |
| `T-025` | 端到端验收 | done | 验收 | AC1-AC7 逐条核对 |

## 任务详情

### T-022 Debug 分组开关与持久化

- 说明：`AcceleratorConfig`/`DEFAULT_ACCELERATOR_CONFIG` 增加 `debug: false`；设置页「恢复初始状态」组上方新建 Debug 分组（`SettingGroup`，标题如 Debug logs），内含一行 toggle（desc 说明「开启后 console 输出 [REWRITE]/[DIRECT] 日志」），onChange 写 `accelerator.debug` 并 `saveSettings()`
- 验收：AC1（默认关、持久化、落位）；构建零错误 + lint 0/0
- 实现记录：`AcceleratorConfig` 增加 `debug: boolean`（注释指向 P-005）+ `DEFAULT_ACCELERATOR_CONFIG.debug: false`；设置页「恢复初始状态」上方新建 Debug logs 分组——`Debug logging` toggle（desc 载明 `[REWRITE]`/`[DIRECT]` 形态），onChange 写 `accelerator.debug` 走 `saveSettings()` 现有链路；`loadSettings()` 显式取字段补 `debug: stored?.debug ?? 默认`（旧数据缺键取默认，沿「多余键自然忽略」模式）。证据：构建零错误 + lint 0 error 0 warning

### T-023 拦截器调试日志

- 说明：`install()` 命中分支输出 `[GT] [REWRITE] <origin> → <rewritten>`、已知域未命中分支输出 `[GT] [DIRECT] <url>`，`config.debug` 布尔短路；去协议口径与 `displayEndpoint` 一致；探针预改写流量经未命中分支自然静默
- 验收：AC2-AC6；构建零错误 + lint 0/0
- 实现记录：`displayEndpoint` 自 settings.ts 上移为引擎导出函数（`isKnownGithubUrl` 旁，详情与日志共用一份压缩口径，消除跨文件重复）；`install()` 经由判定点按 `config.debug` 短路输出——命中分支 `[GT] [REWRITE] <origin> → <target>`（target 已在判定时算得，零重复计算），已知域未命中分支 `[GT] [DIRECT] <url>`；探针预改写流量落未命中且非已知域，自然静默。判定条件同步收紧为 `target !== undefined && target !== url`（TS 收窄）。证据：构建零错误 + lint 0/0 + 单测 T-024 用例全过
- 调整（用户 E2E 定向，spec v1.1）：删除 `[GT] [DIRECT]` 输出——添加表单强制双映射使已知域在正常路径必被覆盖，DIRECT 为防御分支不可自然触发（用户手工单映射镜像真机实测亦未出现）；`uncovered.set` 未覆盖告知机制保留不变，未来映射编辑提案落地可复议

### T-024 日志单测

- 说明：单测 harness 伪造 `console.log` 捕获输出，扩展现有 install 用例：REWRITE 行格式与全路径、DIRECT 行、非 GitHub 静默、debug 关闭零输出、探针流量零输出
- 验收：AC7（55 基线 + 新增全过）
- 实现记录：扩展 install 单测块新增 7 例——REWRITE 行格式与恰一条（去协议全路径逐字断言）、DIRECT 行格式与恰一条、非 GitHub 域静默、探针预改写流量静默、debug 关闭零输出；console 桩只捕 `[GT]` 前缀行、其余转发原始 console（首版桩全量捕获致 eq 断言打印自污染 logs 数组、4 例假败——已修，教训：捕获桩须与断言通道隔离）。证据：62 过 / 0 败（55 基线 + 7 新增）
- 调整（spec v1.1）：原 DIRECT 行两例断言改为「已知域未命中 → 静默」一例；62 → 61 用例全过

### T-025 端到端验收

- 说明：真实 Vault 部署逐条核对 AC1-AC7（开关持久化重启保持、真实市场流量日志形态、过滤 `GT` 可用性）；手工构造单映射镜像的边界行为（健康测试经直连探针显绿、failover 显示口径）经用户裁定属手工数据异常、不计 bug
- 验收：AC1-AC7 全过（用户实测确认）
- 实现记录：真实 Vault 部署两轮 E2E 完成——AC2（REWRITE 行格式、过滤 `GT` 可用，用户实测「rewrite 的都没有问题」）、AC1（开关默认关、落位、持久化）、AC5/AC6（console.log 可见、探针静默）。E2E 讨论厘清两点：① 未覆盖/非 GitHub 域直连请求（obsidian.md 统计接口等）日志静默属设计内（行为边界三分类），其缺失系直连波动非回归；② DIRECT 日志分支正常路径不可达（双映射强制）→ spec v1.1 删除（用户定向）。手工单映射镜像的边界行为（健康测试经直连探针显绿、failover 显示口径）经用户裁定属手工数据异常、不计 bug。证据：构建零错误 + lint 0/0 + 单测 61/61 + AC 逐条证据（/sdd-accept 验收记录）
