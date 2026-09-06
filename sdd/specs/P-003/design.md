---
id: P-003
type: design
status: finalized
updated: 2026-09-06
---
# P-003 代理镜像池管理与多替换类型设计

## 方案概述（引 A-ID）

镜像池升级为纯用户池（内置目录降级为默认种子，A-005），条目采用统一映射模型（无 type 概念，条目 = 名字 + 映射对列表）；可达性验证 = 添加后自动首测 + 行级测试（拒绝守门探测，A-006）；未覆盖的 GitHub 已知域请求按 host 聚合提示。引擎游标已按身份键控——池变更天然对齐。

## 接口

- 镜像条目 `MirrorCandidate { name: string; mappings: { from: string; to: string }[] }`（name 即身份与显示名）
- 设置 `TurboSettings.accelerator { enabled: boolean; pool: MirrorCandidate[] }`（mirrorBase 已废弃；无 pool 键播种 DEFAULT_POOL）
- 引擎：`requestMirrorTest(candidate)`——requestUrl GET 改写后小资源，返回 ✓ 耗时 / ✗ 原因
- 游标：`MirrorCursor` 按镜像名（name）键控运转，接口不变

## 数据

- 池持久化于 data.json；游标/拉黑/测试结果/未覆盖 host 集合为会话内存
- 迁移：无 pool 键 → 播种 DEFAULT_POOL；旧 mirrorBase 键忽略

## 关键流程

- 池建立/重建（首次播种、恢复初始状态）→ 自动全池首测：逐池 GET 改写后小资源，结果喂游标记账（失败 1 败推进、成功稳定）→ 游标预定位首个可用镜像
- 请求拦截 → active 条目 mappings 逐对匹配（url.startsWith(from) → to + rest）→ 未命中且属 GitHub 已知域（github.com、raw.githubusercontent.com）→ 按 host 记入未覆盖集合 → 设置页提示
- 手动切换：游标推进到下一个未拉黑候选（纯游标移动，不记账）

## 关键决策表

| 决策 | 选项 | 选择 | 理由 | 关联 |
| --- | --- | --- | --- | --- |
| 池模型 | 内置+自定义合并 · 纯用户池 | 纯用户池 | 单一来源、所见即所得 | A-005 |
| 目录热更新 | 远程拉取 · 随版本发布 | 随版本发布 | 远程依赖/攻击面/隐私 | A-005 |
| 映射模型 | type 判别 · 统一映射对 | 统一映射对 | prefix 本身即映射；组合型镜像天然可描述 | spec 背景 |
| 可达性验证 | 守门探测 · 录入时探测 · 添加后自动首测+行级重测 | 添加后自动首测+行级重测 | 瞬态失败不挡好镜像；消除「输入有误而不知道」 | A-006 |
| 探测方法 | HEAD/OPTIONS · GET 小资源 | GET 小资源 | 镜像服务对 HEAD/OPTIONS 支持参差、405 误报 | A-006 |
| 身份键 | 映射内容派生 · 镜像名 | 镜像名 | 名字填错属用户认知负担，不加内部复杂性 | A-006 |
| 未覆盖告知 | 静默 · host 聚合提示 | host 聚合提示 | 配置缺口可见，修复路径闭环 | spec（用户异议） |

## 任务清单

| 任务 ID | 标题 | 状态 | 分组 | 备注 |
| --- | --- | --- | --- | --- |
| `T-010` | 类型分发与映射模型重构 | done | 引擎 | 条目 {name, mappings}；rewriteUrl 双分支；键控按名字；DEFAULT_POOL 映射化 |
| `T-011` | 纯用户池存储与播种迁移 | done | 引擎 | pool 持久化、无键播种、旧键忽略 |
| `T-012` | 未覆盖告知 | done | 引擎 | 已知域未匹配按 host 聚合，设置页提示 |
| `T-013` | 池管理 UI 与可达性验证 | done | 配置 | 添加/删除/上移下移/自动首测/行级测试/重置联动 |
| `T-014` | 端到端验收 | done | 验收 | AC1-AC12 逐条核对（AC8 存量播种、AC11 重置全池首测） |

## 任务详情

### T-010 类型分发与映射模型重构

