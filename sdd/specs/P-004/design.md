---
id: P-004
type: design
status: finalized
updated: 2026-09-07
---
# P-004 设置页聚合重构与展示优化（功能不变）设计

## 方案概述（引 A-ID）

原生 `SettingGroup` 四区聚合（基础/镜像池/添加镜像/恢复初始状态，A-007 + 用户 E2E 效果调整）：当前镜像无独立行（池条目状态点标识）；池条目 = Setting 行 + 名称前状态点 + `···` 操作菜单 + chevron 按钮展开详情（兄弟节点插入正下方）；Switch 在镜像池说明行（组首行）desc 右侧；desc = 测试结果逐符号着色（✓ 绿 / ✗ 红）；池刷新 = 行引用跟踪 + 字段级 patch + DOM 顺序跟随池顺序；添加表单点击时集中校验（`addErrorEl` 缺陷修复）；文案精简并全量英文化。引擎随轮次修一处展示字符串（detail 逐映射分段）与一处记账缺陷（探针流量误记账到 active，见 T-021 勘误，恢复 P-002 经由记账语义）；池管理/游标/改写行为不变。

## 接口

- 引擎接口不变：`getStatus()`/`getUncovered()`/`getTestResult()`/`switchNext()`/`testMirror()`/`setPool()`/`resetCursor()`/`ensureSessionTest()`（settings.ts 消费方视角）
- 设置页内部新结构：`poolRows: Map<name, { setting, chevron, dot, detail }>` 行记录表；`addForm` 字段引用组（nameText/githubText/rawText）+ `addErrorEl` 提示行
- manifest：minAppVersion 1.11.0

## 数据

- 设置数据结构不变（TurboSettings.accelerator：enabled + pool）；展开态 `expanded: Set<name>` 会话内存；`<details>` 开合原生承载

## 关键流程

- 池增量同步（1s 轮询 + 池操作后即时调用）：按 `mirrorStatus` 顺序遍历 → 缺行创建、在行 patch desc、孤儿行删除 → DOM 顺序锚点重排（详情随行携带）；desc 测试结果与详情缩进均对齐镜像名文本（状态点占位宽 14px；详情左缘实测条目内边距后写入）
- 展开/收起：chevron 点击 → 详情 `turbo-detail` 以 `settingEl.insertAdjacentElement('afterend')` 插入/移除，图标 right ↔ down，`expanded` 集合同步
- 添加表单：SettingGroup 常驻（v1.1）；输入只存草稿不校验，点击 Add mirror 时集中校验（缺陷修复），失败于提示行显示全部原因，成功清空草稿与输入（不再整表重建表单）

## 关键决策表

