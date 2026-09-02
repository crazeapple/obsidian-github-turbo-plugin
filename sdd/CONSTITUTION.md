# obsidian-github-turbo-plugin SDD 治理宪法

## 层级与分区

- 三层实体：**Intent（I-XXX，总纲）**——模糊需求的产品层澄清与路线图，不进状态机；**Proposal（P-XXX）**——可独立验收的开发单元（基础件或功能块），真正的开发循环从这里开始；**Task（T-XXX，可数十个、可分组）**——design 任务清单内，禁止单独建文件。
- Proposal 粒度：必须是一个可独立验收的开发单元，禁止以产品版本形态立项（如「XX 第一版/首版」标题）；产品级、多交付物或模糊需求先入意向池拆解为总纲，再拆出 Proposal；两级拆分（I 拆 P、P 拆 T）不跨层。
- 受理两路：单交付物需求由 `/sdd-intake` 直接发 P（无 source）；多交付物或模糊需求先入 `INITIATIVE.md` 立 I，拆解后发 P（frontmatter `source: I-XXX`）。
- 分区治理：`sdd/exploring/`（探索区，格式宽松，文件数 = 活跃探索数 + 1，含 journal.md——追加式探索日志，行格式 `YYYY-MM-DD P-XXX 结论或去向`，只追加不重写；finalize 时追加处置行后随探索文件一并删除）与 `sdd/specs/`（稳定区，格式严格、变更留痕，每提案一目录：spec.md 与 design.md）物理分离；修正隔离在 `amendments/` 与意向池；归档只从稳定区取材。
- **不预建**运行态目录：exploring/、specs/、journal.md 均动态形成；INITIATIVE.md 与 amendments/README.md 由初始化生成。

## 权威源、ID 与日期

- INDEX 是 Proposal 状态**唯一权威源**，状态变更即时同步（操作即同步，不攒批）；INITIATIVE.md 是意向唯一记录；Task 状态唯一权威 = design 任务表；规格版本唯一维护处 = spec frontmatter `version`。
- I/P/T/A 四套编号各自全局递增，**永不复用、永不重排**（rejected 也占号）；P/T 发号统一在 INDEX 顶部计数器，I 号计数器位于 INITIATIVE.md 顶部，A 号计数器位于 amendments/README.md 顶部；取号后立即递增写回。
- **日期规则**：治理文档一切日期唯一源 = 执行写入的会话所在机器的系统日期（本地时区）；写入前必须以 `date +%F`（或等价）实取；禁止凭记忆或上下文推断；粒度 YYYY-MM-DD。

## 状态机（禁止跳跃）

- Proposal：`exploring → specified → implementing → verifying → accepted`；旁路 `on-hold`（任意态可入可回，排队/搁置两用）、`rejected`（终态，INDEX 备注列写原因）。
- Task：`todo / doing / blocked / done / dropped`（done、dropped 为终态；doing 即锁定，禁重复派发）；design：`draft → finalized`。
- **代码与 Task 绑定**：项目功能实现代码必须挂在 design 任务清单的具体 Task 上；Task 未拆分（exploring/specified）禁止写实现代码，仅产出探索与规格文档；代码随 Task 执行写入，验收未过回对应 Task 修正，禁止绕过 Task 直接改码。

## 受理与分流

- **维护/需求分类三问**：① 行为变化？（新能力/改变对外行为 = 需求；恢复既定或不改变 = 维护）② 方案空间？（存在真实选择 = 需求；路径唯一 = 维护）③ AC 自明性？（需协商定义 = 需求；自明 = 维护）。任一命中需求特征即立项；三问全维护 → 直接做，不立项。
- 分类四保险：**默认偏维护**（判不准一律按维护）；**停损升级**（维护中冒出方案选择或范围膨胀 → 当场停、补立项）；**口令优先**（分类仅为建议，用户一句终局）；**amendments 旁路**（维护暴露决策/设计错误 → 走 A-XXX）。例子锚点：改按钮颜色、修 typo、升依赖 = 维护；国际化、暗色主题、OpenAPI 文档 = 需求（XS 级）。
- **单/多交付物三问**：① AC 可写性——现在就能写出 1-3 条可核对的验收标准吗？② 边界可划性——范围内外现在就能划清吗？③ 交付物同质性——单一功能块，还是天然含多个异质交付物？≥2 问指向「要拆」→ 入意向池；否则直接发 P。
- 同类重复不算异质（「给 10 个字段加校验」是一个 P 的 10 个 Task）；拿不准时兜底一问用户：「想一口气做完，还是先立框架分期做？」
- **误入池出口**：池内拆解后发现实为单交付物 → 关闭 I 条目，直接发 P（无 source）；直接 P 发现要拆 → 探索产物回填意向池升格。判错可恢复，均非事故。
- **判定示例**：用户登录功能——大功能但复杂性全在工程层（认证选型），产品结构上是一块，单交付物，直接发 P；完整账号体系（个人/企业、SSO、组织权限）——产品级意向需路线图，入池立 I 拆解。