- 说明：MirrorCandidate 改为 {name, mappings}；rewriteUrl 按映射对逐对匹配（startsWith(from) → to + rest），统一承载前缀拼接与域名替换两形态；游标与引擎键控改按 name
- 验收：构建零错误 + lint 0 error 1 已知 warning + 改写/键控 27 用例全过（AC1、AC2 的改写正确性取得引擎级证据，运行时核对留 T-014）
- 实现记录：`MirrorCandidate` 改为 {name, mappings}（type/base/label 移除）；新增 `MappingPair {from, to}`；`rewriteUrl` 统一为映射对匹配——幂等判定（url 以任一规范化 to 开头则原样返回）→ from 命中 → normalizeTo(to) + url.slice(from.length)，前缀拼接与域名替换两形态由映射对写法自然承载（to 内嵌 from = 前缀式；to 为替换域 = 域名替换式），无需分派；`DEFAULT_POOL` 播种常量映射化（4 镜像 × github/raw 两映射，按实测可靠性排序）；`MirrorCursor.key()` 改返回 candidate.name（身份键 = 镜像名），activeBase 初始化/回退/resets 同步；`GITHUB_PREFIXES` 导出（T-012 未覆盖告知的已知域基准）；删除死代码 `normalizeMirrorBase`/`rewriteByPrefix`；install 拦截移除 candidate.type 门控（统一模型无 type）。证据：`npm run build` 零错误（修复 1 处 install 内 type 残留门控）、lint 0 error、27 用例（种子形态 ×4 / 前缀型 ×3 / 域名替换 ×3 / 边界 ×5 / 名字键控游标 ×9 / 判定回归 ×3）全过。注：种子按实测可靠性排序，gh-proxy.com 为唯一 E2E 验证项，其余为回退纵深（被动观测自动淘汰失效项）

### T-011 纯用户池存储与播种迁移

- 说明：TurboSettings.accelerator.pool 持久化；无 pool 键播种 DEFAULT_POOL；旧 mirrorBase 键忽略；引擎池来源切换为用户池
- 验收：构建零错误 + lint 0 error 1 已知 warning + 游标/池生命周期 17 用例全过（AC7 持久化、AC8 播种迁移的引擎级证据取得，运行时核对留 T-014）
- 实现记录：`AcceleratorConfig` 增 `pool: MirrorCandidate[]`（DEFAULT_ACCELERATOR_CONFIG.pool = [] 占位）；`MirrorCursor.setCatalog(catalog)`——替换目录引用，按镜像名清理已删除候选的孤儿连败/拉黑（不误伤沿用候选），active 失效或处于拉黑冷却时推进到首个可用候选；引擎新增 `setPool(pool)` 委托 setCatalog。`main.ts` loadSettings：无 `pool` 键（首装/存量数据）→ 深拷贝播种默认种子池并立即落盘（此后 pool 键存在不重复播种，AC8 路径）；onload 先 `setPool` 再 `install`。证据：`npm run build` 零错误、17 用例全过（前缀/域名替换改写、判定回归、失败推进、删 active 回首项、单候选停留、孤儿拉黑不外溢、重新入池从零计败、删拉黑 active 回退）。一处测试期望笔误（把失败推进误期望为停留原候选，第 7 处）经账本核对修正，实现语义未变
- 勘误（T-014 实测发现）：loadSettings 与 resetToInitialState 的播种源误接 DEFAULT_ACCELERATOR_CONFIG.pool（空占位）而非 DEFAULT_POOL——播种出空池，AC8 直接失败（node 单测未覆盖 main.ts 播种路径）。修复：两处播种源均改为深拷贝 DEFAULT_POOL；loadSettings 返回是否播种，onload 据此触发全池首测（全池首测触发语义①的落地补全）。node 单测未覆盖 main.ts 的局限照旧——E2E 为该路径的验收手段
- 种子集合定案（实现期实测筛选，2026-09-06 双探针实测 14 候选 → 4 可用，按耗时排序）：gh-proxy.com（0.53s）→ cors.isteed.cc（0.65s）→ ghproxy.net（0.82s）→ gh.ddlc.top（1.06s）；淘汰：ghproxy.link（200 内容指纹拦截）、ghps.cc（404）、ghproxy.cc / cf.ghproxy.cc / hub.gitmirror.com / github.scrmy.cn / gh.tbeds.top / gh.llkk.cc（连接失败）、ghfast.top / github.moeyy.xyz（本轮失联，与探索期可用状态相反——印证公共镜像波动）。用户已确认将 4 可用写入 DEFAULT_POOL