| 决策 | 选项 | 选择 | 理由 | 关联 |
| --- | --- | --- | --- | --- |
| 聚合组件 | SettingGroup · 自绘卡片 | SettingGroup | 官方形态、demo 实证、主题零适配 | A-007 |
| 展开交互 | 名字点击 · 行尾箭头按钮 | 行尾箭头按钮 | 可发现性高、不占名字语义（用户定向） | A-007 |
| 详情挂载 | settingEl 内部 · 兄弟节点 | 兄弟节点 | 行内 flex 横排会把详情排右侧；兄弟挂载即正下方全宽 | demo 实证 |
| 映射展示 | 原样 · 去尾斜杠 · +`<REPO>` | 尾斜杠 + `<REPO>` | 斜杠是存储真值；占位补足前缀语义；纯展示层 | A-007 |
| 池刷新 | empty() 重建 · 行级增量 | 行级增量 | 消除轮询期整表重挂闪烁；展开态天然保持 | 开放问题①决议 |
| 英文化时机 | 随各任务 · 最后统一 | 随实现直接英文落地 | 单次实现无中间评审，终态一致少一轮改动 | 用户需求（最后做） |
| 添加镜像形态 | `<details>` 折叠 · SettingGroup 常驻 | SettingGroup 常驻（恢复初始独立区置末） | 用户 E2E 效果调整首轮；`+` 联动按钮随折叠去除一并移除 | spec v1.1 |
| 当前镜像展示 | 独立只读行 · 池内状态点 + 首行 Switch | 池内状态点 + 首行 Switch | 与池条目状态标识重复、删行去重（用户 E2E 三轮定向） | spec v1.2 |
| 状态标识形态 | desc 徽标胶囊 · 名称前状态点 + 着色测试结果 | 状态点 + 着色测试结果 | 实心徽标被用户撤销；点分色更轻、等宽缩进对齐 | spec v1.2 |
| 详情行形态 | 单行原样 · 两行卡片 · 单行去协议 | 单行去协议 | 两行卡片被用户撤销；去 `https://` 缩短行长 | spec v1.2 |
| 表单校验时机 | 输入实时（逐字段） · 点击集中 | 点击集中 | 输入不打扰、一次反馈全部原因、按钮常可点（用户定向） | spec v1.2 |
| Switch 位置 | 池首条目行 · 说明行（组首行） | 说明行 desc 右侧 | 条目行按钮随池序跳动，说明行位置恒定（用户 E2E 四轮澄清） | spec v1.3 |
| 测试结果着色 | 整段同色 · 符号绑定颜色 | 符号绑定颜色 | 一映射一状态一符号，混合结果各自着色（✓ 恒绿 / ✗ 恒红） | spec v1.3 |
| 详情占位 | +`<REPO>` · 无占位 | 无占位（去协议前缀与尾斜杠） | 进一步缩短详情行：`github.com → gh-proxy.com/https://github.com` | spec v1.3 |

## 任务清单

| 任务 ID | 标题 | 状态 | 分组 | 备注 |
| --- | --- | --- | --- | --- |
| `T-016` | SettingGroup 三区聚合骨架 | done | 配置 | 基础/镜像池/添加镜像 details；临时示例块移除 |
| `T-017` | 池条目行渲染与展开交互 | done | 配置 | 箭头按钮/正下方详情/`<REPO>`/行跟踪 + addErrorEl 缺陷修复 |
| `T-018` | 状态徽标与警示块与只读态 | done | 配置 | 徽标 desc/未覆盖警示块/当前镜像胶囊/文案精简 |
| `T-019` | 池列表行级增量渲染 | done | 渲染 | 字段级 patch/DOM 重排/展开态与 details 状态保持 |
| `T-020` | 设置页文案英文化 | done | 文案 | 全部可见文本 → English（终态验收，最后执行位） |
| `T-021` | 端到端验收 | done | 验收 | AC1-AC12 逐条核对（功能不变回归清单） |

## 任务详情

### T-016 SettingGroup 三区聚合骨架

- 说明：display() 重建为 SettingGroup 三区——基础（启用开关 + 当前镜像行 + 未覆盖警示行）/ 镜像池（说明行 + 条目行区 + 恢复初始行）/ 添加镜像（`<details>` 内嵌 SettingGroup 表单）；移除临时示例块；池行创建改 `addSetting`
- 验收：构建零错误 + lint 0 error 0 warning + 引擎单测全过；三区形态 E2E 核对（T-021）
- 实现记录：`display()` 全量重构——基础区四行（介绍/启用开关/当前镜像/未覆盖警示行，警示行 `settingEl.hide()` 初始隐藏）；镜像池组 = 标题 + 说明行（兼作池条目插入锚点 `poolAnchorEl`）；添加区 = 独立 SettingGroup 常驻；恢复初始状态 = 独立 SettingGroup 置于最后。临时示例块与 `typeof SettingGroup` 守卫移除（minAppVersion 1.11.0 已定版保证）。证据：构建零错误 + lint 0 error 0 warning + 引擎单测 47 用例全过
- 调整（用户 E2E 首轮，spec v1.1）：添加镜像去 `<details>` 折叠 → 独立 SettingGroup 常驻；恢复初始状态移出镜像池组 → 独立区置于最后；镜像池组头 `lucide-plus` 按钮（原联动展开折叠区）随折叠去除一并移除
- 调整（用户 E2E 第三轮，spec v1.2）：基础区删除「Current mirror」行——当前镜像由池条目状态点标识（与池状态展示去重）；Switch 按钮随之移出基础区（落位见 T-017）
- 调整（用户 E2E 第四轮，spec v1.3）：Switch 落位镜像池说明行（组首行）desc 右侧——条目行不持有按钮，位置恒定不随池序跳动