## 状态转换 × 文档同步矩阵

| 转换 | 必做操作 |
|---|---|
| intake 判定单交付物 →exploring | 模板建 exploring/P-XXX.md + INDEX 加行 |
| intake 判定多交付物 →意向池 | INITIATIVE.md 立 I 条目（原文保留 + 路线图） |
| I 拆出发号 →exploring | 模板建 exploring/P-XXX.md（frontmatter `source: I-XXX`）+ INDEX 加行 |
| exploring→specified（/sdd-finalize） | 建规格 + 被否备选以 rejected 进 amendments/ + 探索追加 journal 后删活跃文件 + INDEX 更新 |
| specified→implementing（/sdd-split） | 建 design 骨架 + 任务入清单 + INDEX 更新 |
| 任一 Task 状态变化 | 仅更新 design 任务表 + 任务详情小节回填 |
| 全任务 done →verifying | INDEX 置 verifying + 显式建议 /sdd-accept |
| verifying→accepted（/sdd-accept） | AC 逐条**以实际证据**核对 + design 置 finalized + INDEX 更新 + 完成回报固定建议「回看需求组拆下一个」 |
| I 完结 | 组内全部 P accepted → I 条目标完结（归档时并入 requirements.md 后移除） |
| →on-hold / rejected | INDEX 改状态 + journal 追加处置行（rejected 须写原因） |
| 定稿后需求变更 | 规格正文 + changelog + version 递增（v1.0 → v1.1）+ 受影响 Task 评估，禁静默覆盖 |
| 归档（/sdd-archive） | INDEX 置「已归档 + 日期」+ 四产物 + 完结 I 条目并入 requirements.md + sdd 全区只读 |

## 会话微流程 R1-R9（写入宪法）

R1 冷启动读 CONSTITUTION → INDEX → INITIATIVE，输出状态摘要（含意向池概览：活跃 I 数、待梳理条目、未立项里程碑）｜R2 新想法当场分类（维护/需求三问）：维护直接做并回报；需求一律经 /sdd-intake 受理——单交付物直接发号，多交付物先落意向池；当前工作永不因新想法自动中断｜R3 探索期自顶向下、先发散后收敛、逐层留痕（实时写入探索文件）｜R4 被否备选禁删，留「方案 + 一句话原因」，关键选型另进 amendments/｜R5 实现中新需求：小则 Task 内消化回填，改验收标准则停手上报由用户定｜R6 更新任务表 + 回填 design，全 done 建议 /sdd-accept｜R7 关键节点（拆任务/定稿/验收/归档）显式建议对应命令保人工确认；accept 完成回报固定建议回看需求组｜R8 不改 templates/，tools/ 仅随 Markdown 规范演进修改；稳定区禁自由格式；归档后只读；写/改任何 sdd 文档后必须运行 mdLint，零 error 方可回报完成（warning 逐条确认或忽略）｜R9 跨周期修正禁只改代码，走 amendments/。

## 自治边界（判断自动，动作守门；写入宪法）

| 层级 | 事项 |
|---|---|
| 自动执行，做完告知 | 维护/需求分类判断、维护直接做、新想法落池、三问执行、XS 产物极短化、R1 摘要、board 聚合 |
| 判断 + 明示理由，可一句话推翻 | 建议立项、on-hold 排队建议 |
| 永远用户守门 | 发号（P）、授予 I、finalize、accept、停损升级、archive、写实现代码 |

## Markdown 书写规范（宪法此节以本节为唯一规格源；mdlint.sh 按此实现）

- **语法总则**：遵循 CommonMark/GFM 语法，结构符号一律半角（列表标记、链接括号、标题 `#`、表格 `|` 与 `-` 分隔行）；强调一律 `*` 禁 `_`；行内代码反引号与加粗 `**` 成对闭合；标识符与含 `*`、`_`、`<`、`&`、`~`、`|` 的片段入行内代码
- **混排层**：中文正文标点全角（，。：；？！、（）「」——）且成对闭合；中文与英文/数字/半角符号之间加一个半角空格（× 表倍数时与数字紧贴，如「模板 ×4」），标点/代码边界处不加（按渲染后中英边界判断；强调与行内代码标记不构成边界）；中文正文引用标记只用「」或半角直引号 ""；半角引号等半角符号与中文相邻时，两侧须加空格；命令、路径、代码、ID（I-001/P-001/T-001/A-001）用行内代码包裹；破折号「——」、省略号「……」、空值占位单个 `—`（仅表格与字段）、范围号紧贴 `-`（`R1-R9`）、禁用 `–`；列表项短语结尾不加标点、整句加中文句号；表格单元格不加句号；专有名词保持原大小写（README、CLAUDE.md）；无序列表统一 `-`、有序列表统一 `1.`
- **语义层**：算式与维度一律紧凑（`1+2`、`3-2=1`、`4×5`、`4×4 矩阵`、`n×m`）；`+`、`-`、`=` 不机械检查（区间、复合词、散文等号合法）；× 连接中文两侧加空格（状态转换 × 文档同步）；倍数写「模板 ×4」；计数比一律 `/`（3/8），`×` 禁表计数比或分隔；流程用「→」；并列用「与/·」

