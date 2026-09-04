---
id: P-002
type: design
status: finalized
updated: 2026-09-04
---
# P-002 镜像运维（多镜像管理、可用性检测、失败自动回退）设计

## 方案概述（引 A-ID）

在 P-001 改写引擎之上补齐镜像可靠性：内置有序镜像目录（最优在前，即隐含偏好，A-004）经被动健康观测驱动自动切换——`request-url` 的响应经同名请求 ID 频道回达且含 `status`（S1/S1b 实证），改写时同步挂一次性监听即可零流量记账；失败推进游标、同一镜像 3 败本会话拉黑。候选链不含直连（A-003）；设置页仅总开关与只读 active 显示。

## 接口

- 目录条目 `MirrorCandidate`：`type: 'prefix'`（判别字段，预留 `host-map` 等未来方式）+ `base`（镜像前缀）+ `label`（显示名）
- 内置目录 `MIRROR_CATALOG: MirrorCandidate[]`：代码内有序常量，顺序即偏好与回退顺序
- 改写分发：`rewriteUrl(url, candidate)` 按 `type` 分发，当前仅实现 `prefix` 分支
- 运行时状态（内存，onload 重建）：当前 active 游标、各候选连败计数与会话拉黑集合
- 设置：`TurboSettings` 仅保留 `accelerator.enabled`；`mirrorBase` 废弃移除

## 数据

- 旧 `data.json` 的 `mirrorBase` 键忽略即可，零迁移；游标与拉黑为会话内存，不入盘

## 关键流程

`send('request-url', id, opts)` 拦截 → 总开关关闭则直通 → 以当前 active 候选按 `type` 改写 `url`（命中才改）→ 记下 `(id, active)` 并同步挂 ID 频道一次性监听 → 原始 `send` 放行 → 回复到达按判定语义对 active 记账（超时/403/429/5xx/`/releases/download/` 404 计失败；其余 404 计上游真值）→ 失败推进游标（跳过拉黑项）、连败 3 次拉黑本会话；成功即稳定并清零 → 监听自摘（响应或超时兜底，防泄漏）。

## 关键决策表

| 决策 | 选项 | 选择 | 理由 | 关联 |
| --- | --- | --- | --- | --- |
| 健康信号源 | 主动探测 · 被动观测 | 被动观测 | S1/S1b 实证零额外流量的真实信号 | spec v1.0 |
| 切换条件 | 3 连败才切 · 失败即推进 + 3 败拉黑 | 失败即推进 + 3 败拉黑 | 防抖不吞失败请求 | spec v1.0 |
| 偏好载体 | 下拉单值 · 目录顺序 | 目录即偏好 | 免写回、免迁移、概念更少 | A-004 |
| 直连兜底 | 链尾哨兵 · 取消 | 取消 | 静默降级掩盖故障，手动开关已覆盖 | A-003 |
| `/releases/download/` 404 语义 | 版本真值不计 · 镜像覆盖缺失计失败 | 计失败 | 版本号源自市场数据、上游应存在 | spec v1.0 |
| 替换方式扩展 | 前缀硬编码 · `type` 判别分发 | `type` 判别分发 | 预留域名替换式等未来方式 | spec v1.0 |

## 任务清单

| 任务 ID | 标题 | 状态 | 分组 | 备注 |
| --- | --- | --- | --- | --- |
| `T-004` | 镜像目录与改写分发重构 | done | 引擎 | 目录常量、`type` 分发、废弃 `mirrorBase` 读路径（AC6） |
| `T-005` | 被动健康观测与记账 | done | 引擎 | ID 频道一次性监听、判定语义、超时自摘（AC4） |
| `T-006` | 切换游标与拉黑 | done | 引擎 | 失败推进、3 败拉黑、成功稳定、onload 复位（AC1-AC3、AC7） |
| `T-007` | 设置页改造 | done | 配置 | 去镜像选择、active 只读显示、旧键忽略（AC5、AC6） |
| `T-008` | 端到端验收实测 | done | 验收 | AC1-AC9 逐条核对（AC1 需调试构建构造坏镜像；AC8/AC9 为 P-001 回归） |
| `T-009` | 复位按钮与拉黑冷却（spec v1.3） | done | 引擎 | 设置页复位控件 + 30 分钟冷却自动解除并清零连败（AC10、AC11） |

## 任务详情

### T-004 镜像目录与改写分发重构