### T-017 池条目行渲染与展开交互

- 说明：条目行 = 名称 + 行尾 chevron（展开详情）+ `···`（原操作菜单）；详情兄弟节点插入正下方（`from + '<REPO>' → to + '<REPO>'`）；`addErrorEl` 接线（错误实时显示）；表单提交改为字段引用清空（不再重建）
- 验收：构建零错误 + lint 0 error + 单测全过；AC2/AC5 E2E 核对（T-021）
- 实现记录：`createPoolRow` 经 `pool.addSetting` 创建行（名称 + 双 extraButton：chevron 展开 / more-vertical 菜单），`PoolRowRecord` 跟踪（setting/chevron/detail/descKey）；`attachDetail` 以 `settingEl.insertAdjacentElement('afterend')` 挂详情（`createDiv('turbo-detail')`，每映射一行 `from<REPO> → to<REPO>`）+ 图标翻转 chevron-right ↔ chevron-down + `expanded` 集合同步；行重建（重开设置页/增删后再入）时按 `expanded` 恢复展开。`addErrorEl` 缺陷修复：提示行 descEl 在 display() 即创建并赋值，`syncAddForm` 错误时 `⚠ <原因>`（turbo-form-error 红）否则操作提示（turbo-form-hint 灰）；`submitAdd` 成功后字段引用 `setValue('')` 清空（表单不再整表重建）。菜单项英化（Test health/Move up/Move down/Delete）+ 池操作后即时 `refresh()`。证据：构建零错误 + lint 0 error + 单测全过
- 调整（用户 E2E 第二轮）：展开按钮移至行尾最右（`···` 菜单在前、chevron 收尾）；详情改两行卡片式——每映射一张卡（from 行灰字 + to 行等宽字体，卡片虚线分隔、accent 左描边面板），替代单行 `from → to` 长串
- 调整（用户 E2E 第三轮，spec v1.2）：Switch 自基础区移至池条目行 control 区（desc 右侧）——每行持有、仅首行可见（`buttonEl.toggle(index === 0)`），池重排自动跟随首行；详情撤销两行卡片恢复单行映射（`from<REPO> → to<REPO>`）且展示层去 `https://` 前缀（`stripProtocol`，存储值不变）；表单校验由逐字段实时改点击时集中——`validateAdd()` 返回错误列表一次显示于提示行（红），按钮常可点，`onChange` 只存草稿
- 调整（用户 E2E 第四轮，spec v1.3）：条目行 Switch 移除（`PoolRowRecord` 去 `switchButton`，同步循环去 index/`toggle`）；desc 测试结果行加 `.turbo-status`（缩进状态点占位宽 14px，对齐镜像名文本）；详情去 `<REPO>` 占位与尾斜杠（`displayEndpoint` 渲染层压缩端点，`from → to` 如 `github.com → gh-proxy.com/https://github.com`；尾斜杠存储真值不变）并以 `getBoundingClientRect` 实测条目行内容左缘 + 14px 写入详情 `paddingLeft`（随主题内边距自适应对齐；尾斜杠去除为用户指出实现与示例不符后的纠偏）

### T-018 状态徽标与警示块与只读态