### T-012 未覆盖告知

- 说明：请求拦截时对未命中的 GitHub 已知域 URL 按 host 聚合记录；设置页显示未覆盖提示，映射补全后消失
- 验收：分类与 host 提取 8 用例全过 + 构建零错误；AC10 运行时核对留 T-014
- 实现记录：引擎在请求拦截处对「改写前后 url 未变且属已知域」的请求按 host 记入未覆盖集合（按当前流量实时增删——命中映射即清除该 host 标记）；导出 `isKnownGithubUrl`（已知域判定）与 `hostOf`（URL 解析容错回退原串）；`getUncovered()` 快照；`setPool`/`resetCursor` 清空集合（池变更后由真实流量重新评估）。设置页在标题区下新增提示行（1s 轮询跟随，覆盖时显示「⚠ 以下 GitHub 域未被任何镜像映射覆盖，当前直连：…」，无则隐藏）。证据：`npm run build` 零错误、17 用例全过（回归 9 + 分类与 host 提取 8）
- 勘误（T-014 AC10 实测发现，两项）：①未覆盖提示未出现——AC10 场景中「上移到第一位」只改池顺序，游标不跟随（游标仅在失败推进/成功稳定/显式复位时变化），请求仍走原 active（映射全覆盖）→ 未覆盖永不触发。修正：「目录即偏好」语义补全——**首项变更（重排/删首项）= 重新声明优先级，游标跟随新首项**（`setPool` 检测首项变更 → `cursor.resetToFirst()`，拉黑状态保留、冷却中则跳到首个可用）；`resetToFirst` 为不清运行态的轻量复位。②记录结构升级为 host → 未覆盖时经由的镜像名（用户定向：提示必须指出是哪个镜像的缺口），设置页提示展示「域名（经 镜像名）· 当前镜像：…」。证据：构建零错误 + 16 用例全过（新增 resetToFirst 首项/冷却跳过两例）
- 勘误（/sdd-accept 取证发现，2026-09-06）：「首项变更跟随」的检测依据存在**引用别名缺陷**——`setPool` 以 `this.pool[0]?.name !== pool[0]?.name` 判定首项变更，而 main.ts 池管理（上移/下移/删除）为原地变更后传**同一数组引用**，二者恒等 → UI 重排到首位或删首项后游标滞留旧 active。此前 E2E 的未覆盖场景经「删 active」的孤儿回退路径（setOrder 兜底）触发，未暴露此缺陷。最小复现：`setPool(pool)` → 原地交换前两项 → `setPool(pool)` → active 仍为旧首项（期望新首项）。修正：检测依据改为引擎自持快照 `lastFirst`（不与调用方数组别名），首项变更 → `setActive(新首项)`；首项未变的重排不误抢游标。证据：构建零错误 + 验收回归 47 用例全过（新增同引用原地重排/同引用删首项/首项未变不误抢/新数组重排 4 例，全部按 main.ts 真实调用模式构造）

### T-013 池管理 UI 与可达性验证