- 说明：目录常量有序（当前时点实测健康度排序），条目带 `type`/`base`/`label`；`rewriteUrl` 改签名按 `type` 分发（仅实现 `prefix`）；移除设置中 `mirrorBase` 的读取路径
- 验收：引擎级验证通过——构建零错误 + 改写分发 10 用例全过（AC6 运行时核对留 T-008）
- 实现记录：`src/accelerator.ts` 新增 `MirrorCandidate`（`type`/`base`/`label`）与 `MIRROR_CATALOG` 有序常量（gh-proxy.com → ghproxy.net → ghfast.top → moeyy，按 2026-09-02/03 实测健康度排序）；`rewriteUrl(url, candidate)` 按 `type` 分发，未知 `type` 一律不改写（`host-map` 等未来方式接入点）；`prefix` 分支保留非 GitHub 前缀不改写、幂等、尾斜杠规范化语义；`AcceleratorConfig` 收缩为仅 `enabled`，引擎以 `activeIndex` 取目录候选（暂恒为 0，T-006 引入游标推进）。`src/settings.ts` 移除镜像输入控件与 `normalizeMirrorBase` 导出；`main.ts` loadSettings 改显式取字段——旧 `data.json` 的 `mirrorBase` 键自然忽略（AC6 证据：显式字段 picking 代码路径）。证据：`npm run build` 零错误（修复一处 `noUncheckedIndexedAccess` 下标守卫后 pipefail 复验）、lint 0 error 1 warning（已知忽略的 `prefer-setting-definitions`）、esbuild 编译 + node 10 用例（命中 ×3 / 不改写 ×2 / 幂等 / 规范化 / 未知 type / 目录形状 ×3）全过

### T-005 被动健康观测与记账

- 说明：改写时同步挂请求 ID 频道一次性监听，按判定语义对 active 记账；响应或超时后监听自摘；回复结构不含 `status` 时静默跳过
- 验收：判定语义 6 用例全过、观测器随构建零错误；AC4 运行时核对留 T-008
- 实现记录：`observe()` 于改写后同步在请求 ID 频道挂一次性监听；原始 URL 先于改写捕获（`extractUrl`），供 404 路径判定。回复 `(sender, response)` 取 `status` 交 `isMirrorFailure` 记账：404 按路径二分（`/releases/download/` 计镜像覆盖缺失、其余计上游真值）、403/429/5xx 计失败、2xx/3xx 计成功；回复无数字 `status` 时静默跳过记账（spec 边界）。观测窗口 120s 宽超时兜底自摘并记一次失败（覆盖 release 大文件）；计时器用 `window.setTimeout/clearTimeout`（lint 弹窗窗口兼容规则）。`IpcLike.on/removeListener` 为可选能力，缺失时仅改写、静默降级。证据：`npm run build` 零错误 + 判定用例 6/6

### T-006 切换游标与拉黑

- 说明：内存游标从目录首项起（跳过拉黑）；失败推进、连败 3 次拉黑、成功稳定清零；onload 复位全部运行时状态
- 验收：游标状态机 7 用例全过；AC1-AC3、AC7 运行时核对留 T-008
- 实现记录：新增可独立测试的 `MirrorCursor`（目录长度参数化）——`record(index, failed)` 成功则清零该候选连败并稳定 active（拉黑项的迟成功不复位游标），失败则连败 +1 并推进游标（环形推进、跳过拉黑项），连败达 3 本会话拉黑；`reset()` 供 onload 复位（`install` 时调用，spec AC7）。引擎 `activeIndex` 替换为 `cursor`，`activeLabel` 暴露给设置页。证据：node 用例 7/7（起步 / 成功稳定 / 失败推进 / 从当前 active 推进 / 推进跳拉黑 / 全拉黑停留 / 拉黑迟成功不复位 / reset 复位）。两处初版用例期望写错（非当前候选失败与回绕场景），复核「失败即推进从当前 active 起」语义后修正

### T-007 设置页改造

- 说明：移除镜像选择控件，改为只读显示当前 active 镜像（随切换跟随）；总开关默认开不变；旧 `mirrorBase` 键忽略
- 验收：构建与 lint 零错误；AC5、AC6 运行时核对留 T-008
- 实现记录：移除镜像输入控件与 `normalizeMirrorBase` 导出（P-001 遗留），改为「当前镜像」只读信息行（name + desc 内嵌 `activeMirrorLabel`，无交互控件——规避 `setDisabled` 需 Obsidian 1.2.3 与 manifest `minAppVersion: 1.0.0` 的冲突，manifest 保持不动）。显示为设置页渲染时快照，重开设置即刷新；若需实时跟随需加事件订阅机制（见实现偏差说明）。`setTimeout/clearTimeout` 换 `window.*` 修复弹窗兼容 warning。证据：`npm run build` 零错误、lint 0 error 1 warning（已知忽略 `prefer-setting-definitions`）、回归用例通过
- v1.2 增强（用户定向，验收期间纳入）：「当前镜像」控件化只读显示（`inputEl.readOnly`，规避 `setDisabled` 版本要求）+ 「镜像池」逐项只读展示（`镜像 N · label`，desc 标记 当前使用/本会话已拉黑/候选）；引擎新增 `getStatus()` 快照与 `MirrorCursor.isBlacklisted`；设置页经 `registerInterval` 1s 轮询 `refresh()` 实时跟随（`containerEl.isConnected` 守卫）