- 说明：desc 徽标化（Active/Blacklisted/测试成败/测试中 分色，去序号）+ 紧凑摘要行（`github → host/<REPO> · raw → …`）；未覆盖警示行落基础区（含域名与经由镜像名）；当前镜像胶囊只读态；全局文案精简
- 验收：构建零错误 + lint 0 error + 单测全过；AC4/AC7/AC9 E2E 核对（T-021）
- 实现记录：`patchPoolRow` 重绘 desc——徽标胶囊（`Active` success 色 / `Blacklisted` warning 色 / 测试结果按 ok/error 分色 / 未测试灰；测试中为引擎 `Testing…` 文本）；未覆盖警示行 `syncUncovered`（`⚠ Uncovered GitHub domains (going direct): host (via mirror) … · Current mirror: X`）；当前镜像行 descEl 手工装配 `.turbo-pill` 胶囊 + 提示语，`Switch` 按钮保留原 `switchNext` 语义。styles.css 徽标/胶囊/警示行全套（Obsidian CSS 变量）。证据：构建零错误 + lint 0 error + 单测全过
- 调整（用户 E2E 首轮，spec v1.1）：desc 紧凑映射摘要行移除——`<REPO>` 口径保留于展开详情（AC3 不变）；`compactTarget`/`fromLabel` 辅助函数与 `.turbo-map-summary` 样式一并清理
- 调整（用户 E2E 第二轮）：徽标改实心配色（Active 实心绿 / Blacklisted 黄底深字 / Ok 浅绿底绿字 / Error 实心红 / 未测试灰底，替代描边款——原配色在主题下不显）；当前镜像胶囊改 accent 描边并独立成行、提示语独立小字行（原与 desc 混排难辨别）；校验改逐字段错误提示（`fieldErrors`：名称必填/重名、各映射 https 前缀，错误红字显示于各字段 desc 内、空内容自动隐藏；底部提示行固定为操作引导）
- 调整（用户 E2E 第三轮，spec v1.2）：撤销实心徽标，改名称前状态点方案——`.turbo-dot` 分色（当前=绿 `--text-success` / 拉黑=红 `--text-error` / 普通=灰 `--text-faint`，常驻占位保证各行等宽缩进），desc 徽标全部移除、仅测试结果文本着色（✓ 绿 / ✗ 红 / 测试中与未测试灰）；`.turbo-badge`/`.turbo-pill`/`.turbo-mirror-line`/`.turbo-field-error` 样式清理；逐字段实时校验同步撤销（回退点击集中，见 T-017）
- 调整（用户 E2E 第四轮，spec v1.3）：测试结果着色由整段同色改符号绑定——`renderTestStatus` 按符号拆分（✓ 绿 span / ✗ 红 span，其余默认色），Testing…/Not tested 为纯默认色文本
- 调整（色彩明艳化，用户 Obsidian 实测对比中）：状态点与 ✓/✗ 着色由主题变量 `--text-success`/`--text-error`（过淡）改固定明艳色 `#00c853`/`#ff3b30`（主题无关，深浅色主题下均醒目）；代码已随 `feat: P-004 设置页聚合重构` 提交（8b9609d），色彩后续微调随验收一并入库

### T-019 池列表行级增量渲染

- 说明：refresh() 改增量——按状态顺序锚点重排（`anchor.nextElementSibling` 守卫避免无谓搬移）、字段级 patch（desc 键比对跳过无变化）、孤儿行清理、详情随行携带；details/details 内提示不被轮询触碰
- 验收：构建零错误 + lint 0 error + 单测全过；AC6/AC8 E2E 核对（T-021）
- 实现记录：`refresh()` 拆三同步器（`syncUncovered`/`syncActivePill`/`syncPoolRows`），轮询与池操作共用；`syncPoolRows` 按 `mirrorStatus` 顺序走锚点链——`anchor.nextElementSibling !== rowEl` 守卫，详情块跟在其行后参与链（重排随行携带）；孤儿行 `detail.remove() + settingEl.remove()` + `expanded` 清理；`patchPoolRow` 以 descKey（active|blacklisted|testDetail）比对跳过无变化行；空池态 `syncEmptyRow`（No mirrors 行显隐 + 锚点定位）。`<details>` 开合为原生状态、轮询不触碰本体（AC6/AC8 语义落地）。证据：构建零错误 + lint 0 error + 单测全过

### T-020 设置页文案英文化