- **校验**：`sh sdd/tools/mdlint.sh <文件或目录>`（POSIX sh + awk + perl，macOS 自带零依赖）。检查集按 AI 作者错误分布校准。error：反引号或 `**` 行内不配对、全角圆括号/直角引号文件级不配对；warning：中英文粘连（剥离行内代码后）、无序列表标记非 `-`、表格行列数与表头不一致（GFM 会静默补空或丢弃）。检查豁免代码围栏与行内代码内容。零 error 方可回报，warning 逐条确认或忽略。

mdlint.sh 实现后必须以下列向量自测全过方可视为达标：

| 自测向量 | 预期 |
|---|---|
| 行内反引号单只不闭合 | error |
| 中文与英文直接粘连（剥离行内代码后） | warning |
| 上述任一情形位于代码围栏或行内代码内 | 豁免 |
| 「模板 ×4」倍数紧贴写法 | 无输出 |

## 修正机制（amendments/，跨周期）

- **一案一文件**：`amendments/A-XXX-<短标题>.md`（ADR 目录惯例），文件内容 = `# A-XXX 标题（日期，关联 P-XXX / T-XXX）` + `状态：active | rejected | superseded by A-YYY` + 决策（一句话）→ 理由 → 否决备选（X——为什么不选）→ 影响范围。
- A 号计数器位于 amendments/README.md 顶部，永不复用。
- 跨周期替换四步：① 新建 A 条目说明替换方案与原因 ② 旧 A 标 superseded by 新 A ③ 更新受影响规格（升版 + changelog）与 design 关键决策表 ④ 评估 INDEX 中依赖该决策的其他提案。

## 意向池（INITIATIVE.md）

- **地位**：意向唯一记录；顶层计数器 `next-I`；文件常态只保留活跃需求组。
- **I 条目格式**：

```
## I-XXX <一句话需求>（YYYY-MM-DD · 活跃 | 完结 | 丢弃）
> 原始念头：<用户原话逐字保留>
- 产品澄清：<对话沉淀>
- 路线图：<里程碑 / 子产品顺序>
```

- **不记录 P 指向**：组归属由 P frontmatter `source` 推导，避免双重记账。
- **raw 便签**：未成熟念头为无编号条目，随时可删除；梳理成熟原地升格为 I。
- **滚动立项**：accept 后回看需求组拆下一个；组内全部 P accepted → I 标完结。
- **插单**：新想法落池不打断当前工作；不立刻做的 P 置 on-hold 排队。

## 并行开发（可选节）

/sdd-start 默认单智能体一步到位；仅用户明确要求时切「派发-回收」两段式：主会话组装自包含任务简报（任务+验收标准+规格/设计节选）派发（Claude Code 以 todo 承载；OpenCode 会话以对话分派替代，规则相同）；回收逐条核验、统一更新。约束：sdd/ 文档只允许主会话写入，子智能体只读文档、写代码、对话回报，发现规格问题回报主会话走 R5。

## 归档（/sdd-archive）

四产物：`requirements.md`（仅 accepted 项、剔 changelog/frontmatter、rejected 不出现，其信息由「范围外」章节承载，并含完结 I 条目内容作为需求来源章节）；`design.md`（整合全部 finalized design、剔任务表等过程内容）；`amendment-log.md`（整合全部修正案，按主题分组，保留完整 superseded 生命周期链）；`REUSE-GUIDE.md`（四步：归档时 AI 可按域或模块对 requirements.md 自由分组组织，无需预定义域枚举；在新项目安装 sdd 插件（marketplace `star-sdd`）并执行 `/sdd:sdd-init` 生成治理体系 → 逐提案比对差异（采纳/调整/排除，排除必须写入新项目修正记录说明原因）→ 参照旧设计制新设计（冲突时优先参考 superseded 链防重蹈覆辙）→ 正常推进）。

生效日期：2026-09-02