- 说明：池行（名字 + 两映射 + 上移/下移 + 删除 + 测试）+ 添加行（两映射必填 + 名字唯一校验）；添加后自动首测；行级测试显示 ✓ 耗时 / ✗ 原因；「恢复初始状态」池回种子并触发全池首测；1s 轮询实时跟随保留
- 验收：构建零错误 + lint 0 error 8 warning（均为已确认忽略类：声明式设置 API、URL 占位/描述的句首大小写）+ 改写回归用例全过；AC1/AC3/AC5/AC9/AC11 运行时核对留 T-014
- 实现记录：`settings.ts` 重构为池管理界面——①池条目行（Obsidian 已装插件列表风格）：collapsed 态 = 名字（可点击展开/收起映射详情，只读）+ 描述（当前使用/本会话已拉黑/最近测试结果）+ `...` 菜单（测试健康（可达性）/上移/下移/删除，最后一条删除禁用）；②添加表单：镜像名 + github/raw 两条映射的 to 地址（from 固定为两个标准 GitHub 前缀，to 的写法自然区分前缀拼接与域名替换），格式实时校验（非空/https 前缀/名字唯一），合法前按钮禁用；③「恢复初始状态」按钮改调 `resetToInitialState()`（池回种子 + 清运行态 + 全池首测）。引擎配套：`testMirror`（requestUrl GET 探测资源，`isMirrorFailure` 判定，结果喂记账）/`testAll`/`getTestResult`/`setPool` 清理孤儿测试记录/`switchNext`（手动切换复用推进语义）；`MirrorStatus` 增 `testResult`。样式：styles.css 增 `.turbo-clickable` 与 `.turbo-detail`。证据：`npm run build` 零错误、lint 0 error 8 warning（句首大小写类为 URL 字面量固有形态，确认忽略）、改写回归 8 用例全过。一处 TS 迭代（extraButton onClick 无事件参数 → 改挂 extraSettingsEl click 监听获取 MouseEvent）
- 勘误（T-014 实测发现，两项）：①「重置镜像切换状态」行在全量重写设置页时遗漏 → 补齐（文案按定稿：标题「恢复初始状态」、描述「清理插件的拉黑、失败次数，游标回到第一行主镜像」+ 池重建种子与全池首测新语义；点击调 `resetToInitialState()` + 即时 refresh）②添加表单尾斜杠未归一（trim 只去空白）→ submitAdd 改为剥全部尾斜杠后补单斜杠，杜绝 `github.co//` 双斜杠改写
- 勘误（T-014 A0 实测发现）：重构时遗漏「恢复初始状态」设置行 → 补齐（标题/描述按验收定稿文案，含池重建种子与全池首测的新语义；位于添加表单之后）
- 勘误（T-014 AC9 实测发现，用户实测 gith.com）：可达性测试原仅判 HTTP 状态码——停车/占位域名对任意路径返回 200 + 2 字节「OK」，被误判为可用 → 补 2xx 内容指纹校验（探测资源正文必含 `Obsidian` 标记，实测对照：真实 raw README 2877B 含标记 / gith.com 2B「OK」无标记），内容异常判 ✗ 并标注「疑似非镜像响应」；被动观测（judgeReply）维持仅状态码判定（市场流量内容异构，无统一指纹）
- 勘误（T-014 AC9 实测发现，用户异议「原测试只测 raw 不测 github」）：原单探针 URL 固定为 raw 域资源——只验证 raw 映射，github 映射从未被验证 → 升级为**双探针**：github 域与 raw 域各一，按候选映射分别改写后并发 GET，任一探针失败即记 1 败，结果分行展示（`✓/✗ github … · raw …`）；探测逻辑抽 `probeOne`（双层判定复用）。证据：构建零错误 + 回归 8 用例全过（用户可按 AC9 重测双探针结果）
- 探针资源定案（用户裁定不用第三方插件仓库， Obsidian 官方仓库 obsidianmd/obsidian-releases）：github 探针 = `github.com/obsidianmd/obsidian-releases/raw/HEAD/README.md`——github 域 /raw/ 路径经 302 重定向到 raw，与 release 下载的重定向链同构（顺带验证镜像跟随重定向能力），实测经镜像转发 200 / 2877B / 含 `Obsidian` ×8；raw 探针 = `raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/README.md`；双探针指纹均为 `Obsidian`，直连 github.com 挂起（120s 超时）恰好实证目标网络环境
- 勘误（T-014 验收脚本自身 9 处笔误/场景错误汇总，实现语义全程未变）：①/②期望沿用旧池顺序（cors 插入后未更新）×2；③账本注释 advance 方向写反 ×2；④解构遗漏（`const C` / `DEFAULT_POOL`）×2；⑤冷却断言复合表达式构造错误 ×1；⑥对非 active 候选失败误期望推进游标 ×1（该语义修正后为「自记连败不推游标」）；⑦把「解除后 3 败重新拉黑」误期望为不拉黑 ×1（重新预算语义下 3 败理应重新拉黑）。全部经最小复现 + 显式账本逐笔核对后修正
- T-013 验收期修正（用户实测「手动切换后当前镜像与池标记不一致」）：①游标抢夺缺陷——`record(候选, 成功)` 原无条件把 active 挪到该候选，任何迟成功回复（在途请求/镜像测试完成）都会把手动切换/失败回退拽回（yank）→ 修正为成功只清零该候选连败、不改变 active；游标仅由失败推进、手动切换、`stabilize` 显式稳定三种途径改变；②全池首测的预定位由「最后完成者赢得竞态」改为确定性后置稳定：`testAll` 完成后 `stabilize(首个 ok 且未拉黑候选)`；③设置页渲染统一为单次快照（`refresh` 取一次 `mirrorStatus` 传给 `renderPool`，输入框与池标记同源同帧）。证据：构建零错误 + 10 用例全过（新增「非 active 成功不抢夺游标」「stabilize 显式稳定」两例）
- 全池首测触发语义修正（用户实测「重启后种子首测缺失」）：运行态随插件重载清空，而原触发规则「重启（池沿用）不重测」导致重启后各行无状态可看 → 修正为跟随**加速会话边界**：插件启用且开关开（新会话开始）触发一轮全池首测；开关 off→on 属同一会话（运行态未清空）不重测（此前裁定保留）；恢复初始状态（池重建）照旧重测。实现：引擎 `ensureSessionTest()`（会话内至多一轮）+ onload 开关开时调用 + 开关 on 时调用