### T-008 端到端验收实测

- 说明：无代理环境逐条核对 AC1-AC9；AC1 用调试构建把目录首项换成必然失败镜像构造场景；AC8/AC9 复核 P-001 回归
- 验收：AC1-AC9 全部通过（详见下）
- 实现记录：双构建（调试 dead-first + 正常，均含设置页 v1.2）实测。逐条证据：AC1 ✓ 调试构建 dead 失败后自动切 gh-proxy.com 且列表加载；AC2 ✓ gh-proxy 连吃 3 败拉黑后不再被使用，第二次自发送验证游标模型（用户确认）；AC3 ✓ 多次浏览稳定不回跳；AC4 ✓ releases 路径 404 计失败并触发拉黑推进；AC5 ✓ 设置页「当前镜像」与镜像池标记 1s 轮询实时跟随（开关切换直接目视）；AC6 ✓ `data.json` 为 `{"accelerator":{"enabled":true}}` 新格式运行正常（注：实测库中无旧 `mirrorBase` 键，旧键场景由 loadSettings 显式取字段路径保障，未单独构造）；AC7 ✓ 禁用再启用后游标与拉黑复位、dead 重新被尝试；AC8 ✓ 非 GitHub 域原样；AC9 ✓ 关开关全直连。过程发现与教训：① 规格缺口——网络层错误回复 `{"error":{}}` 无 `status`，v1.0 边界吞掉 → `judgeReply` 修复 + spec v1.1；② 流水线失败语义实证——同批多个自发送在回复到达前全部发出、均记于当时的 active，失败即推进逐格走 + 3 败拉黑并行生效，落点为最后一次推进位置（与设计一致，验收预期曾误算）；③ 验证方法学教训汇总——外层探针记录的是改写前快照、函数名 grep 无法验证压缩构建、`console.debug` 默认被 Verbose 过滤隐藏、测试场景须保证状态可外部观测（本表新增前缀可观测的三项目录即为此设计）

### T-009 复位按钮与拉黑冷却（spec v1.3）

- 说明：设置页镜像池区域尾加「恢复初始状态」按钮（游标回首项、清空连败与拉黑，点击后即时 refresh）；MirrorCursor 拉黑带 30 分钟冷却——`isBlacklisted` 查询时惰性解除并清零连败，游标推进跳过判断与记账入口统一走该判定；时钟可注入（测试用假时钟）
- 验收：判定/游标/冷却 13 用例全过（含注入时钟的冷却解除与解除后清零连败）；AC10 ✓（用户实测：重置后游标回首项、拉黑标记全清）、AC11 ✓（用户实测：30 秒冷却构建下拉黑自动解除变回候选）
- 文案修订（用户定向，维护级）：按钮区标题定为「恢复初始状态」，描述「清理插件的拉黑、失败次数，游标回到第一行主镜像」；同轮澄清并确认为已知语义——冷却期满只清理该镜像自己的拉黑与连败，其他候选的单次失败连败不清零（连败 = 无成功间隔的连续失败，清零途径为成功一次或重置）
- 实现记录：`MirrorCursor` 增加 `blacklistedAt` 时间戳与可注入时钟（构造参数 `now`）；拉黑时落时间戳，`isBlacklisted` 发现冷却期满即解除拉黑并清零连败（完整重新预算）；`record` 对冷却期内的迟回复直接忽略（该候选已停用）；`advance` 与 `record` 统一走 `isBlacklisted` 判定（单一语义点）。设置页新增「恢复初始状态」按钮（`addButton/setButtonText`，点击调 `plugin.resetMirrorCursor()` 并即时 refresh）；引擎新增 `resetCursor()`。用户裁定记录：① 插件生命周期复位为语义锚点必须保留；② 开关复位否决（复位是开关职责外的副作用）；③ 复位按钮承载手动复位（游标单向性——只失败推进不主动回优——的唯一手动回路，「卡在慢速镜像」场景的解法）；④ 30 分钟冷却自动解除覆盖镜像恢复/误判场景（自动消解大部分复位需求）
- 键控加固（用户定向，验收期间纳入）：MirrorCursor 状态由下标平行数组改为按候选身份（`base`）键控的 Map，游标以 `activeBase` 回查目录——目录重排/增删不会张冠李戴，为排序持久化/目录编辑/自定义候选等预留扩展预留正确语义；判定/记账/推进/冷却语义逐字保留，行为零变化；`request` 链改为传候选对象（`cursor.active()`），删除死代码 `activeLabel`。证据：构建零错误 + 21 用例全过（判定/judgeReply/改写回归 + 显式账本 12 败轮转全拉黑与全黑停留 + 注入时钟冷却解除/清零连败/冷却期内迟回复忽略 + 身份隔离）。注：本轮 8 处单测断言/场景笔误均经逐笔账本核对后修正，实现语义全程未变