- 说明：全部可见文本 → English——Setting 名称/描述/按钮/菜单项/占位符/校验提示/空态/警示块/徽标文本；不引入 i18n 框架；data.json 键名、注释、日志不涉及
- 验收：构建零错误 + lint 0 error（sentence-case 规则对 settings.ts 的豁免配置维持）+ AC10 E2E 核对（T-021）
- 实现记录：随实现直接以英文文案落地（单次实现无中间评审，终态一致少一轮改动，`src/settings.ts` 现为英文终态）——组标题（GitHub Turbo/Mirror pool）、行名（Enable GitHub acceleration/Current mirror/Restore defaults/No mirrors/Mirror name/github.com maps to/raw.githubusercontent.com maps to/Confirm）、按钮（Switch/Reset/Add mirror）、菜单（Test health/Move up/Move down/Delete）、提示（校验三条与操作提示、未覆盖警示、空池）。引擎一处展示字符串随行英化：`testMirror` 初始 detail `测试中… → Testing…`（会浮现于设置页徽标，属 AC10 范畴；零行为变化，47 用例不涉及该字符串）。证据：构建零错误 + lint 0 error + 单测全过
- 调整（用户 E2E 第四轮，spec v1.3）：引擎 `testMirror` detail 由「总符号 + 分段」改逐映射分段「符号 + 名称 + 耗时/原因」（如 `✓ github 100 ms · ✗ raw HTTP 404（12 ms）`，一映射一状态一符号；`probeOne` 返回值不再内嵌 ✓/✗）——展示字符串零行为变化，47 用例不涉及该字符串
- 调整（文案复查，用户定向）：AC10 勘误——`probeOne` 失败 detail 残留中文（「内容异常」「疑似非镜像响应」）与全角括号随行英化（`HTTP 404 unexpected content (… B, likely not a mirror response)`），T-020 原记录「引擎仅一处中文字符串」不完整以本条纠正；文案微调：github 映射行说明去「/.」尾缀（Domain style 改完整表述）、未覆盖警示改 `(not covered by X)` 并去冗余 Current mirror 尾巴（当前镜像已有状态点承载）、Restore defaults 说明去游标/种子池行话（Restore the built-in mirror list…）。设置页本体文案复查无其他问题（sentence case、术语一致性、全英文均过）

### T-021 端到端验收

- 说明：真实 Vault 部署（main.js + manifest.json）逐条核对 AC1-AC12；功能不变回归 = P-003 交互清单（添加/删除/排序/测试/切换/重置/未覆盖/持久化）+ 新展示形态
- 验收：AC1-AC12 全过（用户实测确认）
- 实现记录：真实 Vault 部署（main.js + manifest.json）四轮 E2E 效果调整 + 一轮文案复查 + 一处严重缺陷修复后逐项核对完成——AC2/AC9（展开交互与 Switch 落位）、AC4（状态点 + 符号绑定着色，明艳色 `#00c853`/`#ff3b30`）、AC5（点击时集中校验）、AC3（详情单行去协议/尾斜杠/占位）均经用户逐轮定向与确认；AC10 经文案复查修正探针中文残留；E2E 发现严重缺陷（观测记账拖动游标）修复经用户复验「完美修复」。证据：构建零错误 + lint 0 error 0 warning + 引擎单测 55/55 + AC 逐条证据（/sdd-accept 验收记录）
- 缺陷修复（用户 E2E 发现，严重）：`install()` 被动观测把「一切经 requestUrl 的请求」记账到发送时刻的 active——插件自身探针也走 requestUrl，其 URL 已被 testMirror 预改写为目标镜像（rewriteUrl 幂等、二次改写不变），失败 verdict 仍记到 active 头上（`record(A, true)` → `advanceActive()`）→ 测试/添加非 active 镜像必拖动游标；市场直连（未覆盖）流量同样被误记账。修复：仅「命中本 active 映射」的流量改写并被动记账（判据 `rewriteUrl(url, candidate) !== url`），探针成败由 testMirror 主动记账、直连流量只记未覆盖。用户 E2E 复验通过（添加镜像/测试非 active 镜像均不再拖动游标）。证据：单测新增 8 例（伪造 ipc 驱动 install：探针不挂观测/不二次改写/active 不动 + 真实流量挂观测/改写/失败正常推进），47 → 55 用例全过；已提交 `30831aa`