### T-014 端到端验收

- 说明：无代理环境逐条核对 AC1-AC12；AC8 需构造无 pool 键的存量数据；AC11 需调试构建构造坏镜像
- 验收：AC1-AC12 全部通过（用户实测确认，2026-09-05 ~ 09-06 多轮）
- 实现记录：实测跨四轮进行，随测随修随验：①首轮发现播种源误接（空池）→ 修复后重测；②次轮发现已持久化的 `pool: []` 抑制再播种 → 播种条件改为按 length 判定（自愈历史空池）后重测；③「手动切换后当前镜像与池标记不一致」→ 定位游标抢夺缺陷（成功记账无条件捕获 active）并修正（成功只清零连败）+ 设置页单次快照渲染，用户确认「手动切换响应速度很快，符合要求」；④「种子首测缺失」→ 触发语义修正（跟随加速会话边界：插件启用且开关开 / 恢复初始状态 / 池重建），用户确认恢复；⑤「gith.com 健康测试误通过」→ 实测取证（HTTP 200 / 2B「OK」停车页）后补 2xx 内容指纹校验，内容异常判 ✗；⑥「原测试只测 raw 不测 github」→ 升级双探针（github 域 raw 路径 + raw 域 README，均取自 obsidianmd/obsidian-releases 官方仓库；直连 github.com 120s 挂起恰好实证目标网络）；⑦「尾斜杠未归一致双斜杠改写」→ submitAdd 剥全部尾斜杠补单斜杠；⑧「重排后游标不跟随 + 未覆盖提示未出现且缺镜像名」→ 目录即偏好语义补全（首项变更游标跟随新首项）+ 未覆盖记录携带镜像名并展示；⑨ /sdd-accept 取证（2026-09-06）发现 ⑧ 的首项检测存在引用别名缺陷（原地变更传同引用致恒等）→ 修正为引擎自持 `lastFirst` 快照（详见 T-012 勘误），AC6/AC10 引擎级证据以验收回归 47 用例补强。逐条证据：AC1 ✓ test-prefix 添加入池自动首测并生效改写；AC2 ✓ test-hostmap 域名替换改写正确；AC3 ✓ 检查更新正常返回；AC4 ✓ 删除条目运行态清理、删 active 回首项；AC5 ✓ 池仅剩一条时删除禁用；AC6 ✓ 上移下移回退顺序跟随；AC7 ✓ 重启后池与顺序持久化；AC8 ✓ 存量数据自动播种；AC9 ✓ 双探针结果与实际可达性一致（gith.com 内容异常 ✗ / gh-proxy ✓）；AC10 ✓ 未覆盖提示出现与消失；AC11 ✓ 恢复初始状态池回种子 + 全池首测；AC12 ✓ 切换语义回归（手动切换响应快、失败推进、拉黑冷却）
